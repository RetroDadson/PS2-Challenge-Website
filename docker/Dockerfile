# syntax=docker/dockerfile:1

FROM node:26-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/server/package.json apps/server/package.json
COPY apps/client/package.json apps/client/package.json

RUN npm ci

COPY . .
RUN npm run build

FROM build AS production-deps
RUN npm prune --omit=dev

FROM node:26-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=Production
ENV PORT=5001

RUN useradd -m appuser

COPY --from=build --chown=appuser:appuser /app/package.json /app/package-lock.json ./
COPY --from=production-deps --chown=appuser:appuser /app/node_modules ./node_modules
COPY --from=build --chown=appuser:appuser /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build --chown=appuser:appuser /app/packages/shared/dist ./packages/shared/dist
COPY --from=build --chown=appuser:appuser /app/apps/server/package.json ./apps/server/package.json
COPY --from=build --chown=appuser:appuser /app/apps/server/dist ./apps/server/dist
COPY --from=build --chown=appuser:appuser /app/apps/client/package.json ./apps/client/package.json
COPY --from=build --chown=appuser:appuser /app/apps/client/dist ./apps/client/dist

USER appuser

EXPOSE 5001

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:5001/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "--import", "@azure/monitor-opentelemetry/loader", "apps/server/dist/index.js"]
