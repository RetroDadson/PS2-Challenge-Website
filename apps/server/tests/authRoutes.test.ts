import cookie from "@fastify/cookie";
import fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSessionCookie } from "../src/auth/session.js";
import { registerAuthRoutes } from "../src/routes/authRoutes.js";

const config = {
  nodeEnv: "Testing",
  port: 0,
  databaseConnectionString: "postgres://localhost/test",
  twitchClientId: "test-client",
  twitchClientSecret: "test-secret",
  publicBaseUrl: "http://localhost",
  cookieSecret: "test-cookie-secret"
};

describe("auth routes", () => {
  let app: ReturnType<typeof fastify> | undefined;

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    await app?.close();
    app = undefined;
  });

  it("redirects callback requests without a code or Twitch user", async () => {
    app = await authApp({
      getByTwitchId: vi.fn()
    });

    const missingCode = await app.inject({ method: "GET", url: "/api/auth/callback" });
    expect(missingCode.statusCode).toBe(302);
    expect(missingCode.headers.location).toBe("/");

    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({ access_token: "token" }))
        .mockResolvedValueOnce(jsonResponse({ data: [] }))
    );

    const noUser = await app.inject({ method: "GET", url: "/api/auth/callback?code=abc&state=not-base64" });
    expect(noUser.statusCode).toBe(302);
    expect(noUser.headers.location).toBe("/");
  });

  it("creates a new Twitch user, updates profile data, sets the auth cookie, and sanitizes restricted return URLs", async () => {
    const repository = {
      getByTwitchId: vi.fn(async () => null),
      createUser: vi.fn(async () => ({
        id: 7,
        twitchId: "tw-7",
        twitchUsername: "Dadson",
        roleName: "User",
        profileImageUrl: null
      })),
      updateLastLogin: vi.fn(async () => undefined),
      updateProfileImage: vi.fn(async () => undefined)
    };
    app = await authApp(repository);
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({ access_token: "token" }))
        .mockResolvedValueOnce(jsonResponse({ data: [{ id: "tw-7", login: "dadson", display_name: "Dadson", profile_image_url: "https://example.com/new.png" }] }))
    );
    const state = Buffer.from(JSON.stringify({ returnUrl: "/admin", redirectUri: "https://www.retrodadson.example/api/auth/callback" }), "utf8").toString(
      "base64url"
    );

    const response = await app.inject({ method: "GET", url: `/api/auth/callback?code=abc&state=${state}` });

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe("/");
    expect(response.headers["set-cookie"]).toContain(".PS2Challenge.Auth=");
    expect(repository.createUser).toHaveBeenCalledWith("tw-7", "Dadson", "https://example.com/new.png");
    expect(repository.updateLastLogin).toHaveBeenCalledWith(7);
    expect(repository.updateProfileImage).toHaveBeenCalledWith(7, "https://example.com/new.png");
    const tokenRequest = vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit;
    expect(tokenRequest.body?.toString()).toContain("redirect_uri=https%3A%2F%2Fwww.retrodadson.example%2Fapi%2Fauth%2Fcallback");
  });

  it("returns authenticated-user fallback states from the session cookie", async () => {
    app = await authApp({
      getByTwitchId: vi.fn(async () => null)
    });

    const anonymous = await app.inject({ method: "GET", url: "/api/auth/user" });
    expect(anonymous.json()).toEqual({ isAuthenticated: false });

    const missingUser = await app.inject({
      method: "GET",
      url: "/api/auth/user",
      cookies: {
        ".PS2Challenge.Auth": createSessionCookie({ id: 1, twitchId: "tw-missing", username: "Gone", role: "User" }, config.cookieSecret)
      }
    });
    expect(missingUser.json()).toEqual({ isAuthenticated: false });
  });
});

async function authApp(repository: object) {
  const app = fastify({ logger: false });
  await app.register(cookie);
  await registerAuthRoutes(app, repository as never, config);
  return app;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}
