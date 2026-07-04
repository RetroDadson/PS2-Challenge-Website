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

  it("returns 503 without leaking the failure detail but logs it for operators", async () => {
    app = fastify({ logger: false });
    const warn = vi.spyOn(app.log, "warn");
    await registerHealthRoutes(app, async () => {
      throw new Error("connection to internal-db.example failed for user postgres");
    });

    const response = await app.inject({ method: "GET", url: "/api/health" });

    expect(response.statusCode).toBe(503);
    expect(response.body).not.toContain("internal-db.example");
    expect(response.json()).toEqual({
      status: "Unhealthy",
      totalDuration: expect.any(String),
      checks: [
        {
          name: "database",
          status: "Unhealthy",
          description: "PostgreSQL connection failed",
          duration: expect.any(String),
          tags: ["db", "postgres"]
        }
      ]
    });
    expect(warn).toHaveBeenCalledWith(expect.objectContaining({ err: expect.any(Error) }), "PostgreSQL health check probe failed");
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

  it("handles non-Error dependency failures without exposing detail", async () => {
    app = fastify({ logger: false });
    await registerHealthRoutes(app, async () => {
      throw "database unavailable";
    });

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(503);
    expect(response.body).not.toContain("database unavailable");
    expect(response.json().checks[0]).not.toHaveProperty("exception");
  });

  it("returns a fallback response when the health check itself fails", async () => {
    app = fastify({ logger: false });
    const errorLog = vi.spyOn(app.log, "error");
    await registerHealthRoutes(app, async () => undefined);
    vi.spyOn(performance, "now").mockImplementationOnce(() => {
      throw "clock unavailable";
    });

    const response = await app.inject({ method: "GET", url: "/api/health" });

    expect(response.statusCode).toBe(503);
    expect(response.body).not.toContain("clock unavailable");
    expect(response.json()).toMatchObject({
      status: "Unhealthy",
      checks: [{ name: "health" }]
    });
    expect(errorLog).toHaveBeenCalledWith(expect.objectContaining({ err: "clock unavailable" }), "Error performing health check");
  });
});
