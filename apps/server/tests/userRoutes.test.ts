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

  it("requires an authenticated user for profile and API-key routes", async () => {
    app = await userApp({});

    const profile = await app.inject({ method: "GET", url: "/api/user" });
    const apiKey = await app.inject({ method: "POST", url: "/api/user/api-key" });

    expect(profile.statusCode).toBe(401);
    expect(apiKey.statusCode).toBe(401);
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
});

async function userApp(repository: object) {
  const app = fastify({ logger: false });
  await app.register(cookie);
  await registerUserRoutes(app, repository as never, config);
  return app;
}
