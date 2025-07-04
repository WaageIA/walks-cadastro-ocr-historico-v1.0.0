import os
from dataclasses import dataclass, field
from typing import Dict, List, Optional
import logging

logger = logging.getLogger(__name__)

@dataclass
class OCRConfig:
    """Configurações do OCR com validação"""
    api_key: str
    api_url: str = 'https://api.openrouter.ai/api/v1/chat/completions'
    model: str = "qwen/qwen2.5-vl-32b-instruct:free"
    max_tokens: int = 1000
    temperature: float = 0.1
    timeout: int = 30
    max_file_size: int = 10 * 1024 * 1024  # 10MB

    def __post_init__(self):
        """Validação após inicialização"""
        if not self.api_key:
            raise ValueError("OPENROUTER_API_KEY é obrigatória")

        if len(self.api_key) < 20:
            raise ValueError("OPENROUTER_API_KEY parece inválida (muito curta)")

        if self.max_tokens < 100 or self.max_tokens > 4000:
            raise ValueError("max_tokens deve estar entre 100 e 4000")

        if self.temperature < 0 or self.temperature > 2:
            raise ValueError("temperature deve estar entre 0 e 2")

@dataclass
class RedisConfig:
    """Configurações do Redis com validação"""
    url: str
    socket_timeout: int = 5
    socket_connect_timeout: int = 5
    retry_on_timeout: bool = True
    max_connections: int = 20

    def __post_init__(self):
        """Validação após inicialização"""
        if not self.url:
            raise ValueError("REDIS_URL é obrigatória")

        if not (self.url.startswith('redis://') or self.url.startswith('rediss://')):
            raise ValueError("REDIS_URL deve começar com redis:// ou rediss://")

@dataclass
class CeleryConfig:
    """Configurações do Celery"""
    broker_url: str
    result_backend: str
    task_serializer: str = 'json'
    accept_content: List[str] = field(default_factory=lambda: ['json'])
    result_serializer: str = 'json'
    timezone: str = 'America/Sao_Paulo'
    enable_utc: bool = True
    worker_prefetch_multiplier: int = 1
    task_acks_late: bool = True
    worker_max_tasks_per_child: int = 1000
    task_default_retry_delay: int = 60
    task_max_retries: int = 3

@dataclass
class ValidationRules:
    """Regras de validação com padrões robustos"""
    required_fields: List[str]
    cnpj_pattern: str = r'^\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2}$'
    cpf_pattern: str = r'^\d{3}\.\d{3}\.\d{3}-\d{2}$'
    # CORRIGIDO: Padrão de telefone com `$$` e `$$`
    phone_pattern: str = r'^$$\d{2}$$\s\d{4,5}-\d{4}$'
    cep_pattern: str = r'^\d{5}-\d{3}$'
    email_pattern: str = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'

    # Limites de tamanho
    max_text_length: int = 500
    max_file_size: int = 10 * 1024 * 1024  # 10MB
    min_confidence_score: float = 0.7

class EnvironmentValidator:
    """Validador de variáveis de ambiente"""

    REQUIRED_VARS = {
        'OPENROUTER_API_KEY': {
            'description': 'Chave da API OpenRouter para OCR',
            'min_length': 20,
            'example': 'sk-or-v1-...'
        },
        'REDIS_URL': {
            'description': 'URL de conexão com Redis',
            'min_length': 10,
            'example': 'redis://localhost:6379/0'
        }
    }

    OPTIONAL_VARS = {
        'CELERY_CONCURRENCY': {'description': 'Número de workers Celery', 'default': '2', 'type': int},
        'CELERY_MAX_TASKS_PER_CHILD': {'description': 'Máximo de tarefas por worker', 'default': '10', 'type': int},
        'CELERY_LOG_LEVEL': {'description': 'Nível de log do Celery', 'default': 'info', 'options': ['debug', 'info', 'warning', 'error']},
        'FLASK_HOST': {'description': 'Host do servidor Flask', 'default': '0.0.0.0'},
        'FLASK_PORT': {'description': 'Porta do servidor Flask', 'default': '5000', 'type': int},
        'FLASK_DEBUG': {'description': 'Modo debug do Flask', 'default': 'True', 'type': bool},
        'FLOWER_PORT': {'description': 'Porta do Flower', 'default': '5555', 'type': int},
        'OCR_MAX_RETRIES': {'description': 'Número máximo de tentativas OCR', 'default': '3', 'type': int},
        'OCR_RETRY_BASE_DELAY': {'description': 'Delay base entre tentativas (segundos)', 'default': '2.0', 'type': float},
        'OCR_RETRY_MAX_DELAY': {'description': 'Delay máximo entre tentativas (segundos)', 'default': '30.0', 'type': float},
        'OCR_RETRY_STRATEGY': {'description': 'Estratégia de retry', 'default': 'exponential_backoff', 'options': ['exponential_backoff', 'fixed_delay', 'immediate']},
        'OCR_QUALITY_THRESHOLD': {'description': 'Threshold mínimo de qualidade (%)', 'default': '60.0', 'type': float}
    }

    @classmethod
    def validate_all(cls) -> Dict[str, any]:
        """Valida todas as variáveis de ambiente"""
        results = {
            'valid': True,
            'errors': [],
            'warnings': [],
            'config': {}
        }

        # Validar variáveis obrigatórias
        for var_name, config in cls.REQUIRED_VARS.items():
            value = os.getenv(var_name)

            if not value:
                results['valid'] = False
                results['errors'].append({
                    'variable': var_name, 'error': 'Variável não configurada',
                    'description': config['description'], 'example': config.get('example', '')
                })
                continue

            if len(value) < config.get('min_length', 1):
                results['valid'] = False
                results['errors'].append({
                    'variable': var_name, 'error': f'Valor muito curto (mínimo: {config["min_length"]} caracteres)',
                    'description': config['description']
                })
                continue

            if 'KEY' in var_name or 'PASSWORD' in var_name:
                masked_value = f"{value[:8]}..." if len(value) > 8 else "***"
                results['config'][var_name] = masked_value
            else:
                results['config'][var_name] = value

        # Processar variáveis opcionais
        for var_name, config in cls.OPTIONAL_VARS.items():
            value_str = os.getenv(var_name, config['default'])
            value = value_str

            # Converter tipo se necessário
            if 'type' in config:
                try:
                    if config['type'] == bool:
                        value = value_str.lower() in ('true', '1', 'yes', 'on')
                    else: # int ou float
                        value = config['type'](value_str)
                except (ValueError, TypeError):
                    results['warnings'].append({
                        'variable': var_name, 'warning': f'Valor inválido "{value_str}", usando padrão: {config["default"]}',
                        'description': config['description']
                    })
                    # Reverter para o padrão convertido corretamente
                    default_str = config['default']
                    if config['type'] == bool:
                        value = default_str.lower() in ('true', '1', 'yes', 'on')
                    else:
                        value = config['type'](default_str)


            if 'options' in config and value not in config['options']:
                results['warnings'].append({
                    'variable': var_name, 'warning': f'Valor não reconhecido, opções válidas: {config["options"]}',
                    'description': config['description']
                })

            results['config'][var_name] = value

        return results

class WalksBankConfig:
    """Configuração principal do sistema com validação robusta"""

    def __init__(self):
        env_validation = EnvironmentValidator.validate_all()

        if not env_validation['valid']:
            error_msg = "Erro na configuração do ambiente:\n"
            for error in env_validation['errors']:
                error_msg += f"  ❌ {error['variable']}: {error['error']}\n"
                error_msg += f"    {error['description']}\n"
                if error.get('example'):
                    error_msg += f"    Exemplo: {error['example']}\n"
            
            logger.error(error_msg)
            raise ValueError(error_msg)

        for warning in env_validation['warnings']:
            logger.warning(f"⚠️  {warning['variable']}: {warning['warning']}")

        self.redis = RedisConfig(url=os.getenv('REDIS_URL'))
        self.ocr = OCRConfig(api_key=os.getenv('OPENROUTER_API_KEY'))
        self.celery = CeleryConfig(broker_url=self.redis.url, result_backend=self.redis.url)
        self.validation = ValidationRules(
            required_fields=[
                'empresa', 'cnpj', 'email', 'celular',
                'cep', 'endereco', 'nome_completo', 'cpf',
                'banco', 'agencia', 'conta'
            ]
        )

        self.supported_formats = {
            'rg': ['.jpg', '.jpeg', '.png', '.pdf'],
            'cnpj': ['.jpg', '.jpeg', '.png', '.pdf'],
            'address': ['.jpg', '.jpeg', '.png', '.pdf'],
            'facade': ['.jpg', '.jpeg', '.png']
        }

        self.document_types = {
            'rg': 'Documento de Identidade (RG)',
            'cnpj': 'Comprovante CNPJ',
            'address': 'Comprovante de Endereço',
            'facade': 'Foto da Fachada'
        }

        self.server = {
            'host': os.getenv('FLASK_HOST', '0.0.0.0'),
            'port': int(os.getenv('FLASK_PORT', '5000')),
            'debug': os.getenv('FLASK_DEBUG', 'True').lower() == 'true'
        }

        self.worker = {
            'concurrency': int(os.getenv('CELERY_CONCURRENCY', '2')),
            'max_tasks_per_child': int(os.getenv('CELERY_MAX_TASKS_PER_CHILD', '10')),
            'loglevel': os.getenv('CELERY_LOG_LEVEL', 'info'),
            'queues': 'ocr_queue'
        }

        self.retry = {
            'max_retries': int(os.getenv('OCR_MAX_RETRIES', '3')),
            'base_delay': float(os.getenv('OCR_RETRY_BASE_DELAY', '2.0')),
            'max_delay': float(os.getenv('OCR_RETRY_MAX_DELAY', '30.0')),
            'strategy': os.getenv('OCR_RETRY_STRATEGY', 'exponential_backoff'),
            'quality_threshold': float(os.getenv('OCR_QUALITY_THRESHOLD', '60.0'))
        }

        logger.info("✅ Configuração validada e carregada com sucesso")

    def get_banks_list(self) -> List[str]:
        """Lista de bancos suportados"""
        return [
            "001 - Banco do Brasil", "237 - Bradesco", "104 - Caixa Econômica Federal",
            "341 - Itaú", "033 - Santander", "260 - Nu Pagamentos (Nubank)",
            "077 - Banco Inter", "208 - BTG Pactual", "756 - Sicoob",
            "748 - Sicredi", "212 - Banco Original", "290 - PagSeguro",
            "323 - Mercado Pago", "380 - PicPay"
        ]

    def get_summary(self) -> Dict[str, any]:
        """# CORRIGIDO: Retorna um sumário da configuração para verificação"""
        return {
            'status': 'valid', # Simplificado, a validação já acontece no __init__
            'components': {
                'Redis': self.redis.url,
                'OCR Model': self.ocr.model,
                'Celery Backend': self.celery.result_backend[:30] + '...',
                'Flask Server': f"http://{self.server['host']}:{self.server['port']}"
            },
            'validation': {
                'redis_configured': bool(self.redis.url),
                'api_key_configured': bool(self.ocr.api_key),
                'required_fields_set': bool(self.validation.required_fields)
            },
            'document_types': len(self.document_types),
            'supported_banks': len(self.get_banks_list())
        }


# Instância global de configuração
try:
    config = WalksBankConfig()
except Exception as e:
    logger.error(f"❌ Falha fatal ao carregar configuração: {e}")
    config = None

# Alias para compatibilidade (se necessário)
Config = config
# Exemplo de uso para testar o arquivo
if __name__ == "__main__":
    print("=== CONFIGURAÇÃO WALKS BANK OCR ===")

    if config is None:
        print("❌ Configuração não pôde ser carregada.")
        print("Verifique os erros acima e configure as variáveis de ambiente necessárias no arquivo .env")
        exit(1)

    # CORRIGIDO: Chamando o método que agora existe
    summary = config.get_summary()

    print(f"Status: {'✅ Válida' if summary['status'] == 'valid' else '❌ Inválida'}")
    print(f"Tipos de documento: {summary['document_types']}")
    print(f"Bancos suportados: {summary['supported_banks']}")

    print(f"\nComponentes:")
    for component, details in summary['components'].items():
        print(f"  {component}: {details}")

    print(f"\nValidações:")
    for check, status in summary['validation'].items():
        print(f"  {check}: {'✅' if status else '❌'}")

    if summary['status'] != 'valid':
        print("\n⚠️  Corrija os problemas de configuração antes de continuar")
