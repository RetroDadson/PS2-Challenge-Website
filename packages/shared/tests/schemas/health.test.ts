import { describe, expect, it } from "vitest";
import { healthCheckResponseSchema, pingResponseSchema } from "../../src/schemas/health.js";

describe("health schemas", () => {
  it("accepts the detailed C# health response shape", () => {
    expect(
      healthCheckResponseSchema.parse({
        status: "Healthy",
        totalDuration: "00:00:00.0123456",
        checks: [
          {
            name: "database",
            status: "Healthy",
            description: "PostgreSQL connection succeeded",
            duration: "00:00:00.0010000",
            exception: null,
            tags: ["db", "postgres"]
          }
        ]
      })
    ).toEqual({
      status: "Healthy",
      totalDuration: "00:00:00.0123456",
      checks: [
        {
          name: "database",
          status: "Healthy",
          description: "PostgreSQL connection succeeded",
          duration: "00:00:00.0010000",
          exception: null,
          tags: ["db", "postgres"]
        }
      ]
    });
  });

  it("accepts the ping response shape", () => {
    expect(
      pingResponseSchema.parse({
        status: "OK",
        timestamp: "2026-05-13T12:00:00.000Z",
        message: "PS2 Challenge API is running"
      })
    ).toEqual({
      status: "OK",
      timestamp: "2026-05-13T12:00:00.000Z",
      message: "PS2 Challenge API is running"
    });
  });
});
