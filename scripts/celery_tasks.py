"""
Tasks assíncronas do Celery para processamento OCR
Refatorado para eliminar dependências circulares
"""

import os
import json
import logging
import requests
import glob
from datetime import datetime, timedelta
from typing import Dict, Any, Optional, List
from celery.exceptions import Retry

# Import da instância única do Celery
from scripts.celery_app import celery_app
from scripts.config import config

# Configurar logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Imports condicionais para evitar dependências circulares
def get_ocr_processor():
    """Factory function para OCRProcessor - evita import circular"""
    try:
        from scripts.ocr_integration import WalksBankOCR
        return WalksBankOCR(api_key=config.ocr.api_key if config else None)
    except ImportError as e:
        logger.error(f"Erro ao importar OCRProcessor: {e}")
        return None

def save_uploaded_file(file_data: Dict[str, Any]) -> str:
    """Salva arquivo temporário para processamento"""
    import base64
    import tempfile
    
    try:
        # Decodificar base64
        file_content = base64.b64decode(file_data['content'])
        
        # Criar arquivo temporário
        suffix = os.path.splitext(file_data.get('filename', 'temp.jpg'))[1]
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
            temp_file.write(file_content)
            return temp_file.name
            
    except Exception as e:
        logger.error(f"Erro ao salvar arquivo temporário: {e}")
        raise

def cleanup_temp_files(file_paths: List[str]) -> None:
    """Remove arquivos temporários"""
    for file_path in file_paths:
        try:
            if os.path.exists(file_path):
                os.remove(file_path)
                logger.debug(f"Arquivo temporário removido: {file_path}")
        except Exception as e:
            logger.warning(f"Erro ao remover arquivo {file_path}: {e}")

@celery_app.task(bind=True, max_retries=3, default_retry_delay=60)
def process_document_ocr(self, documents: Dict[str, Any]) -> Dict[str, Any]:
    """
    Task para processar documentos com OCR
    
    Args:
        documents: Dicionário com documentos para processar
        
    Returns:
        Dict com resultado do processamento
    """
    task_id = self.request.id
    logger.info(f"Iniciando processamento OCR - Task ID: {task_id}")
    
    try:
        # Validar configuração
        if not config:
            raise Exception("Configuração não carregada")
        
        # Atualizar status inicial
        self.update_state(
            state='PROCESSING',
            meta={
                'status': 'Inicializando processamento...',
                'progress': 5,
                'timestamp': datetime.now().isoformat()
            }
        )
        
        # Inicializar processador OCR
        ocr_processor = get_ocr_processor()
        if not ocr_processor:
            raise Exception("Falha ao inicializar processador OCR")
        
        # Processar cada documento
        results = {}
        total_docs = len(documents)
        
        for i, (doc_type, doc_data) in enumerate(documents.items()):
            try:
                logger.info(f"Processando documento {i+1}/{total_docs}: {doc_type}")
                
                # Atualizar progresso
                progress = 10 + (i * 70 // total_docs)
                self.update_state(
                    state='PROCESSING',
                    meta={
                        'status': f'Processando {doc_type}...',
                        'progress': progress,
                        'current_document': doc_type,
                        'timestamp': datetime.now().isoformat()
                    }
                )
                
                # Salvar arquivo temporário se necessário
                temp_file_path = None
                if isinstance(doc_data, dict) and 'content' in doc_data:
                    temp_file_path = save_uploaded_file(doc_data)
                    file_path = temp_file_path
                else:
                    file_path = doc_data  # Assumir que é um caminho
                
                logger.debug(f"Arquivo para processamento {doc_type}: {file_path}")
                
                # Processar OCR usando asyncio de forma síncrona
                import asyncio
                try:
                    loop = asyncio.get_event_loop()
                except RuntimeError:
                    loop = asyncio.new_event_loop()
                    asyncio.set_event_loop(loop)
                
                logger.info(f"Iniciando OCR para {doc_type}")
                ocr_result = loop.run_until_complete(
                    ocr_processor.process_document(file_path, doc_type)
                )
                
                # Log detalhado do resultado
                logger.info(f"OCR {doc_type} concluído - Sucesso: {ocr_result.get('success', False)}")
                if ocr_result.get('quality_metrics'):
                    metrics = ocr_result['quality_metrics']
                    logger.info(f"Qualidade {doc_type}: {metrics.get('score', 0):.1f}% - Campos: {metrics.get('found_fields', [])}")
                
                if not ocr_result.get('success', False):
                    logger.warning(f"Falha no OCR {doc_type}: {ocr_result.get('error', 'Erro desconhecido')}")
                
                results[doc_type] = {
                    'success': ocr_result.get('success', False),
                    'data': ocr_result.get('parsed_data', {}),
                    'raw_text': ocr_result.get('raw_text'),
                    'quality_metrics': ocr_result.get('quality_metrics', {}),
                    'processed_at': datetime.now().isoformat(),
                    'error': ocr_result.get('error') if not ocr_result.get('success', False) else None
                }
                
                # Limpar arquivo temporário
                if temp_file_path:
                    cleanup_temp_files([temp_file_path])
                    logger.debug(f"Arquivo temporário removido: {temp_file_path}")
            
            except Exception as doc_error:
                logger.error(f"Erro crítico ao processar documento {doc_type}: {str(doc_error)}")
                logger.error(f"Stack trace: ", exc_info=True)
                results[doc_type] = {
                    'success': False,
                    'error': f'Erro crítico: {str(doc_error)}',
                    'processed_at': datetime.now().isoformat()
                }
        
        # Finalizar processamento
        self.update_state(
            state='PROCESSING',
            meta={
                'status': 'Consolidando resultados...',
                'progress': 90,
                'timestamp': datetime.now().isoformat()
            }
        )
        
        # Consolidar dados do cliente
        if ocr_processor:
            consolidated_data = ocr_processor.consolidate_customer_data(results)
        else:
            consolidated_data = {'error': 'OCR processor não disponível'}
        
        # Preparar resultado final
        successful_results = [r for r in results.values() if r.get('success', False)]
        failed_results = [r for r in results.values() if not r.get('success', False)]
        
        final_result = {
            'task_id': task_id,
            'success': len(successful_results) > 0,
            'total_documents': total_docs,
            'successful_documents': len(successful_results),
            'failed_documents': len(failed_results),
            'results': results,
            'consolidated_data': consolidated_data,
            'processing_time': datetime.now().isoformat()
        }
        
        # Log detalhado dos resultados finais
        successful_docs = [doc for doc, result in results.items() if result.get('success', False)]
        failed_docs = [doc for doc, result in results.items() if not result.get('success', False)]

        logger.info(f"=== RESUMO PROCESSAMENTO OCR - Task ID: {task_id} ===")
        logger.info(f"Total documentos: {total_docs}")
        logger.info(f"Sucessos: {len(successful_docs)} - {successful_docs}")
        logger.info(f"Falhas: {len(failed_docs)} - {failed_docs}")

        for doc_type, result in results.items():
            if result.get('success'):
                fields = list(result.get('data', {}).keys())
                logger.info(f"✅ {doc_type}: {len(fields)} campos extraídos - {fields}")
            else:
                error = result.get('error', 'Erro desconhecido')
                logger.warning(f"❌ {doc_type}: {error}")

        logger.info("=" * 60)
        
        logger.info(f"Processamento OCR concluído - Task ID: {task_id}")
        return final_result
        
    except Exception as exc:
        logger.error(f"Erro no processamento OCR - Task ID: {task_id}: {str(exc)}")
        
        # Retry logic
        if self.request.retries < self.max_retries:
            logger.info(f"Tentando novamente... Tentativa {self.request.retries + 1}/{self.max_retries}")
            raise self.retry(exc=exc, countdown=60 * (self.request.retries + 1))
        
        # Falha final
        return {
            'task_id': task_id,
            'success': False,
            'error': str(exc),
            'timestamp': datetime.now().isoformat()
        }

@celery_app.task(bind=True, max_retries=2)
def process_audio_transcription(self, audio_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Task para processar transcrição de áudio
    
    Args:
        audio_data: Dados do áudio para transcrição
        
    Returns:
        Dict com resultado da transcrição
    """
    task_id = self.request.id
    logger.info(f"Iniciando transcrição de áudio - Task ID: {task_id}")
    
    try:
        # Atualizar status
        self.update_state(
            state='PROCESSING',
            meta={
                'status': 'Transcrevendo áudio...',
                'progress': 20,
                'timestamp': datetime.now().isoformat()
            }
        )
        
        # Inicializar processador OCR
        ocr_processor = get_ocr_processor()
        if not ocr_processor:
            raise Exception("Falha ao inicializar processador OCR")
        
        # Processar transcrição (implementação futura)
        # Por enquanto, retornar placeholder
        transcription_result = {
            'text': 'Transcrição de áudio não implementada ainda',
            'confidence': 0.0,
            'duration': audio_data.get('duration', 0)
        }
        
        # Atualizar progresso
        self.update_state(
            state='PROCESSING',
            meta={
                'status': 'Finalizando transcrição...',
                'progress': 90,
                'timestamp': datetime.now().isoformat()
            }
        )
        
        result = {
            'task_id': task_id,
            'success': True,
            'transcription': transcription_result,
            'duration': audio_data.get('duration', 0),
            'timestamp': datetime.now().isoformat()
        }
        
        logger.info(f"Transcrição de áudio concluída - Task ID: {task_id}")
        return result
        
    except Exception as exc:
        logger.error(f"Erro na transcrição de áudio - Task ID: {task_id}: {str(exc)}")
        
        if self.request.retries < self.max_retries:
            raise self.retry(exc=exc, countdown=30 * (self.request.retries + 1))
        
        return {
            'task_id': task_id,
            'success': False,
            'error': str(exc),
            'timestamp': datetime.now().isoformat()
        }

@celery_app.task
def send_webhook_notification(webhook_url: str, data: Dict[str, Any]) -> bool:
    """
    Task para enviar notificações via webhook
    
    Args:
        webhook_url: URL do webhook
        data: Dados para enviar
        
    Returns:
        bool: Sucesso do envio
    """
    try:
        logger.info(f"Enviando webhook para: {webhook_url}")
        
        response = requests.post(
            webhook_url,
            json=data,
            headers={
                'Content-Type': 'application/json',
                'User-Agent': 'WalksBank-OCR/1.0.0'
            },
            timeout=30
        )
        
        response.raise_for_status()
        logger.info(f"Webhook enviado com sucesso: {webhook_url}")
        return True
        
    except Exception as exc:
        logger.error(f"Erro ao enviar webhook {webhook_url}: {str(exc)}")
        return False

@celery_app.task
def cleanup_old_files() -> Dict[str, Any]:
    """
    Task de manutenção para limpar arquivos antigos
    
    Returns:
        Dict com estatísticas da limpeza
    """
    logger.info("Iniciando limpeza de arquivos antigos")
    
    try:
        # Limpar uploads antigos (mais de 24 horas)
        uploads_dir = os.getenv('UPLOAD_FOLDER', '/tmp/uploads')
        cutoff_time = datetime.now() - timedelta(hours=24)
        
        cleaned_files = 0
        total_size = 0
        
        if os.path.exists(uploads_dir):
            for file_path in glob.glob(os.path.join(uploads_dir, "*")):
                try:
                    file_stat = os.stat(file_path)
                    file_time = datetime.fromtimestamp(file_stat.st_mtime)
                    
                    if file_time < cutoff_time:
                        file_size = file_stat.st_size
                        os.remove(file_path)
                        cleaned_files += 1
                        total_size += file_size
                        logger.debug(f"Arquivo removido: {file_path}")
                        
                except Exception as file_error:
                    logger.warning(f"Erro ao processar arquivo {file_path}: {str(file_error)}")
        
        # Limpar logs antigos (mais de 7 dias)
        logs_dir = "logs"
        log_cutoff = datetime.now() - timedelta(days=7)
        
        if os.path.exists(logs_dir):
            for log_file in glob.glob(os.path.join(logs_dir, "*.log.*")):
                try:
                    file_stat = os.stat(log_file)
                    file_time = datetime.fromtimestamp(file_stat.st_mtime)
                    
                    if file_time < log_cutoff:
                        os.remove(log_file)
                        logger.debug(f"Log removido: {log_file}")
                        
                except Exception as log_error:
                    logger.warning(f"Erro ao processar log {log_file}: {str(log_error)}")
        
        result = {
            'success': True,
            'cleaned_files': cleaned_files,
            'total_size_mb': round(total_size / (1024 * 1024), 2),
            'timestamp': datetime.now().isoformat()
        }
        
        logger.info(f"Limpeza concluída: {cleaned_files} arquivos removidos ({result['total_size_mb']} MB)")
        return result
        
    except Exception as exc:
        logger.error(f"Erro na limpeza de arquivos: {str(exc)}")
        return {
            'success': False,
            'error': str(exc),
            'timestamp': datetime.now().isoformat()
        }
