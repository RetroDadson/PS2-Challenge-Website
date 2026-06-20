import cookie from "@fastify/cookie";
import fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSessionCookie } from "../src/auth/session.js";
import { registerUserRoutes } from "../src/routes/userRoutes.js";

const config = {
  nodeEnv: "Testing",
  port: 0,
  databaseConnectionString: "postgres://localhost/test",
  twitchClientId: "test-client",
  twitchClientSecret: "test-secret",
  publicBaseUrl: "http://localhost",
  cookieSecret: "test-cookie-secret"
};

describe("user routes", () => {
  let app: ReturnType<typeof fastify> | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("requires an authenticated user for profile, API-key, and preference routes", async () => {
    app = await userApp({});

    const profile = await app.inject({ method: "GET", url: "/api/user" });
    const apiKey = await app.inject({ method: "POST", url: "/api/user/api-key" });
    const getPreferences = await app.inject({ method: "GET", url: "/api/user/preferences/game-table-columns" });
    const updatePreferences = await app.inject({
      method: "PUT",
      url: "/api/user/preferences/game-table-columns",
      payload: { order: ["cover", "title"], hidden: [] }
    });

    expect(profile.statusCode).toBe(401);
    expect(apiKey.statusCode).toBe(401);
    expect(getPreferences.statusCode).toBe(401);
    expect(updatePreferences.statusCode).toBe(401);
  });

  it("returns database profile fields while falling back to the signed session", async () => {
    app = await userApp({
      getById: vi.fn(async () => ({
        id: 1,
        twitchId: "tw-db",
        twitchUsername: "DbUser",
        roleName: "Admin",
        profileImageUrl: null,
        createdAt: "2024-01-01T00:00:00.000Z",
        lastLoginAt: null,
        apiKey: null
      }))
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/user",
      cookies: {
        ".PS2Challenge.Auth": createSessionCookie({ id: 1, twitchId: "tw-session", username: "SessionUser", role: "User", profileImageUrl: "session.png" }, config.cookieSecret)
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      isAuthenticated: true,
      twitchId: "tw-db",
      username: "DbUser",
      role: "Admin",
      profileImageUrl: "session.png",
      createdAt: "2024-01-01T00:00:00.000Z",
      lastLoginAt: null,
      apiKey: null
    });
  });

  it("regenerates API keys for the current session user", async () => {
    const repository = {
      generateApiKey: vi.fn(async () => "raw-api-key")
    };
    app = await userApp(repository);

    const response = await app.inject({
      method: "POST",
      url: "/api/user/api-key",
      cookies: {
        ".PS2Challenge.Auth": createSessionCookie({ id: 9, twitchId: "tw-9", username: "User", role: "User" }, config.cookieSecret)
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ apiKey: "raw-api-key" });
    expect(repository.generateApiKey).toHaveBeenCalledWith(9);
  });

  it("gets and updates game table preferences for the current session user", async () => {
    const saved = { order: ["cover", "title", "status"] as const, hidden: ["status"] as const };
    const repository = {
      getGameTablePreferences: vi.fn(async () => null),
      updateGameTablePreferences: vi.fn(async () => undefined)
    };
    app = await userApp(repository);
    const cookies = {
      ".PS2Challenge.Auth": createSessionCookie({ id: 9, twitchId: "tw-9", username: "User", role: "User" }, config.cookieSecret)
    };

    const initial = await app.inject({ method: "GET", url: "/api/user/preferences/game-table-columns", cookies });
    const updated = await app.inject({ method: "PUT", url: "/api/user/preferences/game-table-columns", cookies, payload: saved });
    const invalid = await app.inject({
      method: "PUT",
      url: "/api/user/preferences/game-table-columns",
      cookies,
      payload: { order: ["title", "cover"], hidden: [] }
    });

    expect(initial.statusCode).toBe(200);
    expect(initial.json()).toEqual({ preferences: null });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toEqual({ preferences: saved });
    expect(repository.updateGameTablePreferences).toHaveBeenCalledWith(9, saved);
    expect(invalid.statusCode).toBe(400);
    expect(repository.updateGameTablePreferences).toHaveBeenCalledTimes(1);
  });
});

async function userApp(repository: object) {
  const app = fastify({ logger: false });
  await app.register(cookie);
  await registerUserRoutes(app, repository as never, config);
  return app;
}
