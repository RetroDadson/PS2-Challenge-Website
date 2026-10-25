import { setDeathsRequestSchema, type DeathCounterDto } from "@ps2-challenge/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { RequireAdmin } from "../auth/guards.js";
import { gameRouteSchemas } from "../openapi/schemas.js";
import type { RealtimeHub } from "../realtime/hub.js";
import type { GameService } from "../services/gameService.js";
import { auditInfo, type AuditActor } from "../utils/audit.js";
import { validationMessages } from "../utils/validation.js";

const currentDeathsUrl = "/api/games/progress/current/deaths";
const noCurrentGame = { message: "No game is currently in progress" };

export function registerDeathCounterRoutes(
  app: FastifyInstance,
  gameService: GameService,
  requireAdminOrStop: RequireAdmin,
  realtimeHub: RealtimeHub
) {
  app.get(currentDeathsUrl, { schema: gameRouteSchemas.currentDeaths }, async (_request, reply) => {
    const counter = await gameService.currentDeathCounter();
    return counter ?? reply.status(404).send(noCurrentGame);
  });

  app.post(`${currentDeathsUrl}/increment`, { schema: gameRouteSchemas.incrementCurrentDeaths }, async (request, reply) => {
    const user = await requireAdminOrStop(request, reply);
    if (!user) return;
    return sendUpdatedCounter(request, reply, user, "incremented", await gameService.adjustCurrentDeaths(1));
  });

  app.post(`${currentDeathsUrl}/decrement`, { schema: gameRouteSchemas.decrementCurrentDeaths }, async (request, reply) => {
    const user = await requireAdminOrStop(request, reply);
    if (!user) return;
    return sendUpdatedCounter(request, reply, user, "decremented", await gameService.adjustCurrentDeaths(-1));
  });

  app.put(currentDeathsUrl, { schema: gameRouteSchemas.setCurrentDeaths }, async (request, reply) => {
    const user = await requireAdminOrStop(request, reply);
    if (!user) return;
    const parsed = setDeathsRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ errors: validationMessages(parsed.error) });
    }
    return sendUpdatedCounter(request, reply, user, "set", await gameService.setCurrentDeaths(parsed.data.deaths));
  });

  function sendUpdatedCounter(request: FastifyRequest, reply: FastifyReply, user: AuditActor, action: string, counter: DeathCounterDto | null) {
    if (!counter) {
      return reply.status(404).send(noCurrentGame);
    }
    realtimeHub.broadcastGamesUpdated();
    auditInfo(request.log, user, `AUDIT: Admin ${user.username} ${action} ${counter.deathLabel.toLocaleLowerCase("en-GB")} for game ID ${counter.gameId}: ${counter.gameTitle} (now ${counter.deaths})`, {
      gameId: counter.gameId,
      gameTitle: counter.gameTitle,
      progressId: counter.progressId,
      deaths: counter.deaths
    });
    return counter;
  }
}
