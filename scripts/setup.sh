#!/bin/bash

# =============================================================================
# SCRIPT DE SETUP COMPLETO - WALKS BANK OCR
# =============================================================================

set -e  # Parar em caso de erro

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# Função para log colorido
log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

log_step() {
    echo -e "${PURPLE}🔄 $1${NC}"
}

# Banner
echo -e "${BLUE}"
cat << "EOF"
╦ ╦╔═╗╦  ╦╔═╗╔═╗  ╔╗ ╔═╗╔╗╔╦╔═  ╔═╗╔═╗╦═╗
║║║╠═╣║  ╠╩╗╚═╗  ╠╩╗╠═╣║║║╠╩╗  ║ ║║  ╠╦╝
╚╩╝╩ ╩╩═╝╩ ╩╚═╝  ╚═╝╩ ╩╝╚╝╩ ╩  ╚═╝╚═╝╩╚═
EOF
echo -e "${NC}"
echo "Sistema de Cadastro Digital com OCR"
echo "===================================="
echo ""

# Verificar se está no diretório correto
if [ ! -f "package.json" ] || [ ! -f "requirements.txt" ]; then
    log_error "Execute este script a partir do diretório raiz do projeto"
    exit 1
fi

# Função para verificar comando
check_command() {
    if command -v "$1" &> /dev/null; then
        log_success "$1 encontrado: $(command -v $1)"
        return 0
    else
        log_error "$1 não encontrado"
        return 1
    fi
}

# Função para verificar versão do Node
check_node_version() {
    if command -v node &> /dev/null; then
        NODE_VERSION=$(node --version | cut -d'v' -f2)
        MAJOR_VERSION=$(echo $NODE_VERSION | cut -d'.' -f1)
        
        if [ "$MAJOR_VERSION" -ge 18 ]; then
            log_success "Node.js $NODE_VERSION (✓ >= 18)"
            return 0
        else
            log_error "Node.js $NODE_VERSION (✗ < 18 requerido)"
            return 1
        fi
    else
        log_error "Node.js não encontrado"
        return 1
    fi
}

# Função para verificar versão do Python
check_python_version() {
    if command -v python3 &> /dev/null; then
        PYTHON_VERSION=$(python3 --version | cut -d' ' -f2)
        MAJOR_VERSION=$(echo $PYTHON_VERSION | cut -d'.' -f1)
        MINOR_VERSION=$(echo $PYTHON_VERSION | cut -d'.' -f2)
        
        if [ "$MAJOR_VERSION" -eq 3 ] && [ "$MINOR_VERSION" -ge 11 ]; then
            log_success "Python $PYTHON_VERSION (✓ >= 3.11)"
            return 0
        else
            log_error "Python $PYTHON_VERSION (✗ < 3.11 requerido)"
            return 1
        fi
    else
        log_error "Python 3 não encontrado"
        return 1
    fi
}

# 1. VERIFICAR PRÉ-REQUISITOS
log_step "Verificando pré-requisitos..."

REQUIREMENTS_OK=true

# Verificar Node.js
if ! check_node_version; then
    REQUIREMENTS_OK=false
    log_info "Instale Node.js 18+: https://nodejs.org/"
fi

# Verificar Python
if ! check_python_version; then
    REQUIREMENTS_OK=false
    log_info "Instale Python 3.11+: https://python.org/"
fi

# Verificar npm
if ! check_command "npm"; then
    REQUIREMENTS_OK=false
fi

# Verificar pip
if ! check_command "pip3"; then
    REQUIREMENTS_OK=false
fi

# Verificar Redis (opcional)
if ! check_command "redis-server"; then
    log_warning "Redis não encontrado - será necessário para execução"
    log_info "Instale Redis: https://redis.io/download"
fi

# Verificar Docker (opcional)
if check_command "docker"; then
    if check_command "docker-compose"; then
        log_success "Docker e Docker Compose disponíveis"
        DOCKER_AVAILABLE=true
    else
        log_warning "Docker encontrado, mas Docker Compose não"
        DOCKER_AVAILABLE=false
    fi
else
    log_warning "Docker não encontrado - instalação manual será necessária"
    DOCKER_AVAILABLE=false
fi

if [ "$REQUIREMENTS_OK" = false ]; then
    log_error "Pré-requisitos não atendidos. Instale as dependências e tente novamente."
    exit 1
fi

# 2. CONFIGURAR AMBIENTE
log_step "Configurando ambiente..."

# Criar arquivo .env se não existir
if [ ! -f ".env" ]; then
    log_info "Criando arquivo .env a partir do template..."
    cp .env.example .env
    log_success "Arquivo .env criado"
else
    log_warning "Arquivo .env já existe"
fi

# Verificar se API key está configurada
if grep -q "your-api-key-here" .env; then
    log_warning "ATENÇÃO: Configure sua OPENROUTER_API_KEY no arquivo .env"
    echo ""
    echo "1. Abra o arquivo .env"
    echo "2. Substitua 'your-api-key-here' pela sua chave da OpenRouter"
    echo "3. Obtenha sua chave em: https://openrouter.ai/"
    echo ""
    read -p "Pressione Enter após configurar a API key..."
fi

# 3. CRIAR DIRETÓRIOS
log_step "Criando diretórios necessários..."

mkdir -p logs uploads ssl
log_success "Diretórios criados"

# 4. INSTALAR DEPENDÊNCIAS
log_step "Instalando dependências..."

# Python
log_info "Instalando dependências Python..."
if pip3 install -r requirements.txt; then
    log_success "Dependências Python instaladas"
else
    log_error "Falha ao instalar dependências Python"
    exit 1
fi

# Node.js
log_info "Instalando dependências Node.js..."
if npm install; then
    log_success "Dependências Node.js instaladas"
else
    log_error "Falha ao instalar dependências Node.js"
    exit 1
fi

# 5. VERIFICAR CONFIGURAÇÃO
log_step "Verificando configuração..."

# Testar imports Python
log_info "Testando imports Python..."
python3 -c "
import sys
missing = []
try:
    import flask, celery, redis, pydantic, requests
    print('✅ Imports Python OK')
except ImportError as e:
    print(f'❌ Import falhou: {e}')
    sys.exit(1)
"

if [ $? -ne 0 ]; then
    log_error "Problemas com dependências Python"
    exit 1
fi

# Testar build Next.js
log_info "Testando build Next.js..."
if npm run type-check; then
    log_success "TypeScript OK"
else
    log_warning "Problemas com TypeScript (não crítico)"
fi

# 6. CONFIGURAR SCRIPTS EXECUTÁVEIS
log_step "Configurando permissões de scripts..."

chmod +x scripts/*.sh
chmod +x scripts/*.py
log_success "Permissões configuradas"

# 7. OPÇÕES DE INICIALIZAÇÃO
log_step "Preparando opções de inicialização..."

echo ""
echo "🎯 SETUP CONCLUÍDO COM SUCESSO!"
echo "================================"
echo ""

if [ "$DOCKER_AVAILABLE" = true ]; then
    echo "📦 OPÇÃO 1: Docker (Recomendado)"
    echo "   docker-compose up -d"
    echo ""
fi

echo "🔧 OPÇÃO 2: Execução Manual"
echo "   1. Iniciar Redis: redis-server"
echo "   2. Iniciar API: python scripts/flask_api.py"
echo "   3. Iniciar Worker: python scripts/start_celery_worker.py"
echo "   4. Iniciar Frontend: npm run dev"
echo ""

echo "🌐 URLs após inicialização:"
echo "   Frontend: http://localhost:3000"
echo "   API: http://localhost:5000"
echo "   Monitor: http://localhost:5555"
echo ""

echo "📋 PRÓXIMOS PASSOS:"
echo "   1. Configure OPENROUTER_API_KEY no .env"
echo "   2. Escolha uma opção de inicialização acima"
echo "   3. Acesse http://localhost:3000"
echo ""

# 8. VERIFICAÇÃO FINAL
if grep -q "your-api-key-here" .env; then
    log_warning "LEMBRE-SE: Configure a API key antes de iniciar!"
else
    log_success "Configuração parece completa!"
fi

echo ""
log_success "Setup finalizado! 🚀"
