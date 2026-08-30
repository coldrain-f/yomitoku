# Yomitoku backend

FastAPI API, PostgreSQL persistence, and a LangGraph worker live here. The
The React application remains in the repository root. It reads
`VITE_API_BASE_URL` when provided and otherwise targets `http://localhost:8001/api/v1`
in development.

## Start locally

Run these commands from the repository root (`react-app`), where
`docker-compose.yml` and `.env.example` live.

```powershell
Copy-Item .env.example .env
docker compose up --build
```

- API documentation: `http://localhost:8001/docs`
- Health check: `http://localhost:8001/api/v1/health`
- PostgreSQL: `localhost:5433`

The default `GENERATION_PROVIDER=stub` runs the complete graph without calling
an external model. To use Claude, set `GENERATION_PROVIDER=anthropic`, provide
`ANTHROPIC_API_KEY`, and choose model IDs in `.env`. Keep all model keys on the
server; they must never be exposed to the React application.

## Services

- `db`: PostgreSQL for application and LangGraph checkpoint data.
- `migrate`: applies Alembic migrations once before the application starts.
- `api`: FastAPI HTTP API.
- `worker`: claims queued generation jobs and runs the LangGraph workflow.

The worker is deliberately separate from FastAPI. Generation can take time and
cost money, so `POST /api/v1/admin/generation-jobs` returns `202 Accepted` and
the frontend polls the job endpoint instead of holding an HTTP request open.

## Development-only authentication

Google OAuth is intentionally not implemented yet. In `APP_ENV=development`,
protected API examples can send `X-Dev-Role: admin` and optionally
`X-Dev-User-Id`. Outside development the placeholder authentication dependency
rejects protected requests until the Google OAuth implementation replaces it.

## Connected MVP APIs

- Public reading lists support search, level, length, learning-status, sort, and pagination.
- A reading attempt is created and shuffled by the server. Correct answers and explanations are returned only after submission.
- Statistics, feedback, issue reports, item metrics, and administrator item CRUD are persisted in PostgreSQL.
- Admin actions cover review, hold, unhold, publish, permanent deletion, and LangGraph generation-job polling.

The local React client sends the development headers only while Vite runs in development mode. Production OAuth must replace that behavior before deploying.
