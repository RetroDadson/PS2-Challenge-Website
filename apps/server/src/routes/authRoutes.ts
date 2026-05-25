import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AppConfig } from "../config.js";
import { authRouteSchemas, registerOpenApiSchemas } from "../openapi/schemas.js";
import type { UserRepository } from "../repositories/userRepository.js";
import { clearAuthCookie, getCookieUser, normalizeReturnUrl, sanitizeReturnUrl, setAuthCookie } from "../auth/session.js";
import { requestOrigin } from "../utils/requestOrigin.js";

type TwitchTokenResponse = {
  access_token: string;
};

type TwitchUserResponse = {
  data?: Array<{
    id: string;
    login?: string;
    display_name?: string;
    profile_image_url?: string;
  }>;
};

export async function registerAuthRoutes(app: FastifyInstance, userRepository: UserRepository, config: AppConfig) {
  registerOpenApiSchemas(app);
  app.get("/api/auth/login", { schema: authRouteSchemas.login }, async (request, reply) => {
    const returnUrl = typeof request.query === "object" && request.query && "returnUrl" in request.query ? String(request.query.returnUrl) : "/";
    const redirectUri = callbackUriForRequest(request, config);
    const state = Buffer.from(JSON.stringify({ returnUrl, redirectUri }), "utf8").toString("base64url");
    const params = new URLSearchParams({
      client_id: config.twitchClientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "user:read:email",
      state
    });
    return reply.redirect(`https://id.twitch.tv/oauth2/authorize?${params.toString()}`);
  });

  app.get("/api/auth/callback", { schema: authRouteSchemas.callback }, async (request, reply) => {
    const query = request.query as { code?: string; state?: string };
    if (!query.code) {
      return reply.redirect("/");
    }

    const returnUrl = decodeState(query.state).returnUrl;
    const redirectUri = decodeState(query.state).redirectUri ?? callbackUriForRequest(request, config);
    const token = await exchangeCodeForToken(query.code, config, redirectUri);
    const twitchUser = await fetchTwitchUser(token.access_token, config);
    if (!twitchUser?.id) {
      return reply.redirect("/");
    }

    let user = await userRepository.getByTwitchId(twitchUser.id);
    user ??= await userRepository.createUser(twitchUser.id, twitchUser.display_name ?? twitchUser.login ?? "TwitchUser", twitchUser.profile_image_url ?? null);
    await userRepository.updateLastLogin(user.id);
    if (twitchUser.profile_image_url && twitchUser.profile_image_url !== user.profileImageUrl) {
      await userRepository.updateProfileImage(user.id, twitchUser.profile_image_url);
    }

    setAuthCookie(
      reply,
      {
        id: user.id,
        twitchId: user.twitchId,
        username: user.twitchUsername,
        role: user.roleName ?? "User",
        profileImageUrl: twitchUser.profile_image_url ?? user.profileImageUrl
      },
      config
    );
    return reply.redirect(sanitizeReturnUrl(returnUrl));
  });

  app.route({
    method: ["GET", "POST"],
    url: "/api/auth/logout",
    schema: authRouteSchemas.logout,
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      clearAuthCookie(reply);
      const query = request.query as { returnUrl?: string };
      return reply.redirect(normalizeReturnUrl(query.returnUrl));
    }
  });

  app.get("/api/auth/user", { schema: authRouteSchemas.user }, async (request, reply) => {
    const session = getCookieUser(request, config);
    if (!session) {
      return { isAuthenticated: false };
    }
    try {
      const user = await userRepository.getByTwitchId(session.twitchId);
      if (!user) {
        return { isAuthenticated: false };
      }
      return {
        isAuthenticated: true,
        twitchId: user.twitchId,
        username: user.twitchUsername,
        role: user.roleName,
        profileImageUrl: user.profileImageUrl
      };
    } catch (error) {
      request.log.error({ err: error, twitchId: session.twitchId }, "Failed to load authenticated user");
      return reply.status(500).send({ message: "Internal server error" });
    }
  });
}

function decodeState(state: string | undefined): { returnUrl?: string; redirectUri?: string } {
  if (!state) {
    return {};
  }
  try {
    return JSON.parse(Buffer.from(state, "base64url").toString("utf8")) as { returnUrl?: string; redirectUri?: string };
  } catch {
    return {};
  }
}

function callbackUriForRequest(request: FastifyRequest, config: AppConfig): string {
  return `${requestOrigin(request, config.publicBaseUrl)}/api/auth/callback`;
}

async function exchangeCodeForToken(code: string, config: AppConfig, redirectUri: string): Promise<TwitchTokenResponse> {
  const response = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.twitchClientId,
      client_secret: config.twitchClientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri
    })
  });
  if (!response.ok) {
    throw new Error(`Twitch token exchange failed: ${response.status}`);
  }
  return (await response.json()) as TwitchTokenResponse;
}

async function fetchTwitchUser(accessToken: string, config: AppConfig) {
  const response = await fetch("https://api.twitch.tv/helix/users", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Client-Id": config.twitchClientId
    }
  });
  if (!response.ok) {
    throw new Error(`Twitch user lookup failed: ${response.status}`);
  }
  const body = (await response.json()) as TwitchUserResponse;
  return body.data?.[0] ?? null;
}
