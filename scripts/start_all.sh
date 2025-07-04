#!/bin/bash

# =============================================================================
# SCRIPT DE INICIALIZAÇÃO COMPLETA DO WALKS BANK OCR
# =============================================================================

set -e  # Parar em caso de erro

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
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

# Função para verificar se um processo está rodando
check_process() {
    local process_name=$1
    local port=$2
    
    if pgrep -f "$process_name" > /dev/null; then
        log_success "$process_name está rodando"
        return 0
    elif [ -n "$port" ] && netstat -tuln 2>/dev/null | grep ":$port " > /dev/null; then
        log_success "Serviço na porta $port está ativo"
        return 0
    else
        return 1
    fi
}

# Função para aguardar serviço ficar disponível
wait_for_service() {
    local service_name=$1
    local check_command=$2
    local max_attempts=${3:-30}
    local attempt=1
    
    log_info "Aguardando $service_name ficar disponível..."
    
    while [ $attempt -le $max_attempts ]; do
        if eval "$check_command" > /dev/null 2>&1; then
            log_success "$service_name está disponível"
            return 0
        fi
        
        echo -n "."
        sleep 1
        attempt=$((attempt + 1))
    done
    
    log_error "$service_name não ficou disponível após $max_attempts tentativas"
    return 1
}

# Função para cleanup
cleanup() {
    log_warning "Recebido sinal de interrupção. Parando serviços..."
    
    # Parar processos filhos
    if [ -n "$FLASK_PID" ]; then
        log_info "Parando Flask API (PID: $FLASK_PID)..."
        kill $FLASK_PID 2>/dev/null || true
    fi
    
    if [ -n "$WORKER_PID" ]; then
        log_info "Parando Celery Worker (PID: $WORKER_PID)..."
        kill $WORKER_PID 2>/dev/null || true
    fi
    
    if [ -n "$FLOWER_PID" ]; then
        log_info "Parando Flower Monitor (PID: $FLOWER_PID)..."
        kill $FLOWER_PID 2>/dev/null || true
    fi
    
    # Aguardar processos terminarem
    wait 2>/dev/null || true
    
    log_success "Todos os serviços foram parados"
    exit 0
}

# Capturar sinais de interrupção
trap cleanup SIGINT SIGTERM

echo "🚀 INICIANDO SISTEMA COMPLETO WALKS BANK OCR"
echo "============================================="

# 1. VERIFICAÇÕES INICIAIS
log_info "Executando verificações iniciais..."

# Verificar se estamos no diretório correto
if [ ! -f "scripts/flask_api.py" ]; then
    log_error "Execute este script a partir do diretório raiz do projeto"
    exit 1
fi

# Verificar Python
if ! command -v python3 &> /dev/null; then
    log_error "Python 3 não encontrado"
    exit 1
fi
log_success "Python encontrado: $(python3 --version)"

# Verificar dependências Python
log_info "Verificando dependências Python..."
python3 -c "
import sys
missing = []
try:
    import celery, redis, flask, requests
    print('✅ Dependências principais OK')
except ImportError as e:
    print(f'❌ Dependência faltando: {e}')
    sys.exit(1)
"

if [ $? -ne 0 ]; then
    log_error "Instale as dependências: pip install -r requirements.txt"
    exit 1
fi

# 2. VERIFICAR VARIÁVEIS DE AMBIENTE
log_info "Verificando variáveis de ambiente..."

# Carregar .env se existir
if [ -f ".env" ]; then
    log_info "Carregando arquivo .env..."
    export $(grep -v '^#' .env | xargs)
else
    log_warning "Arquivo .env não encontrado. Usando variáveis do sistema."
fi

# Verificar variáveis obrigatórias
if [ -z "$OPENROUTER_API_KEY" ]; then
    log_error "OPENROUTER_API_KEY não configurada"
    log_info "Configure com: export OPENROUTER_API_KEY='sua_chave'"
    exit 1
fi
log_success "OPENROUTER_API_KEY configurada"

if [ -z "$REDIS_URL" ]; then
    log_warning "REDIS_URL não configurada, usando padrão"
    export REDIS_URL="redis://localhost:6379/0"
fi
log_success "REDIS_URL: $REDIS_URL"

# 3. VERIFICAR E INICIAR REDIS
log_info "Verificando Redis..."

if ! check_process "redis-server" "6379"; then
    log_warning "Redis não está rodando"
    
    # Tentar iniciar Redis se estiver instalado
    if command -v redis-server &> /dev/null; then
        log_info "Tentando iniciar Redis..."
        redis-server --daemonize yes --port 6379
        sleep 2
        
        if check_process "redis-server" "6379"; then
            log_success "Redis iniciado com sucesso"
        else
            log_error "Falha ao iniciar Redis"
            exit 1
        fi
    else
        log_error "Redis não está instalado"
        log_info "Instale com: sudo apt-get install redis-server (Ubuntu/Debian)"
        log_info "Ou: brew install redis (macOS)"
        exit 1
    fi
else
    log_success "Redis já está rodando"
fi

# Testar conexão Redis
if ! wait_for_service "Redis" "redis-cli -u $REDIS_URL ping | grep -q PONG" 10; then
    log_error "Não foi possível conectar ao Redis"
    exit 1
fi

# 4. CONFIGURAR LOGS
log_info "Configurando sistema de logs..."
mkdir -p logs
export PYTHONUNBUFFERED=1

# 5. INICIAR FLASK API
log_info "Iniciando Flask API..."
python3 scripts/flask_api.py > logs/flask.log 2>&1 &
FLASK_PID=$!

# Aguardar Flask ficar disponível
if ! wait_for_service "Flask API" "curl -s http://localhost:5000/health" 15; then
    log_error "Flask API não ficou disponível"
    cleanup
    exit 1
fi

# 6. INICIAR CELERY WORKER
log_info "Iniciando Celery Worker..."
python3 scripts/start_celery_worker.py > logs/celery_worker.log 2>&1 &
WORKER_PID=$!

# Aguardar Worker ficar disponível
sleep 5
if ! ps -p $WORKER_PID > /dev/null; then
    log_error "Celery Worker falhou ao iniciar"
    log_info "Verifique os logs: tail -f logs/celery_worker.log"
    cleanup
    exit 1
fi
log_success "Celery Worker iniciado (PID: $WORKER_PID)"

# 7. INICIAR FLOWER MONITOR (OPCIONAL)
FLOWER_PORT=${FLOWER_PORT:-5555}
if ! check_process "flower" "$FLOWER_PORT"; then
    log_info "Iniciando Flower Monitor..."
    celery -A celery_app flower --port=$FLOWER_PORT --broker=$REDIS_URL > logs/flower.log 2>&1 &
    FLOWER_PID=$!
    
    # Aguardar Flower (não crítico se falhar)
    if wait_for_service "Flower" "curl -s http://localhost:$FLOWER_PORT" 10; then
        log_success "Flower Monitor iniciado (PID: $FLOWER_PID)"
    else
        log_warning "Flower Monitor não ficou disponível (não crítico)"
        kill $FLOWER_PID 2>/dev/null || true
        FLOWER_PID=""
    fi
else
    log_success "Flower já está rodando"
fi

# 8. VERIFICAÇÃO FINAL DE SAÚDE
log_info "Executando verificação final de saúde..."

# Testar health check
HEALTH_RESPONSE=$(curl -s http://localhost:5000/health)
if echo "$HEALTH_RESPONSE" | grep -q '"status":"healthy"'; then
    log_success "Sistema está saudável"
else
    log_warning "Sistema pode ter problemas. Resposta do health check:"
    echo "$HEALTH_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$HEALTH_RESPONSE"
fi

# 9. EXIBIR INFORMAÇÕES DO SISTEMA
echo ""
echo "✅ SISTEMA INICIADO COM SUCESSO!"
echo "================================="
echo "🌐 Flask API:      http://localhost:5000"
echo "📊 Health Check:   http://localhost:5000/health"
echo "🔄 Celery Worker:  Ativo (PID: $WORKER_PID)"
if [ -n "$FLOWER_PID" ]; then
    echo "🌸 Flower Monitor: http://localhost:$FLOWER_PORT"
fi
