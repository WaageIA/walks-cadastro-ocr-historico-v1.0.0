#!/usr/bin/env python3
"""
Script para iniciar o servidor OCR do Walks Bank
"""

import os
import sys
from flask_api import app, init_ocr
from config import config

def check_requirements():
    """Verifica se todos os requisitos estão atendidos"""
    print("🔍 Verificando requisitos...")
    
    # Verificar API Key
    api_key = os.getenv('OPENROUTER_API_KEY')
    if not api_key:
        print("❌ OPENROUTER_API_KEY não configurada")
        print("   Configure com: export OPENROUTER_API_KEY='sua_chave_aqui'")
        return False
    else:
        print(f"✅ API Key configurada: {api_key[:10]}...")
    
    # Verificar dependências
    try:
        import flask
        import requests
        import PIL
        print("✅ Dependências Python instaladas")
    except ImportError as e:
        print(f"❌ Dependência faltando: {e}")
        print("   Execute: pip install -r requirements.txt")
        return False
    
    return True

def main():
    """Função principal"""
    print("🚀 Iniciando servidor OCR Walks Bank")
    print("=" * 50)
    
    # Verificar requisitos
    if not check_requirements():
        print("\n❌ Falha na verificação de requisitos")
        sys.exit(1)
    
    # Inicializar OCR
    print("\n🤖 Inicializando cliente OCR...")
    if not init_ocr():
        print("❌ Falha ao inicializar OCR")
        sys.exit(1)
    
    print("✅ OCR inicializado com sucesso")
    
    # Configurações do servidor
    host = os.getenv('FLASK_HOST', '0.0.0.0')
    port = int(os.getenv('FLASK_PORT', 5000))
    debug = os.getenv('FLASK_DEBUG', 'True').lower() == 'true'
    
    print(f"\n📡 Servidor configurado:")
    print(f"   Host: {host}")
    print(f"   Porta: {port}")
    print(f"   Debug: {debug}")
    
    print(f"\n🌐 Endpoints disponíveis:")
    print(f"   GET  http://localhost:{port}/health")
    print(f"   POST http://localhost:{port}/api/process-documents")
    print(f"   POST http://localhost:{port}/api/process-single-document")
    print(f"   POST http://localhost:{port}/api/validate-data")
    
    print(f"\n🔗 Frontend React deve apontar para:")
    print(f"   http://localhost:{port}")
    
    print("\n" + "=" * 50)
    print("🎯 Servidor pronto! Pressione Ctrl+C para parar")
    print("=" * 50)
    
    try:
        app.run(
            host=host,
            port=port,
            debug=debug,
            threaded=True
        )
    except KeyboardInterrupt:
        print("\n\n👋 Servidor parado pelo usuário")
    except Exception as e:
        print(f"\n❌ Erro ao iniciar servidor: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
