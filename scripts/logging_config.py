"""
Configuração de logs estruturados para o sistema Walks Bank OCR
"""

import logging
import logging.config
import json
import sys
import os
from datetime import datetime
from typing import Dict, Any, Optional
import traceback
from pathlib import Path

class StructuredFormatter(logging.Formatter):
    """
    Formatter personalizado para logs estruturados em JSON
    """

    def __init__(self, service_name: str = "walks_bank_ocr", version: str = "1.0.0"):
        super().__init__()
        self.service_name = service_name
        self.version = version
        self.hostname = os.getenv('HOSTNAME', 'localhost')
        self.environment = os.getenv('ENVIRONMENT', 'development')

    def format(self, record: logging.LogRecord) -> str:
        """
        Formata o log record em JSON estruturado
        """
        log_entry = {
            "timestamp": datetime.fromtimestamp(record.created).isoformat(),
            "service": self.service_name,
            "version": self.version,
            "environment": self.environment,
            "hostname": self.hostname,
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "module": record.module,
            "function": record.funcName,
            "line": record.lineno,
            "thread": record.thread,
            "thread_name": record.threadName,
            "process": record.process,
        }
        if hasattr(record, 'correlation_id'):
            log_entry["correlation_id"] = record.correlation_id
        if hasattr(record, 'user_id'):
            log_entry["user_id"] = record.user_id
        if hasattr(record, 'request_id'):
            log_entry["request_id"] = record.request_id
        if hasattr(record, 'extra_data'):
            log_entry["extra"] = record.extra_data
        if record.exc_info:
            log_entry["exception"] = {
                "type": record.exc_info[0].__name__ if record.exc_info[0] else None,
                "message": str(record.exc_info[1]) if record.exc_info[1] else None,
                "traceback": traceback.format_exception(*record.exc_info)
            }
        if "celery" in record.name.lower():
            log_entry["component"] = "celery"
            if hasattr(record, 'task_id'):
                log_entry["task_id"] = record.task_id
        elif "flask" in record.name.lower():
            log_entry["component"] = "api"
            if hasattr(record, 'endpoint'):
                log_entry["endpoint"] = record.endpoint
            if hasattr(record, 'method'):
                log_entry["method"] = record.method
        elif "ocr" in record.name.lower():
            log_entry["component"] = "ocr"
            if hasattr(record, 'document_type'):
                log_entry["document_type"] = record.document_type
        if hasattr(record, 'duration'):
            log_entry["duration_ms"] = record.duration
        if hasattr(record, 'memory_usage'):
            log_entry["memory_mb"] = record.memory_usage
        return json.dumps(log_entry, ensure_ascii=False, default=str)

class ContextFilter(logging.Filter):
    """
    Filtro para adicionar contexto automático aos logs
    """
    def filter(self, record: logging.LogRecord) -> bool:
        record.timestamp_unix = record.created
        if not hasattr(record, 'process'):
            record.process = os.getpid()
        return True

class PerformanceLogger:
    """
    Logger especializado para métricas de performance
    """
    def __init__(self, logger_name: str = "walks_bank_ocr.performance"):
        self.logger = logging.getLogger(logger_name)

    def log_api_request(self,
                       endpoint: str,
                       method: str,
                       duration_ms: float,
                       status_code: int,
                       user_id: str = None):
        """Log de requisição API"""
        extra = {
            'endpoint': endpoint,
            'method': method,
            'duration': duration_ms,
            'status_code': status_code,
            'user_id': user_id,
            'extra_data': {
                'type': 'api_request',
                'performance': {
                    'duration_ms': duration_ms,
                    'status_code': status_code
                }
            }
        }
        level = logging.WARNING if duration_ms > 5000 else logging.INFO
        self.logger.log(level, f"API {method} {endpoint} - {duration_ms:.2f}ms - {status_code}", extra=extra)

    def log_ocr_processing(self,
                          document_type: str,
                          duration_ms: float,
                          success: bool,
                          confidence: float = None,
                          task_id: str = None):
        """Log de processamento OCR"""
        extra = {
            'document_type': document_type,
            'duration': duration_ms,
            'task_id': task_id,
            'extra_data': {
                'type': 'ocr_processing',
                'performance': {
                    'duration_ms': duration_ms,
                    'success': success,
                    'confidence': confidence
                }
            }
        }
        level = logging.INFO if success else logging.ERROR
        status = "SUCCESS" if success else "FAILED"
        self.logger.log(level, f"OCR {document_type} - {status} - {duration_ms:.2f}ms", extra=extra)

    def log_celery_task(self,
                       task_name: str,
                       task_id: str,
                       duration_ms: float,
                       success: bool,
                       retry_count: int = 0):
        """Log de tarefa Celery"""
        extra = {
            'task_id': task_id,
            'duration': duration_ms,
            'extra_data': {
                'type': 'celery_task',
                'task_name': task_name,
                'performance': {
                    'duration_ms': duration_ms,
                    'success': success,
                    'retry_count': retry_count
                }
            }
        }
        level = logging.INFO if success else logging.ERROR
        status = "COMPLETED" if success else "FAILED"
        self.logger.log(level, f"Task {task_name} - {status} - {duration_ms:.2f}ms", extra=extra)

def setup_logging(
    service_name: str = "walks_bank_ocr",
    log_level: str = "INFO",
    log_file: Optional[str] = None,
    enable_console: bool = True,
    enable_json: bool = True
) -> Dict[str, Any]:
    """
    Configura o sistema de logging estruturado
    """
    if log_file:
        log_dir = Path(log_file).parent
        log_dir.mkdir(parents=True, exist_ok=True)
    config = {
        'version': 1,
        'disable_existing_loggers': False,
        'formatters': {
            'structured': {'()': StructuredFormatter, 'service_name': service_name, 'version': os.getenv('APP_VERSION', '1.0.0')},
            'simple': {'format': '%(asctime)s - %(name)s - %(levelname)s - [%(correlation_id)s] - %(message)s', 'datefmt': '%Y-%m-%d %H:%M:%S'}
        },
        'filters': {'context_filter': {'()': ContextFilter}},
        'handlers': {},
        'loggers': {
            'walks_bank_ocr': {'level': log_level, 'handlers': [], 'propagate': False},
            'walks_bank_ocr.api': {'level': log_level, 'handlers': [], 'propagate': False},
            'walks_bank_ocr.celery': {'level': log_level, 'handlers': [], 'propagate': False},
            'walks_bank_ocr.ocr': {'level': log_level, 'handlers': [], 'propagate': False},
            'walks_bank_ocr.performance': {'level': log_level, 'handlers': [], 'propagate': False}
        },
        'root': {'level': log_level, 'handlers': []}
    }
    if enable_console:
        config['handlers']['console'] = {
            'class': 'logging.StreamHandler', 'level': log_level, 'formatter': 'structured' if enable_json else 'simple',
            'filters': ['context_filter'], 'stream': sys.stdout
        }
        for logger_name in config['loggers']:
            config['loggers'][logger_name]['handlers'].append('console')
        config['root']['handlers'].append('console')
    if log_file:
        config['handlers']['file'] = {
            'class': 'logging.handlers.RotatingFileHandler', 'level': log_level, 'formatter': 'structured' if enable_json else 'simple',
            'filters': ['context_filter'], 'filename': log_file, 'maxBytes': 50 * 1024 * 1024, 'backupCount': 5, 'encoding': 'utf-8'
        }
        for logger_name in config['loggers']:
            config['loggers'][logger_name]['handlers'].append('file')
        config['root']['handlers'].append('file')
    logging.config.dictConfig(config)
    loggers = {
        'main': logging.getLogger('walks_bank_ocr'),
        'api': logging.getLogger('walks_bank_ocr.api'),
        'celery': logging.getLogger('walks_bank_ocr.celery'),
        'ocr': logging.getLogger('walks_bank_ocr.ocr'),
        'performance': PerformanceLogger()
    }
    loggers['main'].info("Sistema de logging configurado", extra={'extra_data': {'config': {'service_name': service_name, 'log_level': log_level, 'log_file': log_file, 'enable_console': enable_console, 'enable_json': enable_json}}})
    return loggers

def get_logger(name: str = "walks_bank_ocr") -> logging.Logger:
    """Obtém um logger configurado"""
    return logging.getLogger(name)

def add_correlation_id(correlation_id: str):
    """Adiciona correlation ID ao contexto de logging"""
    old_factory = logging.getLogRecordFactory()
    def record_factory(*args, **kwargs):
        record = old_factory(*args, **kwargs)
        record.correlation_id = correlation_id
        return record
    logging.setLogRecordFactory(record_factory)

def log_with_context(logger: logging.Logger, level: int, message: str, **context):
    """Log com contexto adicional"""
    extra = {'extra_data': context}
    logger.log(level, message, extra=extra)
