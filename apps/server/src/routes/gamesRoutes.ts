import {
  addAlternateTitleRequestSchema,
  addGameOwnedRequestSchema,
  addSerialNumberRequestSchema,
  createGameSchema,
  excludeGameRequestSchema,
  idParamSchema,
  updateExclusionRequestSchema,
  updateGameSchema,
  updateOwnershipRequestSchema,
  updateProgressRequestSchema
} from "@ps2-challenge/shared";
import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config.js";
import { requireAdmin } from "../auth/guards.js";
import { gameRouteSchemas, registerOpenApiSchemas } from "../openapi/schemas.js";
import type { UserRepository } from "../repositories/userRepository.js";
import type { RealtimeHub } from "../realtime/hub.js";
import { CoverImageRefreshService } from "../services/coverImageService.js";
import { GameService } from "../services/gameService.js";
import { HowLongToBeatRefreshService, type HowLongToBeatRefreshProgress } from "../services/howLongToBeatService.js";
import { auditError, auditInfo } from "../utils/audit.js";

export async function registerGamesRoutes(
  app: FastifyInstance,
  gameService: GameService,
  userRepository: UserRepository,
  config: AppConfig,
  realtimeHub: RealtimeHub
) {
  registerOpenApiSchemas(app);
  const requireAdminOrStop = async (request: any, reply: any) => requireAdmin(request, reply, userRepository, config);

  app.get("/api/games", { schema: gameRouteSchemas.list }, async (request) => {
    const query = request.query as { title?: string };
    return gameService.list(query.title);
  });

  app.get("/api/games/ownership-types", { schema: gameRouteSchemas.ownershipTypes }, async () =>
    (await gameService.ownershipTypes()).map((typeOwned) => ({ typeOwned }))
  );
  app.get("/api/games/owned-types", { schema: gameRouteSchemas.ownedTypes }, async () => gameService.ownedTypesMap());
  app.get("/api/games/page-data", { schema: gameRouteSchemas.pageData }, async () => gameService.getGamesPageData());

  app.get("/api/games/progress", { schema: gameRouteSchemas.progress }, async () => gameService.allProgress());

  app.get("/api/games/:id", { schema: gameRouteSchemas.getById }, async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    const game = await gameService.getById(id);
    if (!game) {
      return reply.status(404).send({ message: `Game with ID ${id} not found` });
    }
    return game;
  });

  app.post("/api/games", { schema: gameRouteSchemas.create }, async (request, reply) => {
    const user = await requireAdminOrStop(request, reply);
    if (!user) return;
    if (!request.body || typeof request.body !== "object") {
      return reply.status(400).send({ message: "Game data is required" });
    }
    const parsed = createGameSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ errors: validationMessages(parsed.error) });
    }
    try {
      const created = await gameService.create(parsed.data);
      realtimeHub.broadcastGamesUpdated();
      auditInfo(request.log, user, `AUDIT: Admin ${user.username} created game ID ${created.id}: ${created.title}`, {
        gameId: created.id,
        gameTitle: created.title
      });
      return reply.status(201).header("location", `/api/games/${created.id}`).send(created);
    } catch (error) {
      return reply.status(409).send({ error: errorMessage(error) });
    }
  });

  app.put("/api/games/:id", { schema: gameRouteSchemas.update }, async (request, reply) => {
    const user = await requireAdminOrStop(request, reply);
    if (!user) return;
    const { id } = idParamSchema.parse(request.params);
    if (!request.body || typeof request.body !== "object") {
      return reply.status(400).send({ message: "Game data is required" });
    }
    const parsed = updateGameSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ errors: validationMessages(parsed.error) });
    }
    try {
      const updated = await gameService.update(id, parsed.data);
      realtimeHub.broadcastGamesUpdated();
      auditInfo(request.log, user, `AUDIT: Admin ${user.username} updated game ID ${updated.id}: ${updated.title}`, {
        gameId: updated.id,
        gameTitle: updated.title
      });
      return updated;
    } catch (error) {
      return reply.status(errorMessage(error).startsWith("No game") ? 404 : 409).send({ error: errorMessage(error) });
    }
  });

  app.delete("/api/games/:id", { schema: gameRouteSchemas.delete }, async (request, reply) => {
    const user = await requireAdminOrStop(request, reply);
    if (!user) return;
    const { id } = idParamSchema.parse(request.params);
    const game = await gameService.getById(id);
    if (!game) {
      return reply.status(404).send({ message: `Game with ID ${id} not found` });
    }
    const deleted = await gameService.delete(id);
    if (!deleted) {
      request.log.error({ gameId: id, gameTitle: game.title }, "Failed to delete game");
      return reply.status(500).send({ message: "Failed to delete game" });
    }
    realtimeHub.broadcastGamesUpdated();
    auditInfo(request.log, user, `AUDIT: Admin ${user.username} deleted game ID ${game.id}: ${game.title}`, {
      gameId: game.id,
      gameTitle: game.title
    });
    return { message: `Game '${game.title}' has been deleted` };
  });

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

  app.post("/api/games/serial-numbers", { schema: gameRouteSchemas.addSerialNumber }, async (request, reply) => {
    const user = await requireAdminOrStop(request, reply);
    if (!user) return;
    if (!request.body || typeof request.body !== "object") {
      return reply.status(400).send({ message: "Request data is required" });
    }
    const parsed = addSerialNumberRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ errors: validationMessages(parsed.error) });
    }
    try {
      const serial = await gameService.addSerialNumber(parsed.data.title, parsed.data.serialNumber, parsed.data.region, parsed.data.notes);
      realtimeHub.broadcastGamesUpdated();
      auditInfo(request.log, user, `AUDIT: Admin ${user.username} added serial number '${serial.serial_number}' to game ID ${serial.game_id}: ${serial.gameTitle}`, {
        gameId: serial.game_id,
        gameTitle: serial.gameTitle,
        serialId: serial.serial_id,
        serialNumber: serial.serial_number,
        region: serial.region
      });
      return {
        serialId: serial.serial_id,
        gameId: serial.game_id,
        gameTitle: serial.gameTitle,
        serialNumber: serial.serial_number,
        region: serial.region,
        notes: serial.notes,
        message: `Serial number '${serial.serial_number}' added successfully to '${serial.gameTitle}'`
      };
    } catch (error) {
      const message = errorMessage(error);
      if (message.includes("already exists for game ID")) {
        return reply.status(409).send(serialNumberConflict(message, parsed.data.serialNumber));
      }
      return reply.status(404).send({ error: message });
    }
  });

  app.get("/api/games/:id/serial-numbers", { schema: gameRouteSchemas.listSerialNumbers }, async (request, reply) => {
    const user = await requireAdminOrStop(request, reply);
    if (!user) return;
    const { id } = idParamSchema.parse(request.params);
    const game = await gameService.getById(id);
    if (!game) {
      return reply.status(404).send({ message: `Game with ID ${id} not found` });
    }
    return gameService.listSerialNumbers(id);
  });

  app.delete("/api/games/:id/serial-numbers/:serialId", { schema: gameRouteSchemas.deleteSerialNumber }, async (request, reply) => {
    const user = await requireAdminOrStop(request, reply);
    if (!user) return;
    const params = request.params as { id: string; serialId: string };
    const id = Number.parseInt(params.id, 10);
    const serialId = Number.parseInt(params.serialId, 10);
    const game = await gameService.getById(id);
    if (!game) {
      return reply.status(404).send({ message: `Game with ID ${id} not found` });
    }
    const deleted = await gameService.deleteSerialNumber(id, serialId);
    if (!deleted) {
      return reply.status(404).send({ message: `Serial number with ID ${serialId} not found for game ID ${id}` });
    }
    realtimeHub.broadcastGamesUpdated();
    auditInfo(request.log, user, `AUDIT: Admin ${user.username} deleted serial number ID ${serialId} from game ID ${id}: ${game.title}`, {
      gameId: id,
      gameTitle: game.title,
      serialId
    });
    return { message: `Serial number deleted successfully from '${game.title}'` };
  });

  app.get("/api/games/:id/alternate-titles", { schema: gameRouteSchemas.listAlternateTitles }, async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    const game = await gameService.getById(id);
    if (!game) {
      return reply.status(404).send({ message: `Game with ID ${id} not found` });
    }
    return gameService.getAlternateTitlesForGame(id);
  });

  app.post("/api/games/:id/alternate-titles", { schema: gameRouteSchemas.addAlternateTitle }, async (request, reply) => {
    const user = await requireAdminOrStop(request, reply);
    if (!user) return;
    const { id } = idParamSchema.parse(request.params);
    if (!request.body || typeof request.body !== "object") {
      return reply.status(400).send({ message: "Request data is required" });
    }
    const parsed = addAlternateTitleRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ errors: validationMessages(parsed.error) });
    }
    try {
      const game = await gameService.getById(id);
      if (!game) {
        return reply.status(404).send({ message: `Game with ID ${id} not found` });
      }
      const alternateTitle = await gameService.addAlternateTitle(id, parsed.data.title, parsed.data.notes);
      realtimeHub.broadcastGamesUpdated();
      auditInfo(request.log, user, `AUDIT: Admin ${user.username} added alternate title '${alternateTitle.title}' to game ID ${id}: ${game.title}`, {
        gameId: id,
        gameTitle: game.title,
        alternateTitleId: alternateTitle.alternateTitleId,
        alternateTitle: alternateTitle.title
      });
      return {
        alternateTitleId: alternateTitle.alternateTitleId,
        gameId: alternateTitle.gameId,
        title: alternateTitle.title,
        notes: alternateTitle.notes,
        message: `Alternate title '${alternateTitle.title}' added successfully to '${game.title}'`
      };
    } catch (error) {
      const message = errorMessage(error);
      return reply.status(message.includes("not found") ? 404 : 409).send({ error: message });
    }
  });

  app.delete("/api/games/:id/alternate-titles/:alternateTitleId", { schema: gameRouteSchemas.deleteAlternateTitle }, async (request, reply) => {
    const user = await requireAdminOrStop(request, reply);
    if (!user) return;
    const params = request.params as { id: string; alternateTitleId: string };
    const id = Number.parseInt(params.id, 10);
    const alternateTitleId = Number.parseInt(params.alternateTitleId, 10);
    const game = await gameService.getById(id);
    if (!game) {
      return reply.status(404).send({ message: `Game with ID ${id} not found` });
    }
    const deleted = await gameService.deleteAlternateTitle(id, alternateTitleId);
    if (!deleted) {
      return reply.status(404).send({ message: `Alternate title with ID ${alternateTitleId} not found for game ID ${id}` });
    }
    realtimeHub.broadcastGamesUpdated();
    auditInfo(request.log, user, `AUDIT: Admin ${user.username} deleted alternate title ID ${alternateTitleId} from game ID ${id}: ${game.title}`, {
      gameId: id,
      gameTitle: game.title,
      alternateTitleId
    });
    return { message: `Alternate title deleted successfully from '${game.title}'` };
  });

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

    const writeEvent = (event: unknown) => {
      if (!reply.raw.writableEnded) {
        reply.raw.write(`${JSON.stringify(event)}\n`);
      }
    };

    try {
      const refresh = new CoverImageRefreshService(gameService.getPool(), undefined, gameService.getDatabase());
      const result = await refresh.refreshCoverImagesDetailed(controller.signal, (progress) => writeEvent({ type: "progress", ...progress }));
      if (result.updated > 0) {
        realtimeHub.broadcastGamesUpdated();
      }
      auditInfo(request.log, user, `AUDIT: Admin ${user.username} completed streamed cover image refresh`, {
        checked: result.total,
        updated: result.updated,
        skipped: result.skipped,
        errors: result.errors
      });
      writeEvent({ type: "complete", message: "Cover image update completed", ...result });
    } catch (error) {
      auditError(request.log, user, `AUDIT: Admin ${user.username} cover image refresh failed`, {
        error: errorMessage(error)
      });
      writeEvent({
        type: "error",
        message: error instanceof Error ? error.message : String(error)
      });
    } finally {
      reply.raw.end();
    }
  });

  app.post("/api/admin/update-howlongtobeat", { schema: gameRouteSchemas.refreshHowLongToBeat }, async (request, reply) => {
    const user = await requireAdminOrStop(request, reply);
    if (!user) return;
    auditInfo(request.log, user, `AUDIT: Admin ${user.username} started HowLongToBeat refresh`);
    const refresh = new HowLongToBeatRefreshService(gameService.getPool(), undefined, gameService.getDatabase());
    const result = await refresh.refreshHowLongToBeatDataDetailed(undefined, (progress) =>
      logHowLongToBeatRefreshProgressError(request.log, user, progress)
    );
    if (result.updated > 0) {
      realtimeHub.broadcastGamesUpdated();
    }
    auditInfo(request.log, user, `AUDIT: Admin ${user.username} completed HowLongToBeat refresh`, {
      checked: result.total,
      updated: result.updated,
      skipped: result.skipped,
      errors: result.errors
    });
    return { message: "HowLongToBeat update completed", ...result };
  });

  app.post("/api/admin/update-howlongtobeat/stream", { schema: gameRouteSchemas.refreshHowLongToBeatStream }, async (request, reply) => {
    const user = await requireAdminOrStop(request, reply);
    if (!user) return;
    auditInfo(request.log, user, `AUDIT: Admin ${user.username} started streamed HowLongToBeat refresh`);

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

    const writeEvent = (event: unknown) => {
      if (!reply.raw.writableEnded) {
        reply.raw.write(`${JSON.stringify(event)}\n`);
      }
    };

    try {
      const refresh = new HowLongToBeatRefreshService(gameService.getPool(), undefined, gameService.getDatabase());
      const result = await refresh.refreshHowLongToBeatDataDetailed(controller.signal, (progress) => {
        logHowLongToBeatRefreshProgressError(request.log, user, progress);
        writeEvent({ type: "progress", ...progress });
      });
      if (result.updated > 0) {
        realtimeHub.broadcastGamesUpdated();
      }
      auditInfo(request.log, user, `AUDIT: Admin ${user.username} completed streamed HowLongToBeat refresh`, {
        checked: result.total,
        updated: result.updated,
        skipped: result.skipped,
        errors: result.errors
      });
      writeEvent({ type: "complete", message: "HowLongToBeat update completed", ...result });
    } catch (error) {
      auditError(request.log, user, `AUDIT: Admin ${user.username} HowLongToBeat refresh failed`, {
        error: errorMessage(error)
      });
      writeEvent({
        type: "error",
        message: error instanceof Error ? error.message : String(error)
      });
    } finally {
      reply.raw.end();
    }
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function validationMessages(error: { issues: Array<{ message: string }> }): string[] {
  return error.issues.map((issue) => issue.message);
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

function serialNumberConflict(message: string, serialNumber: string) {
  const match = /game ID (\d+) \('([^']+)'\)/.exec(message);
  if (!match) {
    return { error: message };
  }

  return {
    error: `Serial number '${serialNumber}' already exists`,
    existingGameId: Number.parseInt(match[1]!, 10),
    existingGameTitle: match[2],
    serialNumber
  };
}
