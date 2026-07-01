import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { RequireAdmin } from "../auth/guards.js";
import { gameRouteSchemas } from "../openapi/schemas.js";
import type { RealtimeHub } from "../realtime/hub.js";
import { CoverImageRefreshService } from "../services/coverImageService.js";
import type { GameService } from "../services/gameService.js";
import { HowLongToBeatRefreshService, type HowLongToBeatRefreshProgress } from "../services/howLongToBeatService.js";
import { auditError, auditInfo } from "../utils/audit.js";
import { errorMessage } from "../utils/errors.js";

type NdjsonStream = {
  signal: AbortSignal;
  writeEvent: (event: unknown) => void;
};

export function registerGameRefreshRoutes(
  app: FastifyInstance,
  gameService: GameService,
  requireAdminOrStop: RequireAdmin,
  realtimeHub: RealtimeHub
) {
  app.post("/api/admin/update-cover-images", { schema: gameRouteSchemas.refreshCovers }, async (request, reply) => {
    const user = await requireAdminOrStop(request, reply);
    if (!user) return;
    auditInfo(request.log, user, `AUDIT: Admin ${user.username} started cover image refresh`);
    const refresh = new CoverImageRefreshService(gameService.getPool(), undefined, gameService.getDatabase());
    const result = await refresh.refreshCoverImagesDetailed();
    if (result.updated > 0) {
      realtimeHub.broadcastGamesUpdated();
    }
    auditInfo(request.log, user, `AUDIT: Admin ${user.username} completed cover image refresh`, {
      checked: result.total,
      updated: result.updated,
      skipped: result.skipped,
      errors: result.errors
    });
    return { message: "Cover image update completed", ...result };
  });

  app.post("/api/admin/update-cover-images/stream", { schema: gameRouteSchemas.refreshCoversStream }, async (request, reply) => {
    const user = await requireAdminOrStop(request, reply);
    if (!user) return;
    auditInfo(request.log, user, `AUDIT: Admin ${user.username} started streamed cover image refresh`);

    const stream = startNdjsonStream(request, reply);

    try {
      const refresh = new CoverImageRefreshService(gameService.getPool(), undefined, gameService.getDatabase());
      const result = await refresh.refreshCoverImagesDetailed(stream.signal, (progress) => stream.writeEvent({ type: "progress", ...progress }));
      if (result.updated > 0) {
        realtimeHub.broadcastGamesUpdated();
      }
      auditInfo(request.log, user, `AUDIT: Admin ${user.username} completed streamed cover image refresh`, {
        checked: result.total,
        updated: result.updated,
        skipped: result.skipped,
        errors: result.errors
      });
      stream.writeEvent({ type: "complete", message: "Cover image update completed", ...result });
    } catch (error) {
      auditError(request.log, user, `AUDIT: Admin ${user.username} cover image refresh failed`, {
        error: errorMessage(error)
      });
      stream.writeEvent({
        type: "error",
        message: errorMessage(error)
      });
    } finally {
      reply.raw.end();
    }
  });

  app.post("/api/admin/update-howlongtobeat", { schema: gameRouteSchemas.refreshHowLongToBeat }, async (request, reply) => {
    const user = await requireAdminOrStop(request, reply);
    if (!user) return;
    auditInfo(request.log, user, `AUDIT: Admin ${user.username} started HowLongToBeat refresh`);
    const refresh = new HowLongToBeatRefreshService(gameService.getPool(), undefined, gameService.getDatabase(), { requestDelayMs: 1000 });
    const result = await refresh.refreshHowLongToBeatDataDetailed(undefined, (progress) =>
      logHowLongToBeatRefreshProgressError(request.log, user, progress)
    );
    if (result.updated > 0) {
      realtimeHub.broadcastGamesUpdated();
    }
    auditInfo(request.log, user, `AUDIT: Admin ${user.username} completed HowLongToBeat refresh`, {
      checked: result.total,
      updated: result.updated,
      unchanged: result.unchanged,
      notFound: result.notFound,
      errors: result.errors
    });
    return { message: "HowLongToBeat update completed", ...result };
  });

  app.post("/api/admin/update-howlongtobeat/stream", { schema: gameRouteSchemas.refreshHowLongToBeatStream }, async (request, reply) => {
    const user = await requireAdminOrStop(request, reply);
    if (!user) return;
    auditInfo(request.log, user, `AUDIT: Admin ${user.username} started streamed HowLongToBeat refresh`);

    const stream = startNdjsonStream(request, reply);

    try {
      const refresh = new HowLongToBeatRefreshService(gameService.getPool(), undefined, gameService.getDatabase(), { requestDelayMs: 1000 });
      const result = await refresh.refreshHowLongToBeatDataDetailed(stream.signal, (progress) => {
        logHowLongToBeatRefreshProgressError(request.log, user, progress);
        stream.writeEvent({ type: "progress", ...progress });
      });
      if (result.updated > 0) {
        realtimeHub.broadcastGamesUpdated();
      }
      auditInfo(request.log, user, `AUDIT: Admin ${user.username} completed streamed HowLongToBeat refresh`, {
        checked: result.total,
        updated: result.updated,
        unchanged: result.unchanged,
        notFound: result.notFound,
        errors: result.errors
      });
      stream.writeEvent({ type: "complete", message: "HowLongToBeat update completed", ...result });
    } catch (error) {
      auditError(request.log, user, `AUDIT: Admin ${user.username} HowLongToBeat refresh failed`, {
        error: errorMessage(error)
      });
      stream.writeEvent({
        type: "error",
        message: errorMessage(error)
      });
    } finally {
      reply.raw.end();
    }
  });
}

function startNdjsonStream(request: FastifyRequest, reply: FastifyReply): NdjsonStream {
  const controller = new AbortController();
  request.raw.on("close", () => {
    if (!reply.raw.writableEnded) {
      controller.abort();
    }
  });

  reply.hijack();
  reply.raw.writeHead(200, {
    "content-type": "application/x-ndjson; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive"
  });

  return {
    signal: controller.signal,
    writeEvent(event: unknown): void {
      if (!reply.raw.writableEnded) {
        reply.raw.write(`${JSON.stringify(event)}\n`);
      }
    }
  };
}

function logHowLongToBeatRefreshProgressError(
  logger: Parameters<typeof auditError>[0],
  user: Parameters<typeof auditError>[1],
  progress: HowLongToBeatRefreshProgress
): void {
  if (progress.status !== "error") {
    return;
  }

  auditError(logger, user, `AUDIT: Admin ${user.username} HowLongToBeat refresh error`, {
    gameId: progress.currentGameId,
    gameTitle: progress.currentGameTitle,
    error: progress.error ?? "Unknown HowLongToBeat refresh error",
    processed: progress.processed,
    total: progress.total
  });
}
