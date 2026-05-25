import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDbClient } from "../src/db/client.js";
import { buildApp } from "../src/server.js";
import {
  seedCurrentVote,
  seedGame,
  seedUser,
  startIntegrationDatabase,
  type IntegrationDatabase
} from "./helpers/postgres.js";

const adminApiKey = "admin-api-key";

describe("votes API contract parity", () => {
  let db: IntegrationDatabase;
  let app: FastifyInstance;

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
        cookieSecret: "test-cookie-secret"
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
    await seedUser(db.pool, "Admin", adminApiKey);
  });

  it("allows public vote reads while protecting admin mutations", async () => {
    const current = await app.inject({ method: "GET", url: "/api/votes/current" });
    expect(current.statusCode).toBe(200);
    expect(current.json()).toEqual([]);

    const write = await app.inject({
      method: "POST",
      url: "/api/votes/current",
      payload: [{ gameTitle: "Game", voteCount: 1, gameNumber: 1 }]
    });
    expect(write.statusCode).toBe(401);
  });

  it("uploads vote history and validates round size", async () => {
    await seedGame(db.pool, 1, "Game 1");
    await seedGame(db.pool, 2, "Game 2");
    await seedGame(db.pool, 3, "Game 3");

    const invalid = await app.inject({
      method: "POST",
      url: "/api/votes/upload",
      headers: adminHeaders(),
      payload: [{ voteRound: 1, votes: [{ gameTitle: "Game 1", count: 10 }] }]
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json()).toEqual({ message: "Round 1 must contain exactly 3 vote entries" });

    const uploaded = await app.inject({
      method: "POST",
      url: "/api/votes/upload",
      headers: adminHeaders(),
      payload: [
        {
          voteRound: 1,
          notes: " Test notes ",
          votes: [
            { gameTitle: "Game 1", count: 10, position: 1 },
            { gameTitle: "Game 2", count: 5, position: 2 },
            { gameTitle: "Game 3", count: 2, position: 3 }
          ]
        }
      ]
    });

    expect(uploaded.statusCode).toBe(200);
    expect(uploaded.json()).toEqual({ inserted: 3, updated: 0 });
  });

  it("validates vote upload payload details before writing history", async () => {
    await seedGame(db.pool, 1, "Game 1");
    await seedGame(db.pool, 2, "Game 2");
    await seedGame(db.pool, 3, "Game 3");

    const nonArray = await app.inject({
      method: "POST",
      url: "/api/votes/upload",
      headers: adminHeaders(),
      payload: { voteRound: 1 }
    });
    expect(nonArray.statusCode).toBe(400);
    expect(nonArray.json()).toEqual({ message: "No rounds provided" });

    const duplicateTitle = await app.inject({
      method: "POST",
      url: "/api/votes/upload",
      headers: adminHeaders(),
      payload: [
        {
          voteRound: 1,
          votes: [
            { gameTitle: "Game 1", count: 10, position: 1 },
            { gameTitle: "game 1", count: 5, position: 2 },
            { gameTitle: "Game 3", count: 1, position: 3 }
          ]
        }
      ]
    });
    expect(duplicateTitle.statusCode).toBe(400);
    expect(duplicateTitle.json()).toEqual({ message: "Round 1 contains duplicate game titles" });

    const invalidPosition = await app.inject({
      method: "POST",
      url: "/api/votes/upload",
      headers: adminHeaders(),
      payload: [
        {
          voteRound: 1,
          votes: [
            { gameTitle: "Game 1", count: 10, position: 1 },
            { gameTitle: "Game 2", count: 5, position: 4 },
            { gameTitle: "Game 3", count: 1, position: 3 }
          ]
        }
      ]
    });
    expect(invalidPosition.statusCode).toBe(400);
  });

  it("archives current votes with the existing response body", async () => {
    await seedGame(db.pool, 1, "Game 1");
    await seedGame(db.pool, 2, "Game 2");
    await seedCurrentVote(db.pool, 1, 25, 1);
    await seedCurrentVote(db.pool, 2, 10, 2);

    const response = await app.inject({
      method: "POST",
      url: "/api/votes/archive",
      headers: adminHeaders(),
      payload: { notes: "Archived" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      message: "Current votes archived successfully",
      round: 1,
      archivedCount: 2
    });
  });

  it("archives tied current votes with manual positions from the React modal", async () => {
    await seedGame(db.pool, 1, "Game 1");
    await seedGame(db.pool, 2, "Game 2");
    await seedGame(db.pool, 3, "Game 3");
    await seedCurrentVote(db.pool, 1, 10, 1);
    await seedCurrentVote(db.pool, 2, 10, 2);
    await seedCurrentVote(db.pool, 3, 1, 3);

    const response = await app.inject({
      method: "POST",
      url: "/api/votes/archive",
      headers: adminHeaders(),
      payload: {
        notes: "Tie breaker",
        manualPositions: {
          1: 2,
          2: 1,
          3: 3
        }
      }
    });

    expect(response.statusCode).toBe(200);
    const positions = await db.pool.query<{ game_id: number; position: number; notes: string }>(
      "SELECT game_id, position, notes FROM vote_history ORDER BY game_id"
    );
    expect(positions.rows).toEqual([
      { game_id: 1, position: 2, notes: "Tie breaker" },
      { game_id: 2, position: 1, notes: "Tie breaker" },
      { game_id: 3, position: 3, notes: "Tie breaker" }
    ]);
  });

  it("validates and updates vote count by game number with the C# response shape", async () => {
    const missingBody = await app.inject({
      method: "PUT",
      url: "/api/votes/current/by-game-number",
      headers: adminHeaders()
    });
    expect(missingBody.statusCode).toBe(400);
    expect(missingBody.json()).toEqual({ message: "Request data is required" });

    const invalidGameNumber = await app.inject({
      method: "PUT",
      url: "/api/votes/current/by-game-number",
      headers: adminHeaders(),
      payload: { gameNumber: 4, voteCount: 12 }
    });
    expect(invalidGameNumber.statusCode).toBe(400);
    expect(invalidGameNumber.json()).toEqual({ message: "Game number must be between 1 and 3" });

    const negativeVoteCount = await app.inject({
      method: "PUT",
      url: "/api/votes/current/by-game-number",
      headers: adminHeaders(),
      payload: { gameNumber: 1, voteCount: -1 }
    });
    expect(negativeVoteCount.statusCode).toBe(400);
    expect(negativeVoteCount.json()).toEqual({ message: "Vote count cannot be negative" });

    await seedGame(db.pool, 1, "Game 1");
    await seedCurrentVote(db.pool, 1, 5, 2);

    const updated = await app.inject({
      method: "PUT",
      url: "/api/votes/current/by-game-number",
      headers: adminHeaders(),
      payload: { gameNumber: 2, voteCount: 33 }
    });

    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toEqual({
      message: "Vote count updated successfully for game number 2",
      gameNumber: 2,
      gameTitle: "Game 1",
      gameId: 1,
      voteCount: 33
    });

    const notFound = await app.inject({
      method: "PUT",
      url: "/api/votes/current/by-game-number",
      headers: adminHeaders(),
      payload: { gameNumber: 3, voteCount: 5 }
    });
    expect(notFound.statusCode).toBe(404);
  });

  it("validates current vote writes, deletes, archives, and random fill error paths", async () => {
    const emptyCurrent = await app.inject({
      method: "POST",
      url: "/api/votes/current",
      headers: adminHeaders(),
      payload: []
    });
    expect(emptyCurrent.statusCode).toBe(400);
    expect(emptyCurrent.json()).toEqual({ message: "No votes provided" });

    const missingGame = await app.inject({
      method: "POST",
      url: "/api/votes/current",
      headers: adminHeaders(),
      payload: [{ gameTitle: "Not There", voteCount: 1, gameNumber: 1 }]
    });
    expect(missingGame.statusCode).toBe(400);

    const deleteMissingGame = await app.inject({
      method: "DELETE",
      url: "/api/votes/current/Not%20There",
      headers: adminHeaders()
    });
    expect(deleteMissingGame.statusCode).toBe(404);

    await seedGame(db.pool, 1, "Known Game");
    const deleteMissingCurrentVote = await app.inject({
      method: "DELETE",
      url: "/api/votes/current/Known%20Game",
      headers: adminHeaders()
    });
    expect(deleteMissingCurrentVote.statusCode).toBe(404);

    const emptyArchive = await app.inject({
      method: "POST",
      url: "/api/votes/archive",
      headers: adminHeaders(),
      payload: {}
    });
    expect(emptyArchive.statusCode).toBe(400);

    const noEligibleGames = await app.inject({
      method: "POST",
      url: "/api/votes/current/fill-random",
      headers: adminHeaders(),
      payload: { count: 1 }
    });
    expect(noEligibleGames.statusCode).toBe(400);
  });

  it("fills random votes with the existing response body", async () => {
    const missingBody = await app.inject({
      method: "POST",
      url: "/api/votes/current/fill-random",
      headers: adminHeaders()
    });
    expect(missingBody.statusCode).toBe(400);
    expect(missingBody.json()).toEqual({ message: "Request data is required" });

    const invalidCount = await app.inject({
      method: "POST",
      url: "/api/votes/current/fill-random",
      headers: adminHeaders(),
      payload: { count: 0 }
    });
    expect(invalidCount.statusCode).toBe(400);
    expect(invalidCount.json()).toEqual({ message: "Count must be greater than 0" });

    await seedGame(db.pool, 20, "Game 20");
    await seedGame(db.pool, 21, "Game 21");
    await db.pool.query(
      `
      INSERT INTO game_owned (game_id, own_physical_copy, type_owned)
      VALUES (20, true, 'Base'), (21, true, 'Base')
      `
    );

    const response = await app.inject({
      method: "POST",
      url: "/api/votes/current/fill-random",
      headers: adminHeaders(),
      payload: { count: 2 }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.message).toBe("Successfully added 2 random game(s) to current votes");
    expect(body.addedGames).toHaveLength(2);
    expect(body.addedGames.map((vote: { gameId: number }) => vote.gameId).sort()).toEqual([20, 21]);
  });
});

function adminHeaders() {
  return {
    "x-api-key": adminApiKey
  };
}
