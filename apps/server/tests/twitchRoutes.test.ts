import fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerTwitchRoutes } from "../src/routes/twitchRoutes.js";

describe("twitch routes", () => {
  let app: ReturnType<typeof fastify> | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("returns recent stream stats from the provider", async () => {
    app = fastify({ logger: false });
    await registerTwitchRoutes(app, {
      getRecentStreamStats: vi.fn(async () => ({
        channelLogin: "retrodadson",
        rangeStart: "2026-04-08T00:00:00.000Z",
        rangeEnd: "2026-06-03T00:00:00.000Z",
        rangeWeeks: 8,
        totalStreamSeconds: 36_000,
        averageWeeklyStreamSeconds: 4_133.18,
        vodCount: 8
      }))
    });

    const response = await app.inject({ method: "GET", url: "/api/twitch/stream-stats" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(expect.objectContaining({
      channelLogin: "retrodadson",
      totalStreamSeconds: 36_000,
      vodCount: 8
    }));
  });

  it("returns a gateway error when Twitch stats cannot be loaded", async () => {
    app = fastify({ logger: false });
    await registerTwitchRoutes(app, {
      getRecentStreamStats: vi.fn(async () => {
        throw new Error("Twitch is unavailable");
      })
    });

    const response = await app.inject({ method: "GET", url: "/api/twitch/stream-stats" });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toEqual({ message: "Unable to load Twitch stream statistics" });
  });
});
