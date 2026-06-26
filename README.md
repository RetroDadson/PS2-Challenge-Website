# PS2 Challenge Website
[![CI Build and Test](https://github.com/RetroDadson/PS2-Challenge-Website/actions/workflows/build.yml/badge.svg)](https://github.com/RetroDadson/PS2-Challenge-Website/actions/workflows/build.yml)
[![CI Deploy](https://github.com/RetroDadson/PS2-Challenge-Website/actions/workflows/deploy.yml/badge.svg)](https://github.com/RetroDadson/PS2-Challenge-Website/actions/workflows/deploy.yml)

A TypeScript web app for tracking progress through the PS2 challenge, managing the game library, showing voting pages and stream overlays, and exposing API/health endpoints for the site.

## Architecture

- **React + Vite** frontend served by Fastify in production
- **Fastify TypeScript API** for REST, auth, health checks, Swagger UI, sitemap, and static assets
- **PostgreSQL** for persistence
- **WebSocket hubs** at `/votesHub` and `/gamesHub` for realtime updates
- **Twitch OAuth** for authentication and `.PS2Challenge.Auth` cookies

## Quick Start

Prerequisites:

- Node.js **24.x LTS**
- npm **10+**
- Docker, if running PostgreSQL locally through compose or running integration/e2e tests

From the repository root:

```bash
npm ci
```

Then copy the local appsettings template.

PowerShell:

```powershell
Copy-Item apps/server/appsettings.Development.example.json apps/server/appsettings.Development.json
```

bash:

```bash
cp apps/server/appsettings.Development.example.json apps/server/appsettings.Development.json
```

Start the app:

```bash
npm run dev
```

Fill in the copied `apps/server/appsettings.Development.json` with local Postgres and Twitch values. A YouTube Data API key is also needed to fetch a challenge runner's logo when they do not have a Twitch URL. Environment variables can be used instead and take precedence over appsettings files.

Development URLs:

- Frontend with Vite hot reload: `http://localhost:5173`
- Fastify API and static frontend snapshot: `http://localhost:5001`
- Swagger UI: `http://localhost:5001/swagger`
- Health: `http://localhost:5001/health`

## YouTube Data API Key

Challenge-runner logos are loaded from Twitch when a Twitch URL is present. For runners with only a YouTube URL, the server uses the YouTube Data API v3 and needs an API key.

1. Open the [Google Cloud Console](https://console.cloud.google.com/) and create or select a project.
2. Go to **APIs & Services > Library**.
3. Find **YouTube Data API v3** and select **Enable**.
4. Go to **APIs & Services > Credentials**.
5. Select **Create credentials > API key**.
6. Edit the new key and set **API restrictions** to **Restrict key > YouTube Data API v3**.
7. Because Fastify makes the request server-side, do not use a browser HTTP-referrer restriction. Use an IP-address restriction only when the server has known, stable outbound IP addresses.
8. Store the key outside source control as `YOUTUBE_API_KEY`.

For Docker development, add it to the repository's untracked `.env` file:

```dotenv
YOUTUBE_API_KEY=your_youtube_data_api_key
```

For local development without Docker, either set the environment variable before starting the app or add the key to the ignored `apps/server/appsettings.Development.json` file:

```json
{
  "YouTube": {
    "ApiKey": "your_youtube_data_api_key"
  }
}
```

For deployed environments, configure `YOUTUBE_API_KEY` as a secret environment variable in the hosting platform. Never commit the real key.

## Useful Commands

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:integration
npm run test:e2e
npm run coverage
```

## Documentation

- [Development guide](docs/development.md)
- [Deployment notes](docs/deployment.md)

## Runtime Paths

- App: `/`
- Health checks: `/health` and `/api/health`
- Swagger UI: `/swagger`
- OpenAPI JSON: `/swagger/json`
- Robots and sitemap: `/robots.txt` and `/sitemap.xml`
- Realtime WebSocket endpoints: `/votesHub` and `/gamesHub`
