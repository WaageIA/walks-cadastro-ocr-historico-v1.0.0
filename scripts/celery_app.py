from celery import Celery
from celery.schedules import crontab
import os
from dotenv import load_dotenv

# Carregar variáveis de ambiente
load_dotenv()

def make_celery():
    """Cria e configura a aplicação Celery"""
    
    # URL do Redis
    redis_url = os.getenv('REDIS_URL', 'redis://localhost:6379/0')
    
    # Criar aplicação Celery
    celery = Celery(
        'walks_bank_ocr',
        broker=redis_url,
        backend=redis_url,
        include=['scripts.celery_tasks']
    )
    
    # Configurações do Celery
    celery.conf.update(
        # Configurações de resultado
        result_expires=3600,  # 1 hora
        result_persistent=True,
        
        # Configurações de tarefa
        task_serializer='json',
        accept_content=['json'],
        result_serializer='json',
        timezone='America/Sao_Paulo',
        enable_utc=True,
        
        # Configurações de worker
        worker_prefetch_multiplier=1,
        task_acks_late=True,
        worker_max_tasks_per_child=1000,
        task_track_started=True,
        task_time_limit=300,  # 5 minutos
        task_soft_time_limit=240,  # 4 minutos
        worker_disable_rate_limits=False,
        
        # Configurações de retry
        task_default_retry_delay=60,
        task_max_retries=3,
        
        # Configurações de roteamento
        task_default_queue='ocr_queue',
        task_routes={
            'scripts.celery_tasks.process_document_ocr': {'queue': 'ocr_queue'},
            'scripts.celery_tasks.process_audio_transcription': {'queue': 'audio_queue'},
            'scripts.celery_tasks.cleanup_old_files': {'queue': 'maintenance_queue'},
            'scripts.celery_tasks.send_webhook_notification': {'queue': 'webhook_queue'},
        },
        
        # Configurações de monitoramento
        worker_send_task_events=True,
        task_send_sent_event=True,
        
        # Configurações de beat (tarefas periódicas)
        beat_schedule={
            'cleanup-old-files': {
                'task': 'scripts.celery_tasks.cleanup_old_files',
                'schedule': crontab(hour=2, minute=0),  # Todo dia às 2:00
            },
        }
    )
    
    return celery

# Instância global única do Celery
celery_app = make_celery()

if __name__ == '__main__':
    celery_app.start()
