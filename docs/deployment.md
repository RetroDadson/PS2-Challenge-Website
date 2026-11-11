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
- `COOKIE_SECRET` (required in Production; outside Production a random ephemeral secret is generated when unset)

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
https://<host>/api/auth/callback
```

## Twitch EventSub

The webhook is `POST https://<host>/api/eventsub/webhook`. Twitch only delivers to HTTPS on port 443, so it can't reach a local machine; use the Twitch CLI locally (see the development guide).

Every message is checked with Twitch's HMAC-SHA256 signature, using a webhook secret the app works out from `TWITCH_CLIENT_SECRET` (there's no separate setting), and anything older than 10 minutes is rejected. Repeated deliveries are ignored by message ID. New subs, resubs shared in chat and gifted subs create entries; gift recipients don't, and anonymous gifts wait in the admin review queue. Twitch often sends a renewal twice, once as a subscribe and again as a resub message when the viewer shares it in chat, so a resub message from the same viewer within 31 days of their subscribe (or a subscribe within an hour of a resub message) is linked to the first event's entries instead of adding more.

One-off setup, from Admin, Sub Picks, Twitch:

1. In the same browser, log in to Twitch as the channel account, then click "Authorise Subscriptions" and accept the `channel:read:subscriptions` permission. This uses the existing `/api/auth/callback` redirect, so no new Twitch redirect URL is needed, and it doesn't change your site login.
2. Click "Create or Repair Subscriptions". The three subscriptions should show as Active within a few seconds.

If Twitch revokes access (for example after a password change), the Twitch tab shows a warning; repeat both steps. If you rotate the Twitch client secret, the Twitch tab warns that the subscriptions use the old one; click "Create or Repair Subscriptions" to replace them. Moving to a new host also needs step 2, which replaces subscriptions pointing at the old webhook.

## Sub Pick Draws

Game numbers are now always the highest game number plus one, so a failed save can't leave a gap and every 10th game lines up with its draw. Gaps from before this change are left as they are.

When the next game is a 10th or 100th game and subs have valid picks waiting, the progress modal and the vote archive refuse to start a game and offer "Start Anyway" instead. Run the draw from Admin, Sub Picks, Wheel. Accepting the result starts the winning game as that game number.

Stream overlays for OBS (browser sources, transparent background):

- `/wheel-overlay`: set the source to 1920x1080. It shows the wheel, the slice under the pointer and every game's entries while a draw is open, and the accepted result for 5 minutes afterwards. Between draws it shows a card with the next draw's game number, how many entries are on the wheel and the top pick.
- `/sub-picks-overlay`: set the source to 1242x97. It is a solid strip with the overlay message, the next draw, how many entries are on the wheel and the top pick. Build the link with timing options under Admin, Stream Overlays.

Spin length is set on the Wheel tab (or Settings) and applies to the next spin.

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
