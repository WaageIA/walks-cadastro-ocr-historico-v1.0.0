from flask import Flask, request, jsonify, g
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
import redis
from celery import Celery
from pydantic import ValidationError
import os
import time
import uuid

# Imports locais
from scripts.config import config
from scripts.models import (
    DocumentUploadRequest,
    SingleDocumentRequest,
    TaskCreatedResponse,
    TaskStatusResponse,
    ErrorResponse,
    HealthCheckResponse,
    ValidationResponse
)
from scripts.logging_config import setup_logging, get_logger, add_correlation_id
from scripts.celery_tasks import process_document_ocr, process_audio_transcription

# Configurar logging
loggers = setup_logging(
    service_name="walks_bank_api",
    log_level=os.getenv('LOG_LEVEL', 'INFO'),
    log_file=os.getenv('LOG_FILE', 'logs/api.log'),
    enable_console=True,
    enable_json=os.getenv('ENVIRONMENT', 'development') == 'production'
)

logger = loggers['api']
performance_logger = loggers['performance']

# Inicializar Flask
app = Flask(__name__)

# Configurações de segurança
app.config['SECRET_KEY'] = os.getenv('FLASK_SECRET_KEY', 'dev-secret-change-in-production')
app.config['MAX_CONTENT_LENGTH'] = int(os.getenv('MAX_FILE_SIZE', 10 * 1024 * 1024))

# Configurar CORS
allowed_origins = os.getenv('ALLOWED_ORIGINS', 'http://localhost:3000').split(',')
CORS(app,
     origins=allowed_origins,
     allow_headers=['Content-Type', 'Authorization', 'X-Correlation-ID'],
     expose_headers=['X-Correlation-ID'],
     supports_credentials=os.getenv('CORS_ALLOW_CREDENTIALS', 'true').lower() == 'true')

# Configurar Rate Limiting
limiter = Limiter(
    key_func=get_remote_address,
    default_limits=[
        f"{os.getenv('RATE_LIMIT_PER_MINUTE', 60)} per minute",
        f"{os.getenv('RATE_LIMIT_PER_HOUR', 1000)} per hour"
    ]
)
limiter.init_app(app)

# Configurar Celery
if config:
    celery_app = Celery(
        app.import_name,
        broker=config.celery.broker_url,
        backend=config.celery.result_backend
    )
    celery_app.conf.update(
        task_serializer='json',
        accept_content=['json'],
        result_serializer='json',
        timezone='America/Sao_Paulo',
        enable_utc=True,
    )
else:
    logger.error("Configuração não carregada - sistema não funcionará corretamente")
    celery_app = None

# Redis para health checks
try:
    redis_client = redis.from_url(os.getenv('REDIS_URL', 'redis://localhost:6379/0'))
except Exception as e:
    logger.error(f"Erro ao conectar Redis: {e}")
    redis_client = None

# Middleware para correlation ID e logging
@app.before_request
def before_request():
    """Middleware executado antes de cada request"""
    correlation_id = request.headers.get('X-Correlation-ID') or str(uuid.uuid4())
    g.correlation_id = correlation_id
    g.start_time = time.time()
    add_correlation_id(correlation_id)
    logger.info(
        f"Request iniciado: {request.method} {request.path}",
        extra={
            'endpoint': request.endpoint,
            'method': request.method,
            'remote_addr': request.remote_addr,
            'user_agent': request.headers.get('User-Agent', '')
        }
    )

@app.after_request
def after_request(response):
    """Middleware executado após cada request"""
    if hasattr(g, 'start_time'):
        duration = (time.time() - g.start_time) * 1000
        response.headers['X-Correlation-ID'] = g.correlation_id
        performance_logger.log_api_request(
            endpoint=request.endpoint or request.path,
            method=request.method,
            duration_ms=duration,
            status_code=response.status_code,
            user_id=None # Você pode adicionar o ID do usuário aqui se tiver um sistema de login
        )
        logger.info(
            f"Request concluído: {request.method} {request.path} - {response.status_code} - {duration:.2f}ms",
            extra={
                'endpoint': request.endpoint,
                'method': request.method,
                'status_code': response.status_code,
                'duration': duration
            }
        )
    return response

# Error handlers
@app.errorhandler(ValidationError)
def handle_validation_error(e):
    """Handler para erros de validação Pydantic"""
    logger.warning(f"Erro de validação: {e}")
    validation_errors = []
    for error in e.errors():
        field = '.'.join(str(loc) for loc in error['loc'])
        validation_errors.append({'field': field, 'message': error['msg'], 'value': str(error.get('input', ''))})
    return jsonify(ErrorResponse(error="Dados inválidos", error_code="VALIDATION_ERROR", validation_errors=validation_errors).model_dump(exclude_none=True)), 400

@app.errorhandler(413)
def handle_file_too_large(e):
    """Handler para arquivos muito grandes"""
    logger.warning(f"Arquivo muito grande: {e}")
    return jsonify(ErrorResponse(error="Arquivo muito grande", error_code="FILE_TOO_LARGE", validation_errors=[{'field': 'file', 'message': f"Tamanho máximo permitido é {app.config['MAX_CONTENT_LENGTH']} bytes"}]).model_dump(exclude_none=True)), 413

@app.errorhandler(429)
def handle_rate_limit(e):
    """Handler para rate limiting"""
    logger.warning(f"Rate limit excedido: {e.description}")
    return jsonify(ErrorResponse(error="Muitas requisições", error_code="RATE_LIMIT_EXCEEDED").model_dump(exclude_none=True)), 429

@app.errorhandler(500)
def handle_internal_error(e):
    """Handler para erros internos"""
    logger.error(f"Erro interno: {e}", exc_info=True)
    return jsonify(ErrorResponse(error="Erro interno do servidor", error_code="INTERNAL_ERROR").model_dump(exclude_none=True)), 500

# Routes
@app.route('/health', methods=['GET'])
def health_check():
    """Health check detalhado"""
    try:
        services = {}
        overall_status = "healthy"
        # Verificar Redis
        try:
            if redis_client:
                redis_client.ping()
                services['redis'] = {'status': 'healthy'}
            else:
                raise ConnectionError("Redis client não inicializado")
        except Exception as e:
            services['redis'] = {'status': 'unhealthy', 'error': str(e)}
            overall_status = "degraded"
        # Verificar Celery
        try:
            if celery_app:
                inspect = celery_app.control.inspect(timeout=1)
                active_workers = inspect.active()
                if active_workers:
                    services['celery'] = {'status': 'healthy', 'workers': len(active_workers)}
                else:
                    services['celery'] = {'status': 'degraded', 'message': 'Nenhum worker ativo'}
                    overall_status = "degraded"
            else:
                raise ConnectionError("Celery não inicializado")
        except Exception as e:
            services['celery'] = {'status': 'unhealthy', 'error': str(e)}
            overall_status = "degraded"

        response = HealthCheckResponse(status=overall_status, services=services, version=os.getenv('APP_VERSION', '1.0.0'))
        status_code = 200 if overall_status == "healthy" else 503
        return jsonify(response.model_dump()), status_code
    except Exception as e:
        logger.error(f"Erro no health check: {e}", exc_info=True)
        return jsonify(ErrorResponse(error="Erro no health check", error_code="HEALTH_CHECK_ERROR").model_dump()), 500


@app.route('/api/process-documents', methods=['POST'])
@limiter.limit("10 per minute")
def process_documents():
    """Processar múltiplos documentos"""
    try:
        request_data = request.get_json()
        if not request_data:
            return jsonify(ErrorResponse(error="JSON inválido ou vazio", error_code="INVALID_JSON").model_dump()), 400
        validated_request = DocumentUploadRequest(**request_data)
        logger.info(f"Iniciando processamento de {len(validated_request.documents)} documentos", extra={'document_types': list(validated_request.documents.keys())})
        task = process_document_ocr.delay(validated_request.documents)
        response = TaskCreatedResponse(task_id=task.id, message="Documentos enfileirados para processamento", documents_count=len(validated_request.documents), document_types=list(validated_request.documents.keys()), estimated_time="30-60 segundos", correlation_id=g.correlation_id)
        logger.info(f"Tarefa criada com sucesso: {task.id}", extra={'task_id': task.id})
        return jsonify(response.model_dump()), 202
    except ValidationError as e:
        return handle_validation_error(e)
    except Exception as e:
        return handle_internal_error(e)

@app.route('/api/task-status/<task_id>', methods=['GET'])
def get_task_status(task_id: str):
    """Verificar status de uma tarefa"""
    try:
        if not celery_app:
            raise Exception("Celery não configurado")
        task = celery_app.AsyncResult(task_id)
        response_data = {'task_id': task_id, 'status': task.state, 'correlation_id': g.correlation_id}
        if task.state == 'PENDING':
            response_data.update({'message': 'Tarefa aguardando processamento', 'progress': 0})
        elif task.state == 'PROCESSING':
            meta = task.info or {}
            response_data.update({'message': meta.get('status', 'Processando...'), 'progress': meta.get('progress', 0), 'current_document': meta.get('current_document'), 'phase': meta.get('phase')})
        elif task.state == 'SUCCESS':
            response_data.update({'message': 'Processamento concluído com sucesso', 'progress': 100, 'result': task.result})
        elif task.state == 'FAILURE':
            error_info = task.info or {}
            response_data.update({'message': 'Processamento falhou', 'progress': 0, 'error': str(error_info.get('error', 'Erro desconhecido'))})
        else:
            response_data['message'] = f'Status: {task.state}'
            response_data['progress'] = 0
        response = TaskStatusResponse(**response_data)
        return jsonify(response.model_dump()), 200
    except Exception as e:
        return handle_internal_error(e)

@app.route('/api/cancel-task/<task_id>', methods=['POST'])
def cancel_task(task_id: str):
    """Cancelar uma tarefa"""
    try:
        if not celery_app:
            raise Exception("Celery não configurado")
        celery_app.control.revoke(task_id, terminate=True)
        logger.info(f"Tarefa {task_id} cancelada", extra={'task_id': task_id})
        return jsonify({'success': True, 'message': 'Tarefa cancelada com sucesso', 'task_id': task_id}), 200
    except Exception as e:
        return handle_internal_error(e)


# Inicialização
def init_app():
    """Inicializar aplicação"""
    logger.info("Inicializando Walks Bank API")
    if not config or not os.getenv('OPENROUTER_API_KEY'):
        logger.error("Configuração crítica ausente - aplicação não pode iniciar")
        return False
    try:
        if redis_client:
            redis_client.ping()
            logger.info("Conexão Redis OK")
        else:
            raise ConnectionError("Redis client não inicializado")
    except Exception as e:
        logger.error(f"Erro na conexão Redis: {e}")
        return False
    logger.info("API inicializada com sucesso")
    return True

if __name__ == '__main__':
    if init_app():
        host = os.getenv('FLASK_HOST', '0.0.0.0')
        port = int(os.getenv('FLASK_PORT', 5000))
        debug = os.getenv('FLASK_DEBUG', 'False').lower() == 'true'
        logger.info(f"Iniciando servidor Flask em {host}:{port} (debug={debug})")
        app.run(host=host, port=port, debug=debug, threaded=True)
    else:
        logger.error("Falha na inicialização - servidor não iniciado")
        exit(1)
