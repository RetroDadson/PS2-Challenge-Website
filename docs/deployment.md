# Deployment Notes

The app is a standard Node.js 24 application. The production build serves the React frontend from Fastify and starts the API from `apps/server/dist/index.js`.

## Build

```bash
npm ci
npm run build
```

The root `npm start` script starts the server workspace:

```bash
npm start
```

The server workspace start command includes the Azure Monitor OpenTelemetry ESM loader:

```bash
npm run start -w @ps2-challenge/server
```

## Required Configuration

Required in production-like environments:

- A PostgreSQL connection string
- `TWITCH_CLIENT_ID`
- `TWITCH_CLIENT_SECRET`
- `COOKIE_SECRET` or `ADMIN_API_KEY`

The app accepts PostgreSQL connection strings from `POSTGRESQLCONNSTR_*`, `CUSTOMCONNSTR_*`, `DATABASE_CONNECTION_STRING`, `ConnectionStrings__DefaultConnection`, or appsettings. For Azure Database for PostgreSQL, use `sslmode=verify-full` when using URL-style connection strings.

Optional:

- `APPLICATIONINSIGHTS_CONNECTION_STRING`
- `APPINSIGHTS_INSTRUMENTATIONKEY`
- `LOG_LEVEL`
- `PUBLIC_BASE_URL`

`PUBLIC_BASE_URL` is only a fallback. OAuth and sitemap URLs are normally derived from incoming host/protocol headers, so the app can sit behind a reverse proxy or multiple hostnames.

## Twitch OAuth

Register callback URLs for each public host that should support login:

```text
https://<host>/api/auth/twitch/callback
```

## Docker

Build the runtime image:

```bash
docker build -f docker/Dockerfile -t ps2-challenge-website .
```

Run the production-style compose stack:

```bash
docker compose -f docker/docker-compose.yml up -d
```

The optional nginx reverse proxy is behind the `production` compose profile:

```bash
docker compose -f docker/docker-compose.yml --profile production up -d
```

## Health And Observability

- `/health` - simple health endpoint for container and platform checks
- `/api/health` - detailed application health endpoint
- `/swagger` - Swagger UI
- `/swagger/json` - OpenAPI JSON
- `/sitemap.xml` - generated from the request host
- `/robots.txt` - generated from the request host

When `APPLICATIONINSIGHTS_CONNECTION_STRING` is present, Azure Monitor OpenTelemetry is enabled, including Live Metrics and PostgreSQL dependency instrumentation.

## CI/CD

- `.github/workflows/build.yml` runs linting, type checks, tests, coverage, Playwright, SonarCloud, and build packaging.
- `.github/workflows/deploy.yml` deploys the Node artifact after a successful build on `main`.
