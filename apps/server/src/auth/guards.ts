import type { FastifyReply, FastifyRequest } from "fastify";
import type { AppConfig } from "../config.js";
import type { UserRepository } from "../repositories/userRepository.js";
import { getCookieUser, type SessionUser } from "./session.js";

declare module "fastify" {
  interface FastifyRequest {
    authUser?: SessionUser & { authMethod: "Cookie" | "ApiKey" };
  }
}

export async function resolveAuthUser(request: FastifyRequest, userRepository: UserRepository, config: AppConfig) {
  const cookieUser = getCookieUser(request, config);
  if (cookieUser) {
    request.authUser = { ...cookieUser, authMethod: "Cookie" };
    return request.authUser;
  }

  const apiKey = getApiKey(request);
  if (!apiKey) {
    return null;
  }

  let user;
  try {
    user = await userRepository.getByApiKey(apiKey);
  } catch (error) {
    request.log.error({ err: error }, "Error validating API key");
    return null;
  }
  if (!user) {
    request.log.warn({ authMethod: "ApiKey" }, "Invalid API key provided");
    return null;
  }

  request.log.info({ userId: user.id, username: user.twitchUsername, authMethod: "ApiKey" }, `User ${user.twitchUsername} authenticated via API key`);
  request.authUser = {
    id: user.id,
    twitchId: user.twitchId,
    username: user.twitchUsername,
    role: user.roleName ?? "User",
    profileImageUrl: user.profileImageUrl,
    authMethod: "ApiKey"
  };
  return request.authUser;
}

export async function requireAuthenticated(request: FastifyRequest, reply: FastifyReply, userRepository: UserRepository, config: AppConfig) {
  const user = await resolveAuthUser(request, userRepository, config);
  if (!user) {
    await reply.status(401).send();
    return null;
  }
  return user;
}

export async function requireAdmin(request: FastifyRequest, reply: FastifyReply, userRepository: UserRepository, config: AppConfig) {
  const user = await requireAuthenticated(request, reply, userRepository, config);
  if (!user) {
    return null;
  }
  if (user.role !== "Admin") {
    await reply.status(403).send();
    return null;
  }
  return user;
}

export function createRequireAdmin(userRepository: UserRepository, config: AppConfig) {
  return (request: FastifyRequest, reply: FastifyReply) => requireAdmin(request, reply, userRepository, config);
}

export type RequireAdmin = ReturnType<typeof createRequireAdmin>;

function getApiKey(request: FastifyRequest): string | null {
  const header = request.headers["x-api-key"];
  if (typeof header === "string" && header.trim()) {
    return header.trim();
  }
  const authorization = request.headers.authorization;
  if (authorization?.toLocaleLowerCase("en-GB").startsWith("bearer ")) {
    const token = authorization.slice("bearer ".length).trim();
    return token || null;
  }
  return null;
}
