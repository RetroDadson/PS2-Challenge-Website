import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config.js";
import { requireAuthenticated } from "../auth/guards.js";
import { registerOpenApiSchemas, userRouteSchemas } from "../openapi/schemas.js";
import type { UserRepository } from "../repositories/userRepository.js";

export async function registerUserRoutes(app: FastifyInstance, userRepository: UserRepository, config: AppConfig) {
  registerOpenApiSchemas(app);
  app.get("/api/user", { schema: userRouteSchemas.profile }, async (request, reply) => {
    const user = await requireAuthenticated(request, reply, userRepository, config);
    if (!user) return;
    const dbUser = await userRepository.getById(user.id);
    return {
      isAuthenticated: true,
      twitchId: dbUser?.twitchId ?? user.twitchId,
      username: dbUser?.twitchUsername ?? user.username,
      role: dbUser?.roleName ?? user.role,
      profileImageUrl: dbUser?.profileImageUrl ?? user.profileImageUrl,
      createdAt: dbUser?.createdAt ?? null,
      lastLoginAt: dbUser?.lastLoginAt ?? null,
      apiKey: dbUser?.apiKey ?? null
    };
  });

  app.post("/api/user/api-key", { schema: userRouteSchemas.regenerateApiKey }, async (request, reply) => {
    const user = await requireAuthenticated(request, reply, userRepository, config);
    if (!user) return;
    return { apiKey: await userRepository.generateApiKey(user.id) };
  });
}
