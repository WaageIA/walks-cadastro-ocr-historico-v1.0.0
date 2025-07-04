#!/usr/bin/env python3
"""
Script para iniciar o worker Celery com verificações robustas
"""

import os
import sys
import time
import redis
import logging
from celery_app import celery_app

# Configurar logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

def check_redis_connection(max_retries=5, retry_delay=2):
    """
    Verifica conexão com Redis com retry automático
    
    Args:
        max_retries: Número máximo de tentativas
        retry_delay: Delay entre tentativas em segundos
        
    Returns:
        bool: True se conectou com sucesso
    """
    redis_url = os.getenv('REDIS_URL', 'redis://localhost:6379/0')
    
    for attempt in range(max_retries):
        try:
            logger.info(f"Tentativa {attempt + 1}/{max_retries} - Conectando ao Redis...")
            
            # Criar cliente Redis
            redis_client = redis.from_url(redis_url, socket_timeout=5, socket_connect_timeout=5)
            
            # Testar conexão
            redis_client.ping()
            
            # Testar operações básicas
            test_key = "celery_worker_test"
            redis_client.set(test_key, "test_value", ex=10)
            value = redis_client.get(test_key)
            redis_client.delete(test_key)
            
            if value == b"test_value":
                logger.info("✅ Conexão com Redis estabelecida e testada com sucesso")
                return True
            else:
                raise Exception("Falha no teste de operações Redis")
                
        except redis.ConnectionError as e:
            logger.warning(f"❌ Erro de conexão Redis (tentativa {attempt + 1}): {e}")
        except redis.TimeoutError as e:
            logger.warning(f"❌ Timeout na conexão Redis (tentativa {attempt + 1}): {e}")
        except Exception as e:
            logger.warning(f"❌ Erro inesperado Redis (tentativa {attempt + 1}): {e}")
        
        if attempt < max_retries - 1:
            logger.info(f"⏳ Aguardando {retry_delay}s antes da próxima tentativa...")
            time.sleep(retry_delay)
            retry_delay *= 1.5  # Backoff exponencial
    
    return False

def check_celery_broker():
    """Verifica se o Celery consegue se conectar ao broker"""
    try:
        logger.info("🔍 Verificando conexão Celery com broker...")
        
        # Tentar ping no Celery
        ping_result = celery_app.control.ping(timeout=10)
        
        if ping_result:
            logger.info("✅ Celery conectado ao broker com sucesso")
            return True
        else:
            logger.warning("⚠️  Nenhum worker Celery respondeu ao ping")
            return True  # Ainda pode iniciar o primeiro worker
            
    except Exception as e:
        logger.error(f"❌ Erro na conexão Celery: {e}")
        return False

def validate_environment():
    """Valida variáveis de ambiente essenciais"""
    logger.info("🔧 Validando variáveis de ambiente...")
    
    required_vars = {
        'OPENROUTER_API_KEY': 'Chave da API OpenRouter para OCR',
        'REDIS_URL': 'URL de conexão com Redis'
    }
    
    missing_vars = []
    
    for var, description in required_vars.items():
        value = os.getenv(var)
        if not value:
            missing_vars.append(f"  - {var}: {description}")
            logger.error(f"❌ {var} não configurada")
        else:
            # Mascarar valores sensíveis nos logs
            if 'KEY' in var or 'PASSWORD' in var:
                masked_value = f"{value[:8]}..." if len(value) > 8 else "***"
                logger.info(f"✅ {var}: {masked_value}")
            else:
                logger.info(f"✅ {var}: {value}")
    
    if missing_vars:
        logger.error("❌ Variáveis de ambiente obrigatórias não configuradas:")
        for var in missing_vars:
            logger.error(var)
        logger.error("\n💡 Configure as variáveis e tente novamente:")
        logger.error("   export OPENROUTER_API_KEY='sua_chave_aqui'")
        logger.error("   export REDIS_URL='redis://localhost:6379/0'")
        return False
    
    logger.info("✅ Todas as variáveis de ambiente estão configuradas")
    return True

def main():
    """Função principal com verificações robustas"""
    logger.info("🔄 Iniciando Celery Worker com verificações robustas")
    logger.info("=" * 60)
    
    # 1. Validar ambiente
    if not validate_environment():
        logger.error("❌ Falha na validação do ambiente")
        sys.exit(1)
    
    # 2. Verificar Redis
    if not check_redis_connection():
        logger.error("❌ Não foi possível conectar ao Redis após múltiplas tentativas")
        logger.error("💡 Soluções possíveis:")
        logger.error("   1. Verifique se o Redis está rodando: redis-server")
        logger.error("   2. Verifique a URL do Redis: echo $REDIS_URL")
        logger.error("   3. Teste a conexão: redis-cli ping")
        sys.exit(1)
    
    # 3. Verificar Celery
    if not check_celery_broker():
        logger.error("❌ Falha na verificação do Celery")
        sys.exit(1)
    
    # 4. Configurações do worker
    worker_config = {
        'concurrency': int(os.getenv('CELERY_CONCURRENCY', '2')),
        'max_tasks_per_child': int(os.getenv('CELERY_MAX_TASKS_PER_CHILD', '10')),
        'loglevel': os.getenv('CELERY_LOG_LEVEL', 'info'),
        'queues': os.getenv('CELERY_QUEUES', 'ocr_queue'),
    }
    
    logger.info("🚀 Configuração do Worker:")
    for key, value in worker_config.items():
        logger.info(f"   {key}: {value}")
    
    logger.info("\n📋 Filas e Tarefas:")
    logger.info("   Filas: ocr_queue")
    logger.info("   Tarefas disponíveis:")
    logger.info("     - process_documents_task")
    logger.info("     - process_single_document_task")
    logger.info("     - cleanup_old_results")
    
    logger.info("\n" + "=" * 60)
    logger.info("✅ Worker pronto! Pressione Ctrl+C para parar")
    logger.info("=" * 60)
    
    try:
        # Iniciar worker com configurações
        celery_app.worker_main([
            'worker',
            f'--loglevel={worker_config["loglevel"]}',
            f'--queues={worker_config["queues"]}',
            f'--concurrency={worker_config["concurrency"]}',
            f'--max-tasks-per-child={worker_config["max_tasks_per_child"]}',
            '--without-gossip',  # Reduz overhead de rede
            '--without-mingle',  # Reduz tempo de startup
            '--without-heartbeat',  # Para desenvolvimento
        ])
    except KeyboardInterrupt:
        logger.info("\n👋 Worker parado pelo usuário")
    except Exception as e:
        logger.error(f"\n❌ Erro crítico no worker: {e}")
        logger.exception("Detalhes do erro:")
        sys.exit(1)

if __name__ == "__main__":
    main()
