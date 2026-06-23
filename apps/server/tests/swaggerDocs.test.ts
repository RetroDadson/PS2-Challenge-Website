import swagger from "@fastify/swagger";
import fastify from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { openApiRefResolver, openApiTransform, registerOpenApiSchemas } from "../src/openapi/schemas.js";
import { registerAdminRoutes } from "../src/routes/adminRoutes.js";
import { registerAuthRoutes } from "../src/routes/authRoutes.js";
import { registerChallengeRunnerRoutes } from "../src/routes/challengeRunnerRoutes.js";
import { registerGamesRoutes } from "../src/routes/gamesRoutes.js";
import { registerHealthRoutes } from "../src/routes/healthRoutes.js";
import { registerTwitchRoutes } from "../src/routes/twitchRoutes.js";
import { registerUserRoutes } from "../src/routes/userRoutes.js";
import { registerVotesRoutes } from "../src/routes/votesRoutes.js";

const config = {
  nodeEnv: "Testing",
  port: 0,
  databaseConnectionString: "postgres://localhost/test",
  twitchClientId: "test-client",
  twitchClientSecret: "test-secret",
  publicBaseUrl: "http://localhost",
  cookieSecret: "test-cookie-secret"
};

describe("swagger docs", () => {
  let app: ReturnType<typeof fastify> | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("documents the REST contract with summaries, schemas, responses, and auth metadata", async () => {
    app = fastify({ logger: false });
    await app.register(swagger, {
      refResolver: openApiRefResolver,
      transform: openApiTransform,
      openapi: {
        info: { title: "PS2 Challenge API", version: "v1" },
        components: {
          securitySchemes: {
            ApiKey: { type: "apiKey", in: "header", name: "X-API-Key" },
            Cookie: { type: "apiKey", in: "cookie", name: ".PS2Challenge.Auth" }
          }
        }
      }
    });
    registerOpenApiSchemas(app);

    const userRepository = {} as never;
    await registerAuthRoutes(app, userRepository, config);
    await registerUserRoutes(app, userRepository, config);
    await registerAdminRoutes(app, userRepository, config, fakeTwitchStatsService());
    await registerChallengeRunnerRoutes(app, {} as never, {} as never, {} as never, userRepository, config);
    await registerGamesRoutes(app, fakeGameService(), userRepository, config, fakeRealtimeHub());
    await registerTwitchRoutes(app, fakeTwitchStatsService());
    await registerVotesRoutes(app, fakeVoteService(), userRepository, config, fakeRealtimeHub());
    await registerHealthRoutes(app, async () => undefined);
    await app.ready();

    const document = app.swagger() as any;

    expect(document.components.schemas.Game.properties).toEqual(expect.objectContaining({ title: expect.any(Object), firstReleased: expect.any(Object) }));
    expect(document.components.schemas.CurrentVote.properties).toEqual(expect.objectContaining({ gameNumber: expect.any(Object), voteCount: expect.any(Object) }));

    expect(document.paths["/api/games/{id}"].get).toMatchObject({
      tags: ["Games"],
      summary: "Get a game",
      operationId: "getGameById",
      responses: {
        200: expect.any(Object),
        404: expect.any(Object)
      }
    });
    expect(document.paths["/api/games"].post.security).toEqual([{ ApiKey: [] }, { Cookie: [] }]);
    expect(document.paths["/api/games"].post.requestBody).toBeDefined();
    expect(document.paths["/api/votes/current/by-game-number"].put.requestBody).toBeDefined();
    expect(document.paths["/api/twitch/stream-stats"].get.responses["200"]).toBeDefined();
    expect(document.paths["/api/admin/users/{userId}/role"].put.security).toEqual([{ ApiKey: [] }, { Cookie: [] }]);
    expect(document.paths["/api/challenge-runners"].get.responses["200"]).toBeDefined();
    expect(document.paths["/api/admin/challenge-runners"].post.security).toEqual([{ ApiKey: [] }, { Cookie: [] }]);
    expect(document.paths["/api/admin/challenge-runners/refresh-logos"].post.responses["200"]).toBeDefined();
    expect(document.paths["/api/admin/challenge-runners/{id}"].put.requestBody).toBeDefined();
    expect(document.paths["/api/admin/update-twitch-stream-stats"].post.responses["200"]).toBeDefined();
    expect(document.paths["/api/user/preferences/game-table-columns"].put.requestBody).toBeDefined();
    expect(document.paths["/api/user/preferences/game-table-columns"].put.security).toEqual([{ ApiKey: [] }, { Cookie: [] }]);
    expect(document.paths["/api/health"].get.responses["503"]).toBeDefined();

    for (const [path, item] of Object.entries<Record<string, any>>(document.paths)) {
      if (!path.startsWith("/api/") && path !== "/health") {
        continue;
      }
      for (const method of ["get", "post", "put", "delete"] as const) {
        const operation = item[method];
        if (!operation) {
          continue;
        }
        expect(operation.summary, `${method.toUpperCase()} ${path}`).toBeTruthy();
        expect(operation.responses, `${method.toUpperCase()} ${path}`).toBeTruthy();
      }
    }
  });

  it("tolerates undocumented routes while generating the document", () => {
    expect(openApiTransform({ url: "/robots.txt" })).toEqual({ schema: {}, url: "/robots.txt" });
    expect(openApiRefResolver.buildLocalReference({}, {}, "", 3)).toBe("def-3");
    expect(openApiRefResolver.buildLocalReference({ $id: "Named" }, {}, "", 3)).toBe("Named");
    expect(openApiTransform({ schema: { summary: "Plain" }, url: "/plain" })).toEqual({
      schema: { summary: "Plain" },
      url: "/plain"
    });
  });
});

function fakeGameService() {
  return {} as never;
}

function fakeVoteService() {
  return {} as never;
}

function fakeTwitchStatsService() {
  return {
    getRecentStreamStats: async () => ({
      channelLogin: "retrodadson",
      rangeStart: "2024-01-01T00:00:00.000Z",
      rangeEnd: "2024-02-26T00:00:00.000Z",
      rangeWeeks: 8,
      totalStreamSeconds: 7200,
      averageWeeklyStreamSeconds: 900,
      vodCount: 2
    }),
    syncRecentStreams: async () => ({ channelLogin: "retrodadson", checked: 3, upserted: 2, skipped: 1 })
  };
}

function fakeRealtimeHub() {
  return {} as never;
}
