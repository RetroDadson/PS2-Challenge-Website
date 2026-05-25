import fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerHealthRoutes } from "../src/routes/healthRoutes.js";

describe("health API contract parity", () => {
  let app: ReturnType<typeof fastify> | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("returns the C# detailed health shape when dependencies are healthy", async () => {
    app = fastify({ logger: false });
    await registerHealthRoutes(app, async () => undefined);

    const response = await app.inject({ method: "GET", url: "/api/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: "Healthy",
      totalDuration: expect.any(String),
      checks: [
        {
          name: "database",
          status: "Healthy",
          description: "PostgreSQL connection succeeded",
          duration: expect.any(String),
          tags: ["db", "postgres"]
        }
      ]
    });
  });

  it("returns 503 and the C# detailed health shape when dependencies fail", async () => {
    app = fastify({ logger: false });
    const warn = vi.spyOn(app.log, "warn");
    await registerHealthRoutes(app, async () => {
      throw new Error("database offline");
    });

    const response = await app.inject({ method: "GET", url: "/api/health" });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      status: "Unhealthy",
      totalDuration: expect.any(String),
      checks: [
        {
          name: "database",
          status: "Unhealthy",
          description: "PostgreSQL connection failed",
          duration: expect.any(String),
          tags: ["db", "postgres"],
          exception: "database offline"
        }
      ]
    });
    expect(warn).toHaveBeenCalledWith(expect.objectContaining({ status: "Unhealthy" }), "Health check failed: Unhealthy");
  });

  it("preserves the C# ping response body", async () => {
    app = fastify({ logger: false });
    await registerHealthRoutes(app, async () => undefined);

    const response = await app.inject({ method: "GET", url: "/api/health/ping" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: "OK",
      timestamp: expect.any(String),
      message: "PS2 Challenge API is running"
    });
  });
});
