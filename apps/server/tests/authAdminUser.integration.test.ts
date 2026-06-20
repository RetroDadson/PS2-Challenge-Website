import { Buffer } from "node:buffer";
import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { authCookieName, createSessionCookie } from "../src/auth/session.js";
import { createDbClient } from "../src/db/client.js";
import { hashApiKey } from "../src/repositories/userRepository.js";
import { buildApp } from "../src/server.js";
import { seedUser, startIntegrationDatabase, type IntegrationDatabase } from "./helpers/postgres.js";

const adminApiKey = "admin-api-key";
const userApiKey = "user-api-key";
const cookieSecret = "test-cookie-secret";

describe("auth, admin, and user API contract parity", () => {
  let db: IntegrationDatabase;
  let app: FastifyInstance;
  let adminUserId: number;
  let normalUserId: number;

  beforeAll(async () => {
    db = await startIntegrationDatabase();
    app = await buildApp(
      {
        nodeEnv: "Testing",
        port: 0,
        databaseConnectionString: db.connectionString,
        twitchClientId: "test-client",
        twitchClientSecret: "test-secret",
        publicBaseUrl: "http://localhost",
        cookieSecret
      },
      { dbClient: createDbClient({ databaseConnectionString: db.connectionString }) }
    );
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await db?.stop();
  });

  beforeEach(async () => {
    await db.reset();
    adminUserId = await seedUser(db.pool, "Admin", adminApiKey, {
      twitchId: "admin-twitch",
      username: "AdminUser",
      profileImageUrl: "https://example.com/admin.png",
      lastLoginAt: "2024-01-02T00:00:00Z"
    });
    normalUserId = await seedUser(db.pool, "User", userApiKey, {
      twitchId: "user-twitch",
      username: "NormalUser",
      profileImageUrl: "https://example.com/user.png",
      lastLoginAt: "2024-01-01T00:00:00Z"
    });
  });

  it("preserves encoded login return URLs in Twitch OAuth state", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/api/auth/login?returnUrl=${encodeURIComponent("https://example.com/votes?tab=current")}`,
      headers: {
        host: "challenge.retrodadson.example",
        "x-forwarded-proto": "https"
      }
    });

    expect(response.statusCode).toBe(302);
    const location = new URL(response.headers.location as string);
    expect(location.origin + location.pathname).toBe("https://id.twitch.tv/oauth2/authorize");
    expect(location.searchParams.get("client_id")).toBe("test-client");
    expect(location.searchParams.get("redirect_uri")).toBe("https://challenge.retrodadson.example/api/auth/callback");
    expect(decodeState(location.searchParams.get("state"))).toEqual({
      returnUrl: "https://example.com/votes?tab=current",
      redirectUri: "https://challenge.retrodadson.example/api/auth/callback"
    });
  });

  it("normalizes logout return URLs the same way as the C# controller", async () => {
    const absolute = await app.inject({
      method: "GET",
      url: "/api/auth/logout?returnUrl=https%3A%2F%2Fexample.com%2Fuser%3Ftab%3Dprofile"
    });
    expect(absolute.statusCode).toBe(302);
    expect(absolute.headers.location).toBe("/user?tab=profile");
    expect(absolute.headers["set-cookie"]).toEqual(expect.stringContaining(`${authCookieName}=`));

    const relative = await app.inject({ method: "POST", url: "/api/auth/logout?returnUrl=dashboard" });
    expect(relative.statusCode).toBe(302);
    expect(relative.headers.location).toBe("/dashboard");
  });

  it("returns unauthenticated or profile payloads from /api/auth/user without exposing API keys", async () => {
    const anonymous = await app.inject({ method: "GET", url: "/api/auth/user" });
    expect(anonymous.statusCode).toBe(200);
    expect(anonymous.json()).toEqual({ isAuthenticated: false });

    const missingUser = await app.inject({
      method: "GET",
      url: "/api/auth/user",
      headers: { cookie: sessionCookie({ id: 999, twitchId: "missing-twitch", username: "MissingUser", role: "Admin" }) }
    });
    expect(missingUser.statusCode).toBe(200);
    expect(missingUser.json()).toEqual({ isAuthenticated: false });

    const profile = await app.inject({
      method: "GET",
      url: "/api/auth/user",
      headers: { cookie: sessionCookie({ id: adminUserId, twitchId: "admin-twitch", username: "Ignored", role: "Admin" }) }
    });
    expect(profile.statusCode).toBe(200);
    expect(profile.json()).toEqual({
      isAuthenticated: true,
      twitchId: "admin-twitch",
      username: "AdminUser",
      role: "Admin",
      profileImageUrl: "https://example.com/admin.png"
    });
  });

  it("supports cookie and API-key admin auth while rejecting missing, basic, invalid, and non-admin credentials", async () => {
    const missing = await app.inject({ method: "GET", url: "/api/admin/users" });
    expect(missing.statusCode).toBe(401);

    const basic = await app.inject({ method: "GET", url: "/api/admin/users", headers: { authorization: "Basic abc123" } });
    expect(basic.statusCode).toBe(401);

    const invalid = await app.inject({ method: "GET", url: "/api/admin/users", headers: { "x-api-key": "bad-key" } });
    expect(invalid.statusCode).toBe(401);

    const user = await app.inject({ method: "GET", url: "/api/admin/users", headers: { "x-api-key": userApiKey } });
    expect(user.statusCode).toBe(403);

    const headerAdmin = await app.inject({ method: "GET", url: "/api/admin/users", headers: adminHeaders() });
    expect(headerAdmin.statusCode).toBe(200);

    const bearerAdmin = await app.inject({ method: "GET", url: "/api/admin/roles", headers: { authorization: `Bearer ${adminApiKey}` } });
    expect(bearerAdmin.statusCode).toBe(200);

    const cookieAdmin = await app.inject({
      method: "GET",
      url: "/api/admin/roles",
      headers: { cookie: sessionCookie({ id: adminUserId, twitchId: "admin-twitch", username: "AdminUser", role: "Admin" }) }
    });
    expect(cookieAdmin.statusCode).toBe(200);
  });

  it("returns the C# admin users and roles JSON shape", async () => {
    const users = await app.inject({ method: "GET", url: "/api/admin/users", headers: adminHeaders() });
    expect(users.statusCode).toBe(200);
    expect(users.json()).toEqual([
      expect.objectContaining({
        id: adminUserId,
        twitchId: "admin-twitch",
        username: "AdminUser",
        role: "Admin",
        roleId: await getRoleId(db.pool, "Admin"),
        profileImageUrl: "https://example.com/admin.png"
      }),
      expect.objectContaining({
        id: normalUserId,
        twitchId: "user-twitch",
        username: "NormalUser",
        role: "User",
        roleId: await getRoleId(db.pool, "User"),
        profileImageUrl: "https://example.com/user.png"
      })
    ]);
    expect(Object.keys(users.json()[0]).sort()).toEqual(["createdAt", "id", "lastLoginAt", "profileImageUrl", "role", "roleId", "twitchId", "username"]);

    const roles = await app.inject({ method: "GET", url: "/api/admin/roles", headers: { authorization: `Bearer ${adminApiKey}` } });
    expect(roles.statusCode).toBe(200);
    expect(roles.json()).toEqual([
      { id: await getRoleId(db.pool, "Admin"), name: "Admin", description: "Administrator with full permissions" },
      { id: await getRoleId(db.pool, "User"), name: "User", description: "Standard user with basic permissions" }
    ]);
  });

  it("matches C# role update validation, self-demotion protection, and success payload", async () => {
    const userRoleId = await getRoleId(db.pool, "User");
    const adminRoleId = await getRoleId(db.pool, "Admin");

    const missingUser = await app.inject({
      method: "PUT",
      url: "/api/admin/users/999/role",
      headers: adminHeaders(),
      payload: { roleId: userRoleId }
    });
    expect(missingUser.statusCode).toBe(404);
    expect(missingUser.json()).toEqual({ message: "User not found" });

    const invalidRole = await app.inject({
      method: "PUT",
      url: `/api/admin/users/${normalUserId}/role`,
      headers: adminHeaders(),
      payload: { roleId: 999 }
    });
    expect(invalidRole.statusCode).toBe(400);
    expect(invalidRole.json()).toEqual({ message: "Invalid role ID" });

    const selfDemotionByTwitchId = await app.inject({
      method: "PUT",
      url: `/api/admin/users/${adminUserId}/role`,
      headers: { cookie: sessionCookie({ id: 999, twitchId: "admin-twitch", username: "AdminUser", role: "Admin" }) },
      payload: { roleId: userRoleId }
    });
    expect(selfDemotionByTwitchId.statusCode).toBe(400);
    expect(selfDemotionByTwitchId.json()).toEqual({ message: "You cannot remove your own admin role" });

    const updated = await app.inject({
      method: "PUT",
      url: `/api/admin/users/${normalUserId}/role`,
      headers: adminHeaders(),
      payload: { roleId: adminRoleId }
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toEqual({
      id: normalUserId,
      username: "NormalUser",
      role: "Admin",
      message: "User role updated to Admin"
    });
  });

  it("regenerates a raw API key, stores only its hash, and accepts the new raw key", async () => {
    const regenerated = await app.inject({
      method: "POST",
      url: "/api/user/api-key",
      headers: { authorization: `Bearer ${userApiKey}` },
      payload: {}
    });
    expect(regenerated.statusCode).toBe(200);
    const rawApiKey = regenerated.json().apiKey as string;
    expect(rawApiKey).toMatch(/^[a-f0-9]{64}$/);

    const stored = await db.pool.query<{ api_key: string }>("SELECT api_key FROM users WHERE id = $1", [normalUserId]);
    expect(stored.rows[0]?.api_key).toBe(hashApiKey(rawApiKey));

    const profile = await app.inject({ method: "GET", url: "/api/user", headers: { authorization: `Bearer ${rawApiKey}` } });
    expect(profile.statusCode).toBe(200);
    expect(profile.json()).toEqual(
      expect.objectContaining({
        isAuthenticated: true,
        twitchId: "user-twitch",
        username: "NormalUser",
        role: "User",
        apiKey: hashApiKey(rawApiKey)
      })
    );
  });

  it("persists validated game table preferences for authenticated users", async () => {
    const headers = { authorization: `Bearer ${userApiKey}` };
    const preferences = {
      order: ["cover", "title", "status", "developer", "publisher"],
      hidden: ["publisher"]
    };

    const initial = await app.inject({ method: "GET", url: "/api/user/preferences/game-table-columns", headers });
    expect(initial.statusCode).toBe(200);
    expect(initial.json()).toEqual({ preferences: null });

    const updated = await app.inject({
      method: "PUT",
      url: "/api/user/preferences/game-table-columns",
      headers,
      payload: preferences
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toEqual({ preferences });

    const stored = await db.pool.query<{ game_table_preferences: unknown }>(
      "SELECT game_table_preferences FROM users WHERE id = $1",
      [normalUserId]
    );
    expect(stored.rows[0]?.game_table_preferences).toEqual(preferences);

    const loaded = await app.inject({ method: "GET", url: "/api/user/preferences/game-table-columns", headers });
    expect(loaded.json()).toEqual({ preferences });

    const invalid = await app.inject({
      method: "PUT",
      url: "/api/user/preferences/game-table-columns",
      headers,
      payload: { order: ["title", "cover"], hidden: [] }
    });
    expect(invalid.statusCode).toBe(400);
  });
});

function adminHeaders() {
  return {
    "x-api-key": adminApiKey
  };
}

function decodeState(state: string | null) {
  return JSON.parse(Buffer.from(state ?? "", "base64url").toString("utf8")) as unknown;
}

function sessionCookie(user: { id: number; twitchId: string; username: string; role: string }) {
  return `${authCookieName}=${createSessionCookie(user, cookieSecret)}`;
}

async function getRoleId(pool: pg.Pool, name: "Admin" | "User") {
  const result = await pool.query<{ id: number }>("SELECT id FROM roles WHERE name = $1", [name]);
  return result.rows[0]!.id;
}
