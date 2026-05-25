import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import cookie from "@fastify/cookie";
import formbody from "@fastify/formbody";
import helmet from "@fastify/helmet";
import fastifyStatic from "@fastify/static";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import websocket from "@fastify/websocket";
import fastify, { type FastifyBaseLogger, type FastifyInstance } from "fastify";
import type { AppConfig } from "./config.js";
import { closeDbClient, createDbClient, type DbClient } from "./db/client.js";
import { migrateDatabase } from "./db/migrate.js";
import { openApiRefResolver, openApiTransform, registerOpenApiSchemas } from "./openapi/schemas.js";
import { RealtimeHub } from "./realtime/hub.js";
import { UserRepository } from "./repositories/userRepository.js";
import { registerAdminRoutes } from "./routes/adminRoutes.js";
import { registerAuthRoutes } from "./routes/authRoutes.js";
import { registerGamesRoutes } from "./routes/gamesRoutes.js";
import { registerHealthRoutes } from "./routes/healthRoutes.js";
import { registerPublicSiteRoutes } from "./routes/publicSiteRoutes.js";
import { registerUserRoutes } from "./routes/userRoutes.js";
import { registerVotesRoutes } from "./routes/votesRoutes.js";
import { CoverImageRefreshService, type CoverImageRefreshResult } from "./services/coverImageService.js";
import { GameService } from "./services/gameService.js";
import { VoteService } from "./services/voteService.js";

export type AppDependencies = {
  dbClient?: DbClient;
  realtimeHub?: RealtimeHub;
};

type CoverRefreshLogger = Pick<FastifyBaseLogger, "error" | "info">;

type CoverRefreshJob = Pick<CoverImageRefreshService, "refreshCoverImages"> & Partial<Pick<CoverImageRefreshService, "refreshCoverImagesDetailed">>;
type CoverRefreshSummary = Pick<CoverImageRefreshResult, "updated"> & Partial<Omit<CoverImageRefreshResult, "updated">>;

type CoverRefreshSchedulerOptions = {
  coverRefresh: CoverRefreshJob;
  realtimeHub: Pick<RealtimeHub, "broadcastGamesUpdated">;
  logger?: CoverRefreshLogger;
  initialDelayMs?: number;
  intervalMs?: number;
};

export async function buildApp(config: AppConfig, dependencies: AppDependencies = {}): Promise<FastifyInstance> {
  const app = fastify({
    logger: config.nodeEnv !== "Testing" && config.nodeEnv !== "test" ? { level: config.logLevel } : false,
    trustProxy: true
  });

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cookie);
  await app.register(formbody);
  await app.register(websocket);
  await app.register(swagger, {
    refResolver: openApiRefResolver,
    transform: openApiTransform,
    openapi: {
      info: {
        title: "PS2 Challenge API",
        version: "v1",
        description: "API for managing PS2 games, progress tracking, and voting."
      },
      components: {
        securitySchemes: {
          ApiKey: {
            type: "apiKey",
            in: "header",
            name: "X-API-Key"
          },
          Cookie: {
            type: "apiKey",
            in: "cookie",
            name: ".PS2Challenge.Auth"
          }
        }
      }
    }
  });
  await app.register(swaggerUi, {
    routePrefix: "/swagger",
    uiConfig: {
      docExpansion: "list"
    }
  });
  registerOpenApiSchemas(app);

  const dbClient = dependencies.dbClient ?? createDbClient(config);
  const pool = dbClient.pool;
  const realtimeHub = dependencies.realtimeHub ?? new RealtimeHub(app.log);
  realtimeHub.setLogger(app.log);
  const userRepository = new UserRepository(dbClient.db);
  const gameService = new GameService(pool, dbClient.db);
  const voteService = new VoteService(pool, dbClient.db);

  app.get("/votesHub", { websocket: true }, (socket) => realtimeHub.register("votes", socket));
  app.get("/gamesHub", { websocket: true }, (socket) => realtimeHub.register("games", socket));

  await registerHealthRoutes(app, () => dbClient.db.selectFrom("platform_types").select("platform").limit(1).executeTakeFirst());
  await registerAuthRoutes(app, userRepository, config);
  await registerUserRoutes(app, userRepository, config);
  await registerAdminRoutes(app, userRepository, config);
  await registerGamesRoutes(app, gameService, userRepository, config, realtimeHub);
  await registerVotesRoutes(app, voteService, userRepository, config, realtimeHub);
  await registerPublicSiteRoutes(app, config);

  const clientDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../client/dist");
  if (fs.existsSync(clientDist)) {
    await app.register(fastifyStatic, {
      root: clientDist,
      prefix: "/",
      decorateReply: true
    });
  }

  app.setNotFoundHandler(async (request, reply) => {
    if (request.url.startsWith("/api/") || request.url.startsWith("/swagger")) {
      return reply.status(404).send({ message: "Not Found" });
    }
    if (fs.existsSync(path.join(clientDist, "index.html")) && "sendFile" in reply) {
      return (reply as any).sendFile("index.html");
    }
    return reply.type("text/html").send("<!doctype html><html><body><div id=\"root\">PS2 Challenge</div></body></html>");
  });

  app.addHook("onClose", async () => {
    await closeDbClient(dbClient);
  });

  return app;
}

export async function startApp(config: AppConfig): Promise<FastifyInstance> {
  await migrateDatabase(config.databaseConnectionString);
  const dbClient = createDbClient(config);
  const realtimeHub = new RealtimeHub();
  const app = await buildApp(config, { dbClient, realtimeHub });
  const coverRefresh = new CoverImageRefreshService(dbClient.pool, undefined, dbClient.db);
  const coverRefreshScheduler = scheduleCoverImageRefresh({ coverRefresh, realtimeHub, logger: app.log });
  app.addHook("onClose", async () => {
    coverRefreshScheduler.stop();
  });

  await app.listen({ port: config.port, host: "0.0.0.0" });
  return app;
}

export async function refreshCoverImagesAndBroadcast(
  coverRefresh: CoverRefreshJob,
  realtimeHub: Pick<RealtimeHub, "broadcastGamesUpdated">
): Promise<number> {
  const updated = await coverRefresh.refreshCoverImages();
  if (updated > 0) {
    realtimeHub.broadcastGamesUpdated();
  }
  return updated;
}

export function scheduleCoverImageRefresh({
  coverRefresh,
  realtimeHub,
  logger,
  initialDelayMs = 60 * 1000,
  intervalMs = 24 * 60 * 60 * 1000
}: CoverRefreshSchedulerOptions): { stop: () => void } {
  let stopped = false;
  let timeout: ReturnType<typeof setTimeout> | undefined;

  const scheduleNext = (delayMs: number) => {
    timeout = setTimeout(() => {
      void run();
    }, delayMs);
    timeout.unref?.();
  };

  logger?.info("Cover Image Update Service Wrapper is starting");

  const run = async () => {
    if (stopped) {
      return;
    }
    try {
      logger?.info("Starting cover image update process");
      const summary = await refreshCoverImagesWithSummary(coverRefresh, realtimeHub, logger);
      if (summary.total === undefined) {
        logger?.info({ updated: summary.updated }, "Cover image update completed");
      } else {
        logger?.info(
          { updated: summary.updated, total: summary.total, skipped: summary.skipped, errors: summary.errors },
          `Cover image update completed. Updated ${summary.updated} out of ${summary.total} games`
        );
      }
      if (summary.updated > 0) {
        logger?.info({ updated: summary.updated }, "Sent GamesUpdated notification to connected clients");
      }
    } catch (error) {
      logger?.error(error, "Failed to update cover images");
    } finally {
      if (!stopped) {
        scheduleNext(intervalMs);
      }
    }
  };

  scheduleNext(initialDelayMs);

  return {
    stop: () => {
      logger?.info("Cover Image Update Service Wrapper is stopping");
      stopped = true;
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  };
}

async function refreshCoverImagesWithSummary(
  coverRefresh: CoverRefreshJob,
  realtimeHub: Pick<RealtimeHub, "broadcastGamesUpdated">,
  logger?: CoverRefreshLogger
): Promise<CoverRefreshSummary> {
  if (coverRefresh.refreshCoverImagesDetailed) {
    let loggedTotal = false;
    const result = await coverRefresh.refreshCoverImagesDetailed(undefined, (progress) => {
      if (!loggedTotal && progress.status === "starting") {
        loggedTotal = true;
        logger?.info({ gameCount: progress.total }, `Updating cover URLs for ${progress.total} games`);
      }
    });
    if (result.updated > 0) {
      realtimeHub.broadcastGamesUpdated();
    }
    return result;
  }

  return { updated: await refreshCoverImagesAndBroadcast(coverRefresh, realtimeHub) };
}
