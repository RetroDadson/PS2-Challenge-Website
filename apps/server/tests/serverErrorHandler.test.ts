import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import type { AppConfig } from "../src/config.js";
import { buildApp } from "../src/server.js";

const config: AppConfig = {
  nodeEnv: "Testing",
  port: 0,
  databaseConnectionString: "postgres://localhost/test",
  twitchClientId: "test-client",
  twitchClientSecret: "test-secret",
  twitchChannelLogin: "retrodadson",
  publicBaseUrl: "http://localhost",
  cookieSecret: "test-cookie-secret",
  logLevel: "info",
  trustProxy: true
};

function stubDbClient() {
  return {
    pool: { end: async () => undefined },
    db: {
      selectFrom: () => {
        throw new Error("connection to internal-db.example failed for user postgres");
      }
    }
  } as never;
}

describe("server error handling", () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("returns a generic 500 without internal detail and applies the report-only CSP", async () => {
    app = await buildApp(config, { dbClient: stubDbClient() });

    const response = await app.inject({ method: "GET", url: "/api/votes/history" });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ message: "Internal server error" });
    expect(response.body).not.toContain("internal-db.example");
    expect(response.headers["content-security-policy-report-only"]).toContain("default-src 'self'");
  });

  it("keeps client-error detail for validation failures", async () => {
    app = await buildApp(config, { dbClient: stubDbClient() });

    const response = await app.inject({ method: "GET", url: "/api/games/abc" });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      statusCode: 400,
      error: "Bad Request",
      message: expect.any(String)
    });
    expect(response.body).not.toContain("internal-db.example");
  });
});
