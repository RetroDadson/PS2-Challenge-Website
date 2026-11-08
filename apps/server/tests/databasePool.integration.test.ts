import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createDbClient } from "../src/db/client.js";
import { buildApp } from "../src/server.js";
import { seedGame, startIntegrationDatabase, type IntegrationDatabase } from "./helpers/postgres.js";

const applicationName = "pool-error-test";

describe("database pool", () => {
  let db: IntegrationDatabase;
  let app: FastifyInstance;

  beforeAll(async () => {
    db = await startIntegrationDatabase();
    const connectionString = `${db.connectionString}?application_name=${applicationName}`;
    app = await buildApp(
      {
        nodeEnv: "Testing",
        port: 0,
        databaseConnectionString: connectionString,
        twitchClientId: "test-client",
        twitchClientSecret: "test-secret",
        publicBaseUrl: "http://localhost",
        cookieSecret: "test-cookie-secret",
        logLevel: "silent"
      },
      { dbClient: createDbClient({ databaseConnectionString: connectionString }) }
    );
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await db?.stop();
  });

  it("logs and recovers when the database closes an idle connection instead of crashing", async () => {
    await seedGame(db.pool, 1, "Survivor");
    const warn = vi.spyOn(app.log, "warn");
    expect((await app.inject({ method: "GET", url: "/api/games" })).statusCode).toBe(200);

    const terminated = await db.pool.query<{ terminated: boolean }>(
      "SELECT pg_terminate_backend(pid) AS terminated FROM pg_stat_activity WHERE application_name = $1",
      [applicationName]
    );
    expect(terminated.rows.length).toBeGreaterThan(0);

    await vi.waitFor(() =>
      expect(warn).toHaveBeenCalledWith(expect.objectContaining({ err: expect.objectContaining({ code: "57P01" }) }), expect.stringContaining("idle connection"))
    );
    const games = await app.inject({ method: "GET", url: "/api/games" });
    expect(games.statusCode).toBe(200);
    expect(games.json()).toEqual([expect.objectContaining({ title: "Survivor" })]);
  });
});
