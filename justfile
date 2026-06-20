# RegDelta task runner — single source of truth for commands (see TOOLS.md).
# Until milestone M0 bootstraps the pnpm workspace, code recipes fail fast.

set shell := ["sh", "-cu"]

# List available recipes
default:
    @just --list

# (internal) Fail clearly when the workspace is not bootstrapped yet
_bootstrapped:
    @[ -f package.json ] || { echo "ERROR: package.json not found — regdelta is a docs-only scaffold."; echo "Bootstrap the pnpm workspace per DESIGN.md milestone M0 first."; exit 1; }

# (internal) Fail clearly when docker-compose.yml does not exist yet
_compose:
    @[ -f docker-compose.yml ] || { echo "ERROR: docker-compose.yml not found — not bootstrapped yet."; echo "It arrives with DESIGN.md milestone M0 (pgvector/pgvector:pg16 service)."; exit 1; }

# Enable corepack and install workspace dependencies
setup: _bootstrapped
    corepack enable
    pnpm install

# Run the dev servers (Next.js app + Inngest dev server)
dev: _bootstrapped
    pnpm dev

# Start local Postgres 16 + pgvector container
db-up: _compose
    docker compose up -d postgres

# Stop local Postgres container
db-down: _compose
    docker compose down

# Apply Drizzle migrations (packages/db)
migrate: _bootstrapped
    pnpm --filter @regdelta/db migrate

# Run unit tests (vitest, whole workspace)
test: _bootstrapped
    pnpm test

# Run the eval gate only (materiality recall/precision bar; also runs inside `test`)
eval: _bootstrapped
    pnpm eval

# Run Playwright e2e tests (apps/web)
e2e: _bootstrapped
    pnpm e2e

# Lint with ESLint
lint: _bootstrapped
    pnpm lint

# Format with Prettier
format: _bootstrapped
    pnpm format

# Type-check the whole workspace (tsc --noEmit)
typecheck: _bootstrapped
    pnpm typecheck

# Production build of all packages and the app
build: _bootstrapped
    pnpm build

# Full merge gate: lint + typecheck + test + build (mirrors CI)
ci: lint typecheck test build
