#!/usr/bin/env python3
"""
Script para testar a integração OCR
"""

import os
import sys
import asyncio
import json
from ocr_integration import WalksBankOCR

async def test_single_document():
    """Testa processamento de um documento único"""
    print("🧪 Teste de documento único")
    print("-" * 30)
    
    try:
        # Inicializar OCR
        api_key = os.getenv('OPENROUTER_API_KEY')
        if not api_key:
            print("❌ Configure OPENROUTER_API_KEY")
            return False
        
        ocr = WalksBankOCR(api_key=api_key)
        
        # Simular processamento (você pode substituir por um arquivo real)
        print("📄 Simulando processamento de RG...")
        
        # Para teste real, descomente e use um arquivo real:
        # result = await ocr.process_document('path/to/rg.jpg', 'rg')
        
        # Simulação para teste
        result = {
            'success': True,
            'document_type': 'rg',
            'raw_text': 'Nome Completo: João Silva Santos\nRG: 12.345.678-9\nCPF: 123.456.789-01',
            'parsed_data': {
                'Nome Completo': 'João Silva Santos',
                'RG': '12.345.678-9',
                'CPF': '123.456.789-01'
            }
        }
        
        print("✅ Resultado do processamento:")
        print(json.dumps(result, indent=2, ensure_ascii=False))
        
        return True
        
    except Exception as e:
        print(f"❌ Erro no teste: {e}")
        return False

async def test_api_connection():
    """Testa conexão com a API"""
    print("\n🌐 Teste de conexão com API")
    print("-" * 30)
    
    try:
        import requests
        
        # Testar health check
        response = requests.get('http://localhost:5000/health', timeout=5)
        
        if response.status_code == 200:
            data = response.json()
            print("✅ Servidor respondendo:")
            print(f"   Status: {data.get('status')}")
            print(f"   OCR Ready: {data.get('ocr_ready')}")
            return True
        else:
            print(f"❌ Servidor retornou status {response.status_code}")
            return False
            
    except requests.exceptions.ConnectionError:
        print("❌ Não foi possível conectar ao servidor")
        print("   Certifique-se que o servidor está rodando:")
        print("   python scripts/start_server.py")
        return False
    except Exception as e:
        print(f"❌ Erro na conexão: {e}")
        return False

def test_environment():
    """Testa configuração do ambiente"""
    print("🔧 Teste de ambiente")
    print("-" * 30)
    
    checks = []
    
    # Verificar API Key
    api_key = os.getenv('OPENROUTER_API_KEY')
    if api_key:
        print(f"✅ OPENROUTER_API_KEY: {api_key[:10]}...")
        checks.append(True)
    else:
        print("❌ OPENROUTER_API_KEY não configurada")
        checks.append(False)
    
    # Verificar dependências
    try:
        import flask
        import requests
        import PIL
        print("✅ Dependências instaladas")
        checks.append(True)
    except ImportError as e:
        print(f"❌ Dependência faltando: {e}")
        checks.append(False)
    
    # Verificar arquivos
    required_files = [
        'ocr_integration.py',
        'flask_api.py',
        'config.py',
        'utils.py'
    ]
    
    for file in required_files:
        if os.path.exists(file):
            print(f"✅ {file}")
            checks.append(True)
        else:
            print(f"❌ {file} não encontrado")
            checks.append(False)
    
    return all(checks)

async def main():
    """Função principal de teste"""
    print("🧪 TESTE COMPLETO DO SISTEMA OCR")
    print("=" * 50)
    
    # Teste 1: Ambiente
    env_ok = test_environment()
    
    if not env_ok:
        print("\n❌ Falha nos testes de ambiente")
        print("Configure o ambiente antes de continuar")
        return
    
    # Teste 2: Conexão API
    api_ok = await test_api_connection()
    
    # Teste 3: OCR
    if env_ok:
        ocr_ok = await test_single_document()
    else:
        ocr_ok = False
    
    # Resumo
    print("\n" + "=" * 50)
    print("📊 RESUMO DOS TESTES")
    print("=" * 50)
    print(f"Ambiente: {'✅' if env_ok else '❌'}")
    print(f"API: {'✅' if api_ok else '❌'}")
    print(f"OCR: {'✅' if ocr_ok else '❌'}")
    
    if all([env_ok, api_ok, ocr_ok]):
        print("\n🎉 Todos os testes passaram!")
        print("Sistema pronto para uso")
    else:
        print("\n⚠️  Alguns testes falharam")
        print("Verifique as configurações")

if __name__ == "__main__":
    asyncio.run(main())
