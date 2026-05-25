import cookie from "@fastify/cookie";
import fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSessionCookie } from "../src/auth/session.js";
import { registerAdminRoutes } from "../src/routes/adminRoutes.js";
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

describe("route error logging", () => {
  let app: ReturnType<typeof fastify> | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("logs unexpected admin route failures before returning a generic 500", async () => {
    app = fastify({ logger: false });
    const errorLog = vi.spyOn(app.log, "error");
    await registerAdminRoutes(
      app,
      {
        getByApiKey: vi.fn(async () => adminUser()),
        getAllUsers: vi.fn(async () => {
          throw new Error("database offline");
        })
      } as never,
      config
    );

    const response = await app.inject({
      method: "GET",
      url: "/api/admin/users",
      headers: { "x-api-key": "admin-key" }
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ message: "Internal server error" });
    expect(errorLog).toHaveBeenCalledWith(expect.objectContaining({ err: expect.any(Error) }), "Failed to get admin users");
  });

  it("logs authenticated-user lookup failures before returning a generic 500", async () => {
    app = fastify({ logger: false });
    const errorLog = vi.spyOn(app.log, "error");
    await app.register(cookie);
    await registerAuthRoutes(
      app,
      {
        getByTwitchId: vi.fn(async () => {
          throw new Error("database offline");
        })
      } as never,
      config
    );

    const response = await app.inject({
      method: "GET",
      url: "/api/auth/user",
      cookies: {
        ".PS2Challenge.Auth": createSessionCookie({ id: 1, twitchId: "tw-1", username: "AdminUser", role: "Admin" }, config.cookieSecret)
      }
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ message: "Internal server error" });
    expect(errorLog).toHaveBeenCalledWith(expect.objectContaining({ err: expect.any(Error), twitchId: "tw-1" }), "Failed to load authenticated user");
  });
});

function adminUser() {
  return {
    id: 1,
    twitchId: "tw-1",
    twitchUsername: "AdminUser",
    profileImageUrl: null,
    roleId: 1,
    roleName: "Admin",
    createdAt: "2026-01-01T00:00:00.000Z",
    lastLoginAt: "2026-01-01T00:00:00.000Z",
    apiKey: null
  };
}
