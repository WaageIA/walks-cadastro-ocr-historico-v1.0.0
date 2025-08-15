# Technology Stack

## Frontend
- **Framework**: Next.js 15.2.4 with React 19
- **Language**: TypeScript 5
- **Styling**: Tailwind CSS with custom design system
- **UI Components**: Radix UI primitives with shadcn/ui
- **Forms**: React Hook Form with Zod validation
- **State Management**: React Context API
- **Authentication**: Supabase Auth
- **Icons**: Lucide React

## Backend
- **API**: Flask 2.3.3 with Python
- **Task Queue**: Celery with Redis
- **Database**: Supabase (PostgreSQL)
- **Validation**: Pydantic models
- **Security**: Flask-CORS, Flask-Limiter, cryptography
- **Monitoring**: Flower for Celery, structured logging

## Infrastructure
- **Containerization**: Docker with multi-stage builds
- **Reverse Proxy**: Nginx
- **Package Management**: pnpm (frontend), pip (backend)
- **Environment**: Docker Compose for local development

## Common Commands

### Development
```bash
# Frontend development
pnpm dev

# Backend development
python scripts/start_server.py

# Start all services
./scripts/start_all.sh

# Celery worker
python scripts/start_celery_worker.py

# Celery monitoring
python scripts/start_flower.py
```

### Production
```bash
# Build and start containers
docker-compose up -d

# Production startup
./scripts/start_production.sh
```

### Testing
```bash
# OCR testing
python scripts/test_ocr.py
```

## Configuration
- Environment variables in `.env`
- Next.js config with standalone output
- TypeScript with path aliases (`@/*`)
- Tailwind with custom design tokens
- ESLint and TypeScript errors ignored in builds (legacy setup)