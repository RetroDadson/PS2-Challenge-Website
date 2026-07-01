import { createGameSchema, idParamSchema, updateGameSchema } from "@ps2-challenge/shared";
import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config.js";
import { createRequireAdmin } from "../auth/guards.js";
import { gameRouteSchemas, registerOpenApiSchemas } from "../openapi/schemas.js";
import type { UserRepository } from "../repositories/userRepository.js";
import type { RealtimeHub } from "../realtime/hub.js";
import { GameService } from "../services/gameService.js";
import { auditInfo } from "../utils/audit.js";
import { errorMessage } from "../utils/errors.js";
import { validationMessages } from "../utils/validation.js";
import { registerGameOwnershipRoutes } from "./gameOwnershipRoutes.js";
import { registerGameRefreshRoutes } from "./gameRefreshRoutes.js";
import { registerGameSerialNumberRoutes } from "./gameSerialNumberRoutes.js";

export async function registerGamesRoutes(
  app: FastifyInstance,
  gameService: GameService,
  userRepository: UserRepository,
  config: AppConfig,
  realtimeHub: RealtimeHub
) {
  registerOpenApiSchemas(app);
  const requireAdminOrStop = createRequireAdmin(userRepository, config);

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

  registerGameOwnershipRoutes(app, gameService, requireAdminOrStop, realtimeHub);
  registerGameSerialNumberRoutes(app, gameService, requireAdminOrStop, realtimeHub);
  registerGameRefreshRoutes(app, gameService, requireAdminOrStop, realtimeHub);
}
