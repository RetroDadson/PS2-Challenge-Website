import type { FastifyInstance, FastifyRequest } from "fastify";
import type { AppConfig } from "../config.js";
import { createRequireAdmin } from "../auth/guards.js";
import { registerOpenApiSchemas, subDrawRouteSchemas } from "../openapi/schemas.js";
import type { RealtimeHub } from "../realtime/hub.js";
import type { UserRepository } from "../repositories/userRepository.js";
import type { SubDrawService } from "../services/subDrawService.js";
import type { SubPickStatsService } from "../services/subPickStatsService.js";
import { auditInfo } from "../utils/audit.js";
import { handle, routeId } from "./subPickRoutes.js";

export type SubDrawNotifier = Pick<RealtimeHub, "broadcastWheelUpdated" | "broadcastSubPicksUpdated" | "broadcastGamesUpdated">;
export type RevealScheduler = (callback: () => void, delayMs: number) => void;

type SubDraws = Pick<SubDrawService, "wheel" | "history" | "open" | "shuffle" | "spin" | "respin" | "accept" | "cancel" | "revealDelayMs">;

const scheduleReveal: RevealScheduler = (callback, delayMs) => {
  setTimeout(callback, delayMs).unref();
};

export function registerSubDrawRoutes(
  app: FastifyInstance,
  draws: SubDraws,
  userRepository: UserRepository,
  config: AppConfig,
  realtimeHub: SubDrawNotifier,
  schedule: RevealScheduler = scheduleReveal
) {
  registerOpenApiSchemas(app);
  const requireAdminOrStop = createRequireAdmin(userRepository, config);

  app.get("/api/sub-picks/wheel", { schema: subDrawRouteSchemas.wheel }, (request, reply) =>
    handle(request, reply, "Failed to load the sub pick wheel", () => draws.wheel())
  );

  app.get("/api/sub-picks/history", { schema: subDrawRouteSchemas.history }, (request, reply) =>
    handle(request, reply, "Failed to load the sub pick draw history", () => draws.history())
  );

  app.post("/api/admin/sub-picks/draws", { schema: subDrawRouteSchemas.open }, async (request, reply) => {
    const admin = await requireAdminOrStop(request, reply);
    if (!admin) return;
    return handle(request, reply, "Failed to open the sub pick draw", async () => {
      const draw = await draws.open(admin);
      realtimeHub.broadcastWheelUpdated();
      realtimeHub.broadcastSubPicksUpdated();
      auditInfo(request.log, admin, `AUDIT: Admin ${admin.username} opened the ${draw.kind} sub pick draw for game ${draw.gameNumber}`, {
        drawId: draw.id,
        entryCount: draw.slices.length
      });
      return draw;
    });
  });

  app.post("/api/admin/sub-picks/draws/:id/shuffle", { schema: subDrawRouteSchemas.shuffle }, async (request, reply) => {
    const admin = await requireAdminOrStop(request, reply);
    if (!admin) return;
    return handle(request, reply, "Failed to shuffle the sub pick wheel", async () => {
      const draw = await draws.shuffle(admin, routeId(request));
      realtimeHub.broadcastWheelUpdated();
      auditInfo(request.log, admin, `AUDIT: Admin ${admin.username} shuffled the sub pick wheel for game ${draw.gameNumber}`, {
        drawId: draw.id,
        shuffleCount: draw.shuffleCount
      });
      return draw;
    });
  });

  app.post("/api/admin/sub-picks/draws/:id/spin", { schema: subDrawRouteSchemas.spin }, async (request, reply) => {
    const admin = await requireAdminOrStop(request, reply);
    if (!admin) return;
    return handle(request, reply, "Failed to spin the sub pick wheel", async () => {
      const draw = await draws.spin(admin, routeId(request));
      realtimeHub.broadcastWheelUpdated();
      realtimeHub.broadcastSubPicksUpdated();
      scheduleRevealBroadcast(request, draw.id);
      auditInfo(request.log, admin, `AUDIT: Admin ${admin.username} spun the sub pick wheel for game ${draw.gameNumber}`, {
        drawId: draw.id,
        spinNumber: draw.spinCount
      });
      return draw;
    });
  });

  app.post("/api/admin/sub-picks/draws/:id/respin", { schema: subDrawRouteSchemas.respin }, async (request, reply) => {
    const admin = await requireAdminOrStop(request, reply);
    if (!admin) return;
    return handle(request, reply, "Failed to respin the sub pick wheel", async () => {
      const draw = await draws.respin(admin, routeId(request));
      realtimeHub.broadcastWheelUpdated();
      auditInfo(request.log, admin, `AUDIT: Admin ${admin.username} rejected spin ${draw.spinCount} for game ${draw.gameNumber} to respin`, {
        drawId: draw.id,
        rejected: draw.spin?.result ?? null
      });
      return draw;
    });
  });

  app.post("/api/admin/sub-picks/draws/:id/accept", { schema: subDrawRouteSchemas.accept }, async (request, reply) => {
    const admin = await requireAdminOrStop(request, reply);
    if (!admin) return;
    return handle(request, reply, "Failed to accept the sub pick result", async () => {
      const { draw, gameTitle } = await draws.accept(admin, routeId(request));
      realtimeHub.broadcastWheelUpdated();
      realtimeHub.broadcastSubPicksUpdated();
      realtimeHub.broadcastGamesUpdated();
      auditInfo(request.log, admin, `AUDIT: Admin ${admin.username} accepted '${gameTitle}' as sub pick game ${draw.gameNumber}`, {
        drawId: draw.id,
        winner: draw.winner
      });
      return draw;
    });
  });

  app.post("/api/admin/sub-picks/draws/:id/cancel", { schema: subDrawRouteSchemas.cancel }, async (request, reply) => {
    const admin = await requireAdminOrStop(request, reply);
    if (!admin) return;
    return handle(request, reply, "Failed to cancel the sub pick draw", async () => {
      const draw = await draws.cancel(admin, routeId(request));
      realtimeHub.broadcastWheelUpdated();
      realtimeHub.broadcastSubPicksUpdated();
      auditInfo(request.log, admin, `AUDIT: Admin ${admin.username} cancelled the sub pick draw for game ${draw.gameNumber}`, { drawId: draw.id });
      return draw;
    });
  });

  function scheduleRevealBroadcast(request: FastifyRequest, drawId: number): void {
    void draws
      .revealDelayMs(drawId)
      .then((delayMs) => {
        if (delayMs !== null) schedule(() => realtimeHub.broadcastWheelUpdated(), delayMs);
      })
      .catch((error: unknown) => request.log.error({ err: error, drawId }, "Failed to schedule the sub pick reveal"));
  }
}

export function registerSubPickStatsRoute(app: FastifyInstance, stats: Pick<SubPickStatsService, "stats">) {
  registerOpenApiSchemas(app);
  app.get("/api/sub-picks/stats", { schema: subDrawRouteSchemas.stats }, (request, reply) =>
    handle(request, reply, "Failed to load sub pick stats", () => stats.stats())
  );
}
