import type { FastifyInstance } from "fastify";
import { registerOpenApiSchemas, twitchRouteSchemas } from "../openapi/schemas.js";
import type { TwitchStreamStats } from "../services/twitchStreamStatsService.js";

export type TwitchStreamStatsProvider = {
  getRecentStreamStats(): Promise<TwitchStreamStats>;
};

export async function registerTwitchRoutes(app: FastifyInstance, twitchStats: TwitchStreamStatsProvider) {
  registerOpenApiSchemas(app);

  app.get("/api/twitch/stream-stats", { schema: twitchRouteSchemas.streamStats }, async (request, reply) => {
    try {
      return await twitchStats.getRecentStreamStats();
    } catch (error) {
      request.log.warn({ err: error }, "Failed to load Twitch stream statistics");
      return reply.status(502).send({ message: "Unable to load Twitch stream statistics" });
    }
  });
}
