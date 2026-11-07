import { setSubEntryPickRequestSchema } from "@ps2-challenge/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AppConfig } from "../config.js";
import { requireAuthenticated } from "../auth/guards.js";
import { registerOpenApiSchemas, subPickRouteSchemas } from "../openapi/schemas.js";
import type { RealtimeHub } from "../realtime/hub.js";
import type { UserRepository } from "../repositories/userRepository.js";
import { SubDrawError } from "../services/subDrawService.js";
import { SubPickError, type SubPickService } from "../services/subPickService.js";

type SubPickReader = Pick<SubPickService, "summary" | "eligibleGames" | "myEntries" | "setPick">;
export type SubPicksNotifier = Pick<RealtimeHub, "broadcastSubPicksUpdated">;

export function registerSubPickRoutes(
  app: FastifyInstance,
  subPicks: SubPickReader,
  userRepository: UserRepository,
  config: AppConfig,
  realtimeHub: SubPicksNotifier
) {
  registerOpenApiSchemas(app);

  app.get("/api/sub-picks/summary", { schema: subPickRouteSchemas.summary }, async (request, reply) =>
    handle(request, reply, "Failed to load sub pick summary", () => subPicks.summary())
  );

  app.get("/api/sub-picks/eligible-games", { schema: subPickRouteSchemas.eligibleGames }, async (request, reply) =>
    handle(request, reply, "Failed to load eligible games", () => subPicks.eligibleGames())
  );

  app.get("/api/sub-picks/me", { schema: subPickRouteSchemas.mine }, async (request, reply) => {
    const user = await requireAuthenticated(request, reply, userRepository, config);
    if (!user) return;
    return handle(request, reply, "Failed to load sub pick entries", () => subPicks.myEntries(user.twitchId));
  });

  app.put("/api/sub-picks/me/entries/:id/pick", { schema: subPickRouteSchemas.setMyPick }, async (request, reply) => {
    const user = await requireAuthenticated(request, reply, userRepository, config);
    if (!user) return;
    const body = setSubEntryPickRequestSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ message: body.error.issues[0]?.message ?? "Invalid pick" });
    }
    return handle(request, reply, "Failed to update sub pick", async () => {
      const entry = await subPicks.setPick({ id: user.id, username: user.username }, routeId(request), body.data.gameId, user.twitchId);
      realtimeHub.broadcastSubPicksUpdated();
      return entry;
    });
  });
}

export async function handle<T>(request: FastifyRequest, reply: FastifyReply, failureMessage: string, action: () => Promise<T>) {
  try {
    return await action();
  } catch (error) {
    if (error instanceof SubPickError || error instanceof SubDrawError) {
      return reply.status(error.statusCode).send({ message: error.message });
    }
    request.log.error({ err: error }, failureMessage);
    return reply.status(500).send({ message: "Internal server error" });
  }
}

export function routeId(request: FastifyRequest): number {
  return Number.parseInt((request.params as { id: string }).id, 10);
}
