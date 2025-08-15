# Project Structure

## Root Level Organization
```
├── app/                    # Next.js App Router pages and components
├── components/             # Shared React components
├── hooks/                  # Custom React hooks
├── lib/                    # Utility libraries and configurations
├── scripts/                # Python backend services
├── public/                 # Static assets
├── logs/                   # Application logs
└── styles/                 # Global CSS files
```

## Frontend Structure (`app/`)
- **App Router**: Uses Next.js 13+ app directory structure
- **Pages**: Each route has its own folder (e.g., `login/`, `home/`, `historico/`)
- **Components**: Page-specific components in `app/components/`
- **Context**: React Context providers in `app/context/`
- **Hooks**: Custom hooks in `app/hooks/`
- **Types**: TypeScript definitions in `app/types/`
- **API Routes**: Server-side endpoints in `app/api/`

## Backend Structure (`scripts/`)
- **Main API**: `flask_api.py` - Primary Flask application
- **Task Processing**: `celery_tasks.py` - Async OCR processing
- **Models**: `models.py` - Pydantic data models
- **Configuration**: `config.py` - Environment and settings
- **Utilities**: `utils.py` - Helper functions
- **OCR Integration**: `ocr_integration.py` - External OCR service
- **Startup Scripts**: Various `start_*.py` files for different services

## Shared Components (`components/`)
- **UI Components**: Reusable shadcn/ui components in `components/ui/`
- **Theme Provider**: Dark/light mode support
- **Design System**: Consistent styling with Tailwind classes

## Library Structure (`lib/`)
- **API Client**: `api.ts` - Frontend API communication
- **Supabase**: `supabase.ts` - Database and auth client
- **Security**: `security.ts` - Security utilities
- **Utils**: `utils.ts` - General utility functions
- **Middleware**: `webhook-security-middleware.ts` - Security middleware

## Naming Conventions
- **Files**: kebab-case for components, camelCase for utilities
- **Components**: PascalCase React components
- **Hooks**: camelCase starting with `use`
- **Types**: PascalCase interfaces and types
- **Constants**: UPPER_SNAKE_CASE
- **CSS Classes**: Tailwind utility classes, custom classes in kebab-case

## Import Patterns
- Use `@/` path alias for root-level imports
- Relative imports for same-directory files
- Group imports: external libraries, internal modules, relative imports
- Components should be default exports, utilities can be named exports

## File Organization Rules
- One main component per file
- Co-locate related files (component + styles + tests)
- Keep page components in their respective app router folders
- Shared utilities in `lib/`, page-specific logic in page folders
- Environment-specific configs in root level files