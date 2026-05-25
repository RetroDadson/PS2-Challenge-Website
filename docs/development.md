# Development Guide

## Project Layout

- `apps/client` - React + Vite frontend
- `apps/server` - Fastify API, auth, migrations, background jobs, health checks, Swagger, and static hosting
- `packages/shared` - shared TypeScript types, Zod schemas, and utilities
- `scripts-ts` - import and maintenance scripts
- `tests/e2e` - Playwright configuration and journeys
- `docker` - Dockerfile and compose files

## Configuration

For local appsettings, copy:

PowerShell:

```powershell
Copy-Item apps/server/appsettings.Development.example.json apps/server/appsettings.Development.json
```

bash:

```bash
cp apps/server/appsettings.Development.example.json apps/server/appsettings.Development.json
```

`apps/server/appsettings.Development.json` is ignored by git. The server reads `apps/server/appsettings.json` and `apps/server/appsettings.{NODE_ENV}.json`; environment variables override file values.

Database connection strings are resolved in this order:

1. Platform-provided connection-string variables: `POSTGRESQLCONNSTR_DefaultConnection`, `CUSTOMCONNSTR_DefaultConnection`, then any `POSTGRESQLCONNSTR_*` or `CUSTOMCONNSTR_*`
2. `DATABASE_CONNECTION_STRING`
3. `ConnectionStrings__DefaultConnection`
4. `ConnectionStrings:DefaultConnection` from appsettings files

Twitch credentials are loaded from `TWITCH_CLIENT_ID`/`TWITCH_CLIENT_SECRET`, `Twitch__ClientId`/`Twitch__ClientSecret`, or appsettings.

Useful environment variables:

- `PORT` - Fastify listen port, default `5001`
- `PUBLIC_BASE_URL` - fallback public URL when forwarded request headers are unavailable
- `ADMIN_API_KEY` - deployment secret and fallback cookie signing secret
- `COOKIE_SECRET` - preferred cookie signing secret
- `LOG_LEVEL` - Fastify logger level outside test environments
- `APPLICATIONINSIGHTS_CONNECTION_STRING` - Azure Application Insights connection string
- `APPINSIGHTS_INSTRUMENTATIONKEY` - legacy Application Insights fallback

## Local Development

Run both the API and Vite dev server from the repository root:

```bash
npm run dev
```

`npm run dev` builds the shared package and a client snapshot, starts the Fastify server, waits for readiness, then starts Vite. Use `http://localhost:5173` while editing the frontend; API and WebSocket traffic is proxied to Fastify.

You can run the server and client separately:

```bash
npm run dev:server
npm run dev:client
```

## Docker Development

Copy `.env.example` to `.env` and set the values you need:

```bash
cp .env.example .env
docker compose -f docker/docker-compose.dev.yml up -d
```

Development compose exposes:

- API: `http://localhost:5001`
- PostgreSQL: `localhost:5432`
- pgAdmin: `http://localhost:5050`

It includes PostgreSQL, pgAdmin, and the Fastify server running with `tsx watch`.

It does not run the Vite dev server. For frontend hot reload, leave compose running for Postgres/API and run this locally:

```bash
npm run dev:client
```

If your Docker setup requires folders to exist before bind mounts are created, create:

- `mounts/dev/postgres-data`
- `mounts/dev/pgadmin-data`

## Tests

Common commands:

```bash
npm run lint
npm run typecheck
npm test
npm run coverage
npm run test:integration
npm run test:e2e
```

Integration tests use Testcontainers and need Docker access. Playwright tests need browser dependencies installed for the browsers being tested.

## Realtime Updates

Realtime updates use WebSocket endpoints:

- `/votesHub`
- `/gamesHub`

These are WebSocket connection endpoints, not browsable pages.

User-visible event names are preserved as `VotesUpdated` and `GamesUpdated`. Overlay pages send heartbeat `Ping` messages, ignore `Pong` responses, reconnect automatically, and poll while reconnecting so displayed data keeps moving even if a socket drops.

## API Access

Authenticated users can generate per-user API keys from the user page. API requests can authenticate with either:

- `X-API-Key: <key>`
- `Authorization: Bearer <key>`

Browser users authenticate through Twitch OAuth and the `.PS2Challenge.Auth` cookie.

## Migrations

The migration runner creates the current PostgreSQL schema for fresh databases. For non-empty databases, it validates the expected legacy schema and records a TypeScript baseline instead of applying destructive schema changes.

Run migrations through the app startup path or manually with:

```bash
npm run migrate
```

## Troubleshooting

- Check `/health` for application and database health.
- Check `/api/health` for the detailed health response.
- Ensure PostgreSQL is reachable from the server.
- Verify Twitch credentials are set outside test environments.
- For Azure Database for PostgreSQL, prefer URL-style strings with `sslmode=verify-full`.
