import { addAlternateTitleRequestSchema, addSerialNumberRequestSchema, idParamSchema } from "@ps2-challenge/shared";
import type { FastifyInstance } from "fastify";
import type { RequireAdmin } from "../auth/guards.js";
import { gameRouteSchemas } from "../openapi/schemas.js";
import type { RealtimeHub } from "../realtime/hub.js";
import type { GameService } from "../services/gameService.js";
import { auditInfo } from "../utils/audit.js";
import { errorMessage } from "../utils/errors.js";
import { validationMessages } from "../utils/validation.js";

export function registerGameSerialNumberRoutes(
  app: FastifyInstance,
  gameService: GameService,
  requireAdminOrStop: RequireAdmin,
  realtimeHub: RealtimeHub
) {
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
