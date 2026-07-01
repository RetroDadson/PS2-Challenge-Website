import {
  addGameOwnedRequestSchema,
  excludeGameRequestSchema,
  idParamSchema,
  updateExclusionRequestSchema,
  updateOwnershipRequestSchema,
  updateProgressRequestSchema
} from "@ps2-challenge/shared";
import type { FastifyInstance } from "fastify";
import type { RequireAdmin } from "../auth/guards.js";
import { gameRouteSchemas } from "../openapi/schemas.js";
import type { RealtimeHub } from "../realtime/hub.js";
import type { GameService } from "../services/gameService.js";
import { auditInfo } from "../utils/audit.js";
import { errorMessage } from "../utils/errors.js";
import { validationMessages } from "../utils/validation.js";

export function registerGameOwnershipRoutes(
  app: FastifyInstance,
  gameService: GameService,
  requireAdminOrStop: RequireAdmin,
  realtimeHub: RealtimeHub
) {
  app.post("/api/games/exclude", { schema: gameRouteSchemas.excludeLegacy }, async (request, reply) => {
    const user = await requireAdminOrStop(request, reply);
    if (!user) return;
    if (!request.body || typeof request.body !== "object") {
      return reply.status(400).send({ message: "Request data is required" });
    }
    const parsed = excludeGameRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ errors: validationMessages(parsed.error) });
    }
    try {
      const exclusion = await gameService.addExcludedGame(parsed.data.title, parsed.data.reason);
      realtimeHub.broadcastGamesUpdated();
      auditInfo(request.log, user, `AUDIT: Admin ${user.username} excluded game ID ${exclusion.gameId}: ${parsed.data.title}`, {
        gameId: exclusion.gameId,
        gameTitle: parsed.data.title,
        reason: exclusion.reason
      });
      return {
        exclusionId: exclusion.exclusionId,
        gameId: exclusion.gameId,
        reason: exclusion.reason,
        message: `Game '${parsed.data.title}' has been excluded`
      };
    } catch (error) {
      return reply.status(409).send({ error: errorMessage(error) });
    }
  });

  app.put("/api/games/:id/exclusion", { schema: gameRouteSchemas.updateExclusion }, async (request, reply) => {
    const user = await requireAdminOrStop(request, reply);
    if (!user) return;
    const { id } = idParamSchema.parse(request.params);
    if (!request.body || typeof request.body !== "object") {
      return reply.status(400).send({ message: "Request data is required" });
    }
    const parsed = updateExclusionRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ message: "Request data is required" });
    }
    if (parsed.data.isExcluded && !parsed.data.reason?.trim()) {
      return reply.status(400).send({ message: "Reason is required when excluding a game" });
    }
    const game = await gameService.getById(id);
    if (!game) {
      return reply.status(404).send({ message: `Game with ID ${id} not found` });
    }
    if (parsed.data.isExcluded) {
      await gameService.excludeGame(id, parsed.data.reason);
    } else {
      await gameService.includeGame(id);
    }
    realtimeHub.broadcastGamesUpdated();
    auditInfo(request.log, user, `AUDIT: Admin ${user.username} ${parsed.data.isExcluded ? "excluded" : "included"} game ID ${id}: ${game.title}`, {
      gameId: id,
      gameTitle: game.title,
      isExcluded: parsed.data.isExcluded,
      reason: parsed.data.reason
    });
    return {
      message: parsed.data.isExcluded ? `Game '${game.title}' has been excluded` : `Game '${game.title}' has been included`,
      isExcluded: parsed.data.isExcluded,
      reason: parsed.data.reason
    };
  });

  app.post("/api/games/owned", { schema: gameRouteSchemas.ownedLegacy }, async (request, reply) => {
    const user = await requireAdminOrStop(request, reply);
    if (!user) return;
    if (!request.body || typeof request.body !== "object") {
      return reply.status(400).send({ message: "Request data is required" });
    }
    const parsed = addGameOwnedRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ errors: validationMessages(parsed.error) });
    }
    try {
      const ownership = await gameService.addGameOwned(parsed.data.title, {
        ownPhysicalCopy: parsed.data.ownPhysicalCopy,
        typeOwned: parsed.data.typeOwned
      });
      realtimeHub.broadcastGamesUpdated();
      auditInfo(request.log, user, `AUDIT: Admin ${user.username} marked game ID ${ownership.gameId}: ${parsed.data.title} as owned`, {
        gameId: ownership.gameId,
        gameTitle: parsed.data.title,
        ownPhysicalCopy: ownership.ownPhysicalCopy,
        typeOwned: ownership.typeOwned
      });
      return {
        ownershipId: ownership.ownershipId,
        gameId: ownership.gameId,
        ownPhysicalCopy: ownership.ownPhysicalCopy,
        typeOwned: ownership.typeOwned,
        message: `Game '${parsed.data.title}' has been marked as owned`
      };
    } catch (error) {
      return reply.status(409).send({ error: errorMessage(error) });
    }
  });

  app.put("/api/games/:id/ownership", { schema: gameRouteSchemas.updateOwnership }, async (request, reply) => {
    const user = await requireAdminOrStop(request, reply);
    if (!user) return;
    const { id } = idParamSchema.parse(request.params);
    if (!request.body || typeof request.body !== "object") {
      return reply.status(400).send({ message: "Request data is required" });
    }
    const parsed = updateOwnershipRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ message: "Request data is required" });
    }
    const game = await gameService.getById(id);
    if (!game) {
      return reply.status(404).send({ message: `Game with ID ${id} not found` });
    }
    const isOwned = parsed.data.ownPhysicalCopy || !!parsed.data.typeOwned.trim();
    if (isOwned) {
      await gameService.markGameOwned(id, {
        ownPhysicalCopy: parsed.data.ownPhysicalCopy,
        typeOwned: parsed.data.typeOwned
      });
    } else {
      await gameService.removeGameOwnership(id);
    }
    realtimeHub.broadcastGamesUpdated();
    auditInfo(request.log, user, `AUDIT: Admin ${user.username} updated ownership for game ID ${id}: ${game.title} - Owned: ${isOwned}`, {
      gameId: id,
      gameTitle: game.title,
      isOwned,
      ownPhysicalCopy: parsed.data.ownPhysicalCopy,
      typeOwned: parsed.data.typeOwned
    });
    return {
      message: isOwned ? `Game '${game.title}' has been marked as owned` : `Game '${game.title}' ownership has been removed`,
      isOwned,
      ownPhysicalCopy: parsed.data.ownPhysicalCopy,
      typeOwned: parsed.data.typeOwned
    };
  });

  app.post("/api/games/progress", { schema: gameRouteSchemas.updateProgress }, async (request, reply) => {
    const user = await requireAdminOrStop(request, reply);
    if (!user) return;
    if (!request.body || typeof request.body !== "object") {
      return reply.status(400).send({ message: "Request data is required" });
    }
    const parsed = updateProgressRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ errors: validationMessages(parsed.error) });
    }
    try {
      const progress = await gameService.upsertProgress(
        parsed.data.title,
        parsed.data.dateStarted,
        parsed.data.dateFinished,
        parsed.data.completionTime,
        parsed.data.beatenCriteria,
        parsed.data.review,
        parsed.data.platform
      );
      realtimeHub.broadcastGamesUpdated();
      auditInfo(request.log, user, `AUDIT: Admin ${user.username} updated progress for game ID ${progress.gameId}: ${parsed.data.title}`, {
        gameId: progress.gameId,
        gameTitle: parsed.data.title,
        progressId: progress.progressId,
        completionTime: progress.completionTime,
        platform: progress.platform
      });
      return {
        progressId: progress.progressId,
        gameId: progress.gameId,
        dateStarted: progress.dateStarted,
        dateFinished: progress.dateFinished,
        completionTime: progress.completionTime,
        beatenCriteria: progress.beatenCriteria,
        review: progress.review,
        platform: progress.platform,
        message: `Progress for '${parsed.data.title}' has been updated`
      };
    } catch (error) {
      return reply.status(404).send({ error: errorMessage(error) });
    }
  });
}
