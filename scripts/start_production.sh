#!/bin/bash

# =============================================================================
# SCRIPT DE INICIALIZAÇÃO PARA PRODUÇÃO
# =============================================================================

set -e

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }

echo "🚀 INICIANDO WALKS BANK OCR - PRODUÇÃO"
echo "======================================"

# Verificar ambiente
if [ "$ENVIRONMENT" != "production" ]; then
    log_warning "ENVIRONMENT não está definido como 'production'"
    log_info "Definindo ENVIRONMENT=production"
    export ENVIRONMENT=production
fi

# Verificar variáveis críticas
REQUIRED_VARS=(
    "OPENROUTER_API_KEY"
    "REDIS_URL"
    "FLASK_SECRET_KEY"
    "ALLOWED_ORIGINS"
)

for var in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!var}" ]; then
        log_error "Variável $var não configurada"
        exit 1
    fi
done

log_success "Variáveis de ambiente verificadas"

# Criar diretórios
mkdir -p logs uploads ssl
log_success "Diretórios criados"

# Verificar dependências
log_info "Verificando dependências..."

if ! command -v python3 &> /dev/null; then
    log_error "Python 3 não encontrado"
    exit 1
fi

if ! command -v node &> /dev/null; then
    log_error "Node.js não encontrado"
    exit 1
fi

# Instalar/atualizar dependências
log_info "Instalando dependências..."
pip3 install -r requirements.txt --quiet
npm ci --silent

# Build do frontend
log_info "Fazendo build do frontend..."
npm run build

# Verificar Redis
log_info "Verificando conexão Redis..."
python3 -c "
import redis
import os
try:
    r = redis.from_url(os.getenv('REDIS_URL'))
    r.ping()
    print('✅ Redis OK')
except Exception as e:
    print(f'❌ Redis erro: {e}')
    exit(1)
"

# Iniciar serviços
log_info "Iniciando serviços..."

# Função para cleanup
cleanup() {
    log_warning "Parando serviços..."
    kill $(jobs -p) 2>/dev/null || true
    exit 0
}

trap cleanup SIGINT SIGTERM

# Iniciar API
log_info "Iniciando Flask API..."
gunicorn --bind 0.0.0.0:${FLASK_PORT:-5000} \
         --workers ${GUNICORN_WORKERS:-4} \
         --worker-class gevent \
         --worker-connections ${GUNICORN_CONNECTIONS:-1000} \
         --timeout ${GUNICORN_TIMEOUT:-30} \
         --keep-alive ${GUNICORN_KEEPALIVE:-2} \
         --max-requests ${GUNICORN_MAX_REQUESTS:-1000} \
         --max-requests-jitter ${GUNICORN_MAX_REQUESTS_JITTER:-100} \
         --access-logfile logs/access.log \
         --error-logfile logs/error.log \
         --log-level info \
         "scripts.flask_api:app" &

API_PID=$!

# Aguardar API ficar disponível
sleep 5

# Verificar se API está rodando
if ! curl -f http://localhost:${FLASK_PORT:-5000}/health &>/dev/null; then
    log_error "API não ficou disponível"
    kill $API_PID 2>/dev/null || true
    exit 1
fi

log_success "API iniciada (PID: $API_PID)"

# Iniciar Workers Celery
log_info "Iniciando Celery Workers..."
for i in $(seq 1 ${CELERY_WORKERS:-2}); do
    celery -A celery_app worker \
           --loglevel=info \
           --queues=ocr_queue \
           --concurrency=${CELERY_CONCURRENCY:-2} \
           --max-tasks-per-child=${CELERY_MAX_TASKS_PER_CHILD:-10} \
           --logfile=logs/worker_$i.log \
           --pidfile=logs/worker_$i.pid \
           --detach
done

log_success "Workers Celery iniciados"

# Iniciar Flower (opcional)
if [ "${ENABLE_FLOWER:-true}" = "true" ]; then
    log_info "Iniciando Flower Monitor..."
    celery -A celery_app flower \
           --port=${FLOWER_PORT:-5555} \
           --broker=${REDIS_URL} \
           --basic_auth=${FLOWER_BASIC_AUTH:-admin:admin} \
           --logfile=logs/flower.log \
           --detach
    
    log_success "Flower Monitor iniciado"
fi

# Iniciar Frontend
log_info "Iniciando Frontend..."
npm start &
FRONTEND_PID=$!

# Aguardar frontend
sleep 5

if ! curl -f http://localhost:3000 &>/dev/null; then
    log_warning "Frontend pode não estar disponível"
fi

log_success "Frontend iniciado (PID: $FRONTEND_PID)"

# Status final
echo ""
log_success "🎉 SISTEMA INICIADO COM SUCESSO!"
echo "================================="
echo "🌐 Frontend: http://localhost:3000"
echo "🔧 API: http://localhost:${FLASK_PORT:-5000}"
echo "📊 Health: http://localhost:${FLASK_PORT:-5000}/health"
if [ "${ENABLE_FLOWER:-true}" = "true" ]; then
    echo "🌸 Monitor: http://localhost:${FLOWER_PORT:-5555}"
fi
echo ""
echo "📋 Logs disponíveis em: ./logs/"
echo "🛑 Para parar: Ctrl+C ou kill $API_PID $FRONTEND_PID"
echo ""

# Aguardar sinais
wait
