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
import { TwitchStreamRepository } from "./repositories/twitchStreamRepository.js";
import { ChallengeRunnerRepository } from "./repositories/challengeRunnerRepository.js";
import { UserRepository } from "./repositories/userRepository.js";
import { registerAdminRoutes } from "./routes/adminRoutes.js";
import { registerAuthRoutes } from "./routes/authRoutes.js";
import { registerChallengeRunnerRoutes } from "./routes/challengeRunnerRoutes.js";
import { registerGamesRoutes } from "./routes/gamesRoutes.js";
import { registerHealthRoutes } from "./routes/healthRoutes.js";
import { registerPublicSiteRoutes } from "./routes/publicSiteRoutes.js";
import { registerTwitchRoutes } from "./routes/twitchRoutes.js";
import { registerUserRoutes } from "./routes/userRoutes.js";
import { registerVotesRoutes } from "./routes/votesRoutes.js";
import { CoverImageRefreshService, type CoverImageRefreshResult } from "./services/coverImageService.js";
import { GameService } from "./services/gameService.js";
import { HowLongToBeatRefreshService, type HowLongToBeatDueRefreshResult } from "./services/howLongToBeatService.js";
import { TwitchStreamStatsService } from "./services/twitchStreamStatsService.js";
import { VoteService } from "./services/voteService.js";
import { ChallengeRunnerLogoService } from "./services/challengeRunnerLogoService.js";
import {
  ChallengeRunnerLogoRefreshService,
  type ChallengeRunnerLogoRefreshResult
} from "./services/challengeRunnerLogoRefreshService.js";

export type AppDependencies = {
  dbClient?: DbClient;
  realtimeHub?: RealtimeHub;
  challengeRunnerLogoService?: Pick<ChallengeRunnerLogoService, "resolveLogo">;
  challengeRunnerLogoRefreshService?: Pick<ChallengeRunnerLogoRefreshService, "refreshLogos">;
  twitchStreamStatsService?: Pick<TwitchStreamStatsService, "getRecentStreamStats" | "syncRecentStreams">;
};

type SchedulerLogger = Pick<FastifyBaseLogger, "error" | "info">;

type CoverRefreshJob = Pick<CoverImageRefreshService, "refreshCoverImages"> & Partial<Pick<CoverImageRefreshService, "refreshCoverImagesDetailed">>;
type CoverRefreshSummary = Pick<CoverImageRefreshResult, "updated"> & Partial<Omit<CoverImageRefreshResult, "updated">>;
type HowLongToBeatRefreshJob = Pick<HowLongToBeatRefreshService, "refreshDueHowLongToBeatDataDetailed">;
type TwitchStreamStatsJob = Pick<TwitchStreamStatsService, "syncRecentStreams">;
type ChallengeRunnerLogoRefreshJob = Pick<ChallengeRunnerLogoRefreshService, "refreshLogos">;

type CoverRefreshSchedulerOptions = {
  coverRefresh: CoverRefreshJob;
  realtimeHub: Pick<RealtimeHub, "broadcastGamesUpdated">;
  logger?: SchedulerLogger;
  initialDelayMs?: number;
  intervalMs?: number;
};

type HowLongToBeatRefreshSchedulerOptions = {
  howLongToBeatRefresh: HowLongToBeatRefreshJob;
  realtimeHub: Pick<RealtimeHub, "broadcastGamesUpdated">;
  logger?: SchedulerLogger;
  initialDelayMs?: number;
  backlogIntervalMs?: number;
  intervalMs?: number;
  haltedIntervalMs?: number;
  batchSize?: number;
};

type TwitchStreamStatsSchedulerOptions = {
  twitchStats: TwitchStreamStatsJob;
  logger?: SchedulerLogger;
  initialDelayMs?: number;
  intervalMs?: number;
};

type ChallengeRunnerLogoRefreshSchedulerOptions = {
  challengeRunnerLogoRefresh: ChallengeRunnerLogoRefreshJob;
  logger?: SchedulerLogger;
  initialDelayMs?: number;
  intervalMs?: number;
};

type RecurringJobOptions = {
  logger: SchedulerLogger | undefined;
  initialDelayMs: number;
  intervalMs: number;
  startMessage: string;
  stopMessage: string;
  run: () => Promise<number | void>;
  onError: (error: unknown) => void;
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
  const challengeRunnerRepository = new ChallengeRunnerRepository(dbClient.db);
  const challengeRunnerLogoService = dependencies.challengeRunnerLogoService ?? new ChallengeRunnerLogoService(config);
  const challengeRunnerLogoRefreshService =
    dependencies.challengeRunnerLogoRefreshService ??
    new ChallengeRunnerLogoRefreshService(challengeRunnerRepository, challengeRunnerLogoService, app.log);
  const gameService = new GameService(pool, dbClient.db);
  const twitchStatsRepository = new TwitchStreamRepository(dbClient.db);
  const twitchStatsService = dependencies.twitchStreamStatsService ?? new TwitchStreamStatsService(config, twitchStatsRepository);
  const voteService = new VoteService(pool, dbClient.db);

  app.get("/votesHub", { websocket: true }, (socket) => realtimeHub.register("votes", socket));
  app.get("/gamesHub", { websocket: true }, (socket) => realtimeHub.register("games", socket));

  await registerHealthRoutes(app, () => dbClient.db.selectFrom("platform_types").select("platform").limit(1).executeTakeFirst());
  await registerAuthRoutes(app, userRepository, config);
  await registerUserRoutes(app, userRepository, config);
  await registerAdminRoutes(app, userRepository, config, twitchStatsService);
  await registerChallengeRunnerRoutes(
    app,
    challengeRunnerRepository,
    challengeRunnerLogoService,
    challengeRunnerLogoRefreshService,
    userRepository,
    config
  );
  await registerGamesRoutes(app, gameService, userRepository, config, realtimeHub);
  await registerTwitchRoutes(app, twitchStatsService);
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
  const challengeRunnerLogoService = new ChallengeRunnerLogoService(config);
  const twitchStats = new TwitchStreamStatsService(config, new TwitchStreamRepository(dbClient.db));
  const app = await buildApp(config, { dbClient, realtimeHub, challengeRunnerLogoService, twitchStreamStatsService: twitchStats });
  const coverRefresh = new CoverImageRefreshService(dbClient.pool, undefined, dbClient.db);
  const howLongToBeatRefresh = new HowLongToBeatRefreshService(dbClient.pool, undefined, dbClient.db, { requestDelayMs: 1000 });
  const challengeRunnerLogoRefresh = new ChallengeRunnerLogoRefreshService(
    new ChallengeRunnerRepository(dbClient.db),
    challengeRunnerLogoService,
    app.log
  );
  const coverRefreshScheduler = scheduleCoverImageRefresh({ coverRefresh, realtimeHub, logger: app.log });
  const howLongToBeatRefreshScheduler = scheduleHowLongToBeatRefresh({ howLongToBeatRefresh, realtimeHub, logger: app.log });
  const twitchStatsScheduler = scheduleTwitchStreamStatsSync({ twitchStats, logger: app.log });
  const challengeRunnerLogoRefreshScheduler = scheduleChallengeRunnerLogoRefresh({ challengeRunnerLogoRefresh, logger: app.log });
  app.addHook("onClose", async () => {
    coverRefreshScheduler.stop();
    howLongToBeatRefreshScheduler.stop();
    twitchStatsScheduler.stop();
    challengeRunnerLogoRefreshScheduler.stop();
  });

  await app.listen({ port: config.port, host: "0.0.0.0" });
  return app;
}

export function scheduleHowLongToBeatRefresh({
  howLongToBeatRefresh,
  realtimeHub,
  logger,
  initialDelayMs = 5 * 60 * 1000,
  backlogIntervalMs = 5 * 60 * 1000,
  intervalMs = 6 * 60 * 60 * 1000,
  haltedIntervalMs = 60 * 60 * 1000,
  batchSize = 100
}: HowLongToBeatRefreshSchedulerOptions): { stop: () => void } {
  return scheduleRecurringJob({
    logger,
    initialDelayMs,
    intervalMs,
    startMessage: "HowLongToBeat refresh service is starting",
    stopMessage: "HowLongToBeat refresh service is stopping",
    run: async () => {
      logger?.info({ batchSize }, "Starting scheduled HowLongToBeat refresh batch");
      const result = await howLongToBeatRefresh.refreshDueHowLongToBeatDataDetailed(batchSize);
      logHowLongToBeatRefreshResult(logger, result);
      if (result.updated > 0) {
        realtimeHub.broadcastGamesUpdated();
      }
      if (result.halted) {
        return haltedIntervalMs;
      }
      return result.remainingDue > 0 ? backlogIntervalMs : intervalMs;
    },
    onError: (error) => {
      logger?.error(error, "Scheduled HowLongToBeat refresh failed");
    }
  });
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
  return scheduleRecurringJob({
    logger,
    initialDelayMs,
    intervalMs,
    startMessage: "Cover Image Update Service Wrapper is starting",
    stopMessage: "Cover Image Update Service Wrapper is stopping",
    run: async () => {
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
    },
    onError: (error) => {
      logger?.error(error, "Failed to update cover images");
    }
  });
}

export function scheduleTwitchStreamStatsSync({
  twitchStats,
  logger,
  initialDelayMs = 2 * 60 * 1000,
  intervalMs = 6 * 60 * 60 * 1000
}: TwitchStreamStatsSchedulerOptions): { stop: () => void } {
  return scheduleRecurringJob({
    logger,
    initialDelayMs,
    intervalMs,
    startMessage: "Twitch stream stats sync service is starting",
    stopMessage: "Twitch stream stats sync service is stopping",
    run: async () => {
      logger?.info("Starting Twitch stream stats sync");
      const result = await twitchStats.syncRecentStreams();
      logger?.info(
        {
          channelLogin: result.channelLogin,
          checked: result.checked,
          upserted: result.upserted,
          skipped: result.skipped
        },
        "Twitch stream stats sync completed"
      );
    },
    onError: (error) => {
      logger?.error(error, "Failed to sync Twitch stream stats");
    }
  });
}

export function scheduleChallengeRunnerLogoRefresh({
  challengeRunnerLogoRefresh,
  logger,
  initialDelayMs = 3 * 60 * 1000,
  intervalMs = 2 * 60 * 60 * 1000
}: ChallengeRunnerLogoRefreshSchedulerOptions): { stop: () => void } {
  return scheduleRecurringJob({
    logger,
    initialDelayMs,
    intervalMs,
    startMessage: "Challenge runner profile picture refresh service is starting",
    stopMessage: "Challenge runner profile picture refresh service is stopping",
    run: async () => {
      logger?.info("Starting scheduled challenge runner profile picture refresh");
      const result = await challengeRunnerLogoRefresh.refreshLogos();
      logChallengeRunnerLogoRefreshResult(logger, result);
    },
    onError: (error) => {
      logger?.error(error, "Scheduled challenge runner profile picture refresh failed");
    }
  });
}

function scheduleRecurringJob({
  logger,
  initialDelayMs,
  intervalMs,
  startMessage,
  stopMessage,
  run,
  onError
}: RecurringJobOptions): { stop: () => void } {
  let stopped = false;
  let timeout: ReturnType<typeof setTimeout> | undefined;

  const runScheduledJob = async () => {
    if (stopped) {
      return;
    }
    let nextDelayMs = intervalMs;
    try {
      nextDelayMs = (await run()) ?? intervalMs;
    } catch (error) {
      onError(error);
    } finally {
      if (!stopped) {
        scheduleNext(nextDelayMs);
      }
    }
  };

  const scheduleNext = (delayMs: number) => {
    timeout = setTimeout(() => {
      void runScheduledJob();
    }, delayMs);
    timeout.unref?.();
  };

  logger?.info(startMessage);
  scheduleNext(initialDelayMs);

  return {
    stop: () => {
      logger?.info(stopMessage);
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
  logger?: SchedulerLogger
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

function logHowLongToBeatRefreshResult(logger: SchedulerLogger | undefined, result: HowLongToBeatDueRefreshResult): void {
  logger?.info(
    {
      total: result.total,
      updated: result.updated,
      unchanged: result.unchanged,
      notFound: result.notFound,
      errors: result.errors,
      remainingDue: result.remainingDue,
      halted: result.halted
    },
    "Scheduled HowLongToBeat refresh batch completed"
  );
}

function logChallengeRunnerLogoRefreshResult(
  logger: SchedulerLogger | undefined,
  result: ChallengeRunnerLogoRefreshResult
): void {
  logger?.info(result, "Scheduled challenge runner profile picture refresh completed");
}
