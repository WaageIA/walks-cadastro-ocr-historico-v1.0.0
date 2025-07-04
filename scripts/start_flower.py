#!/usr/bin/env python3
"""
Script para iniciar o Flower (monitoramento Celery)
"""

import os
import sys
from celery_app import celery_app

def main():
    """Inicia o Flower para monitoramento"""
    print("🌸 Iniciando Flower - Monitor Celery")
    print("=" * 40)
    
    # Verificar Redis
    try:
        ping_result = celery_app.control.ping()
        if not ping_result:
            print("❌ Redis não está respondendo")
            sys.exit(1)
        print("✅ Conexão com Redis OK")
    except Exception as e:
        print(f"❌ Erro ao conectar com Redis: {e}")
        sys.exit(1)
    
    port = os.getenv('FLOWER_PORT', 5555)
    
    print(f"\n🌐 Flower será iniciado em:")
    print(f"   http://localhost:{port}")
    print("\n📊 Funcionalidades disponíveis:")
    print("   - Monitor de tarefas em tempo real")
    print("   - Estatísticas de workers")
    print("   - Histórico de execuções")
    print("   - Controle de tarefas")
    
    print("\n" + "=" * 40)
    print("Flower pronto! Pressione Ctrl+C para parar")
    print("=" * 40)
    
    try:
        # Iniciar Flower
        celery_app.control.flower([
            f'--port={port}',
            '--broker_api=http://localhost:15672/api/',
            '--basic_auth=admin:admin'
        ])
    except KeyboardInterrupt:
        print("\n👋 Flower parado pelo usuário")
    except Exception as e:
        print(f"\n❌ Erro no Flower: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
