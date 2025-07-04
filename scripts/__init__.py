"""
Walks Bank OCR - Backend Python Package
Sistema de OCR para documentos bancários
"""

__version__ = "1.0.0"
__author__ = "Walks Bank Team"
__description__ = "Sistema de OCR para processamento de documentos bancários"

# Imports principais para facilitar uso do pacote
from .config import config
from .celery_app import celery_app

__all__ = [
    'config',
    'celery_app'
]
