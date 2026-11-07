import crypto from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AppConfig } from "../config.js";
import { requireAdmin } from "../auth/guards.js";
import { authRouteSchemas, eventSubAdminRouteSchemas, registerOpenApiSchemas } from "../openapi/schemas.js";
import type { UserRepository } from "../repositories/userRepository.js";
import {
  clearAuthCookie,
  clearOAuthStateCookie,
  createOAuthState,
  getCookieUser,
  normalizeReturnUrl,
  oauthStateCookieName,
  readOAuthState,
  sanitizeReturnUrl,
  setAuthCookie,
  setOAuthStateCookie
} from "../auth/session.js";
import { requestOrigin } from "../utils/requestOrigin.js";

type TwitchTokenResponse = {
  access_token: string;
};

type TwitchTokenValidation = {
  user_id?: string;
  scopes?: string[];
};

export type EventSubAuthorization = {
  broadcasterUserId(): Promise<string | null>;
  recordAuthorization(broadcasterUserId: string, actor: { id: number; username: string }): Promise<void>;
};

export type EventSubAuthorizationResult = "authorised" | "wrong-account" | "missing-scope" | "forbidden" | "failed";

const eventSubScope = "channel:read:subscriptions";

type TwitchUserResponse = {
  data?: Array<{
    id: string;
    login?: string;
    display_name?: string;
    profile_image_url?: string;
  }>;
};

export async function registerAuthRoutes(
  app: FastifyInstance,
  userRepository: UserRepository,
  config: AppConfig,
  eventSubAuthorization?: EventSubAuthorization
) {
  registerOpenApiSchemas(app);

  app.get("/api/admin/eventsub/authorize", { schema: eventSubAdminRouteSchemas.authorize }, async (request, reply) => {
    if (!eventSubAuthorization) {
      return reply.status(404).send({ message: "Twitch EventSub is not available" });
    }
    const admin = await requireAdmin(request, reply, userRepository, config);
    if (!admin) return;
    const redirectUri = callbackUriForRequest(request, config);
    const nonce = crypto.randomBytes(16).toString("hex");
    const state = createOAuthState({ redirectUri, nonce, purpose: "eventsub-authorize", adminTwitchId: admin.twitchId }, config.cookieSecret);
    setOAuthStateCookie(reply, nonce);
    const params = new URLSearchParams({
      client_id: config.twitchClientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: eventSubScope,
      force_verify: "true",
      state
    });
    return reply.redirect(`https://id.twitch.tv/oauth2/authorize?${params.toString()}`);
  });

  app.get("/api/auth/login", { schema: authRouteSchemas.login }, async (request, reply) => {
    const returnUrl = typeof request.query === "object" && request.query && "returnUrl" in request.query ? String(request.query.returnUrl) : "/";
    const redirectUri = callbackUriForRequest(request, config);
    const nonce = crypto.randomBytes(16).toString("hex");
    const state = createOAuthState({ returnUrl, redirectUri, nonce }, config.cookieSecret);
    setOAuthStateCookie(reply, nonce);
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

    const state = readOAuthState(query.state, config.cookieSecret);
    const expectedNonce = request.cookies[oauthStateCookieName];
    clearOAuthStateCookie(reply);
    if (!state || !expectedNonce || state.nonce !== expectedNonce) {
      request.log.warn("Rejected OAuth callback with a missing or mismatched state");
      return reply.redirect("/");
    }

    const returnUrl = state.returnUrl;
    const redirectUri = state.redirectUri ?? callbackUriForRequest(request, config);
    if (state.purpose === "eventsub-authorize") {
      const result = await completeEventSubAuthorization(request, query.code, redirectUri, state.adminTwitchId, userRepository, config, eventSubAuthorization);
      return reply.redirect(`/admin/sub-picks?tab=twitch&eventsub=${result}`);
    }
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

async function completeEventSubAuthorization(
  request: FastifyRequest,
  code: string,
  redirectUri: string,
  adminTwitchId: string | undefined,
  userRepository: UserRepository,
  config: AppConfig,
  eventSubAuthorization: EventSubAuthorization | undefined
): Promise<EventSubAuthorizationResult> {
  try {
    const admin = adminTwitchId ? await userRepository.getByTwitchId(adminTwitchId) : null;
    if (!eventSubAuthorization || admin?.roleName !== "Admin") {
      return "forbidden";
    }
    const token = await exchangeCodeForToken(code, config, redirectUri);
    const validation = await validateToken(token.access_token);
    const broadcasterUserId = await eventSubAuthorization.broadcasterUserId();
    if (!broadcasterUserId || validation.user_id !== broadcasterUserId) {
      return "wrong-account";
    }
    if (!validation.scopes?.includes(eventSubScope)) {
      return "missing-scope";
    }
    await eventSubAuthorization.recordAuthorization(broadcasterUserId, { id: admin.id, username: admin.twitchUsername });
    request.log.info({ adminId: admin.id, broadcasterUserId }, "Twitch EventSub subscription access authorised");
    return "authorised";
  } catch (error) {
    request.log.error({ err: error }, "Twitch EventSub authorisation failed");
    return "failed";
  }
}

async function validateToken(accessToken: string): Promise<TwitchTokenValidation> {
  const response = await fetch("https://id.twitch.tv/oauth2/validate", { headers: { Authorization: `OAuth ${accessToken}` } });
  if (!response.ok) {
    throw new Error(`Twitch token validation failed: ${response.status}`);
  }
  return (await response.json()) as TwitchTokenValidation;
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
