import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createDbClient } from "../src/db/client.js";
import { buildApp } from "../src/server.js";
import { seedGame, seedUser, startIntegrationDatabase, type IntegrationDatabase } from "./helpers/postgres.js";

const adminApiKey = "admin-api-key";

describe("games API contract parity", () => {
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

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  beforeEach(async () => {
    await db.reset();
    await seedUser(db.pool, "Admin", adminApiKey);
  });

  it("allows public game reads while protecting admin mutations", async () => {
    await seedGame(db.pool, 1, "Readable Game");

    const read = await app.inject({ method: "GET", url: "/api/games" });
    expect(read.statusCode).toBe(200);
    expect(read.json()).toEqual([expect.objectContaining({ id: 1, title: "Readable Game" })]);

    const write = await app.inject({ method: "POST", url: "/api/games", payload: validGamePayload("Blocked Game") });
    expect(write.statusCode).toBe(401);
  });

  it("refreshes and returns cached HowLongToBeat metadata for games", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        if (String(input).includes("/api/bleed/init")) {
          return new Response(JSON.stringify({ token: "auth-token", hpKey: "ign_test", hpVal: "hidden-value" }), {
            status: 200,
            headers: { "content-type": "application/json" }
          });
        }
        return new Response(
          JSON.stringify({
            data: [
              {
                game_id: 12345,
                game_name: "Readable Game",
                comp_main: 5400,
                comp_plus: 7200,
                comp_100: 10_800,
                similarity: 1
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      })
    );
    await seedGame(db.pool, 1, "Readable Game");

    const refresh = await app.inject({
      method: "POST",
      url: "/api/admin/update-howlongtobeat",
      headers: adminHeaders(),
      payload: {}
    });
    expect(refresh.statusCode).toBe(200);
    expect(refresh.json()).toEqual({ message: "HowLongToBeat update completed", total: 1, updated: 1, skipped: 0, errors: 0 });

    const cached = await db.pool.query<{
      game_id: number;
      howlongtobeat_id: number;
      main_story_seconds: number;
      main_extra_seconds: number;
      completionist_seconds: number;
    }>("SELECT game_id, howlongtobeat_id, main_story_seconds, main_extra_seconds, completionist_seconds FROM game_howlongtobeat");
    expect(cached.rows).toEqual([
      {
        game_id: 1,
        howlongtobeat_id: 12345,
        main_story_seconds: 5400,
        main_extra_seconds: 7200,
        completionist_seconds: 10_800
      }
    ]);

    const read = await app.inject({ method: "GET", url: "/api/games" });
    expect(read.json()).toEqual([
      expect.objectContaining({
        id: 1,
        title: "Readable Game",
        howLongToBeatId: 12345,
        howLongToBeatMainStorySeconds: 5400,
        howLongToBeatMainExtraSeconds: 7200,
        howLongToBeatCompletionistSeconds: 10_800
      })
    ]);
  });

  it("returns C#-style validation errors for invalid game creation", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/games",
      headers: adminHeaders(),
      payload: {
        title: "",
        developer: "",
        publisher: "p".repeat(101),
        regionFirstReleasedIn: "",
        releasedInEuPalOrNa: false
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      errors: [
        "Title is required",
        "Developer is required",
        "Publisher cannot exceed 100 characters",
        "Region first released in is required"
      ]
    });
  });

  it("creates games with the existing location header and response shape", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/games",
      headers: adminHeaders(),
      payload: validGamePayload("New Game")
    });

    expect(response.statusCode).toBe(201);
    expect(response.headers.location).toBe("/api/games/1");
    expect(response.json()).toEqual(
      expect.objectContaining({
        id: 1,
        title: "New Game",
        developer: "New Developer",
        publisher: "New Publisher",
        regionFirstReleasedIn: "NA",
        releasedInEuPalOrNa: true
      })
    );
  });

  it("returns C#-style exclusion payloads and validation messages", async () => {
    await seedGame(db.pool, 1, "Exclude Me");

    const missingReason = await app.inject({
      method: "POST",
      url: "/api/games/exclude",
      headers: adminHeaders(),
      payload: { title: "Exclude Me", reason: "" }
    });
    expect(missingReason.statusCode).toBe(400);
    expect(missingReason.json()).toEqual({ errors: ["Reason is required"] });

    const excluded = await app.inject({
      method: "POST",
      url: "/api/games/exclude",
      headers: adminHeaders(),
      payload: { title: "Exclude Me", reason: "Testing" }
    });
    expect(excluded.statusCode).toBe(200);
    expect(excluded.json()).toEqual({
      exclusionId: 1,
      gameId: 1,
      reason: "Testing",
      message: "Game 'Exclude Me' has been excluded"
    });

    const updateMissingReason = await app.inject({
      method: "PUT",
      url: "/api/games/1/exclusion",
      headers: adminHeaders(),
      payload: { isExcluded: true }
    });
    expect(updateMissingReason.statusCode).toBe(400);
    expect(updateMissingReason.json()).toEqual({ message: "Reason is required when excluding a game" });
  });

  it("returns structured serial-number conflict payloads", async () => {
    await seedGame(db.pool, 1, "Game 1");
    await seedGame(db.pool, 2, "Game 2");

    const created = await app.inject({
      method: "POST",
      url: "/api/games/serial-numbers",
      headers: adminHeaders(),
      payload: { title: "Game 1", serialNumber: "SLUS-20062", region: "NTSC-U", notes: null }
    });
    expect(created.statusCode).toBe(200);

    const duplicate = await app.inject({
      method: "POST",
      url: "/api/games/serial-numbers",
      headers: adminHeaders(),
      payload: { title: "Game 2", serialNumber: "SLUS-20062", region: "PAL", notes: null }
    });

    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json()).toEqual({
      error: "Serial number 'SLUS-20062' already exists",
      existingGameId: 1,
      existingGameTitle: "Game 1",
      serialNumber: "SLUS-20062"
    });
  });

  it("returns the C# progress update confirmation payload", async () => {
    await seedGame(db.pool, 1, "Progress Game");

    const response = await app.inject({
      method: "POST",
      url: "/api/games/progress",
      headers: adminHeaders(),
      payload: {
        title: "Progress Game",
        dateStarted: "2024-01-01",
        dateFinished: "2024-01-15",
        completionTime: "12:30:00",
        beatenCriteria: "Credits",
        review: "Great",
        platform: "Physical"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(
      expect.objectContaining({
        progressId: 1,
        gameId: 1,
        dateStarted: "2024-01-01",
        dateFinished: "2024-01-15",
        completionTime: "12:30:00",
        beatenCriteria: "Credits",
        review: "Great",
        platform: "Physical",
        message: "Progress for 'Progress Game' has been updated"
      })
    );
  });

  it("returns C# public read shapes for missing games and ownership types", async () => {
    const missing = await app.inject({ method: "GET", url: "/api/games/999" });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toEqual({ message: "Game with ID 999 not found" });

    const ownershipTypes = await app.inject({ method: "GET", url: "/api/games/ownership-types" });
    expect(ownershipTypes.statusCode).toBe(200);
    expect(ownershipTypes.json()).toEqual([{ typeOwned: "Base" }, { typeOwned: "Platinum" }]);
  });

  it("updates and deletes games with C# status codes and payloads", async () => {
    await seedGame(db.pool, 1, "Original Game");
    await seedGame(db.pool, 2, "Existing Game");

    const updated = await app.inject({
      method: "PUT",
      url: "/api/games/1",
      headers: adminHeaders(),
      payload: validGamePayload("Updated Game")
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toEqual(expect.objectContaining({ id: 1, title: "Updated Game" }));

    const duplicate = await app.inject({
      method: "PUT",
      url: "/api/games/1",
      headers: adminHeaders(),
      payload: validGamePayload("Existing Game")
    });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json()).toEqual({ error: "A game with the title 'Existing Game' already exists" });

    const missingDelete = await app.inject({ method: "DELETE", url: "/api/games/999", headers: adminHeaders() });
    expect(missingDelete.statusCode).toBe(404);
    expect(missingDelete.json()).toEqual({ message: "Game with ID 999 not found" });

    const deleted = await app.inject({ method: "DELETE", url: "/api/games/1", headers: adminHeaders() });
    expect(deleted.statusCode).toBe(200);
    expect(deleted.json()).toEqual({ message: "Game 'Updated Game' has been deleted" });
  });

  it("returns C# edge-case responses for editor mutations", async () => {
    await seedGame(db.pool, 1, "Editor Game");
    await seedGame(db.pool, 2, "Duplicate Game");

    const duplicateCreate = await app.inject({
      method: "POST",
      url: "/api/games",
      headers: adminHeaders(),
      payload: validGamePayload("Editor Game")
    });
    expect(duplicateCreate.statusCode).toBe(409);

    const updateMissingBody = await app.inject({ method: "PUT", url: "/api/games/1", headers: adminHeaders() });
    expect(updateMissingBody.statusCode).toBe(400);
    expect(updateMissingBody.json()).toEqual({ message: "Game data is required" });

    const updateMissingGame = await app.inject({
      method: "PUT",
      url: "/api/games/999",
      headers: adminHeaders(),
      payload: validGamePayload("Missing Game")
    });
    expect(updateMissingGame.statusCode).toBe(404);

    const excludeMissingBody = await app.inject({ method: "POST", url: "/api/games/exclude", headers: adminHeaders() });
    expect(excludeMissingBody.statusCode).toBe(400);

    const excludeMissingGame = await app.inject({
      method: "POST",
      url: "/api/games/exclude",
      headers: adminHeaders(),
      payload: { title: "Not There", reason: "Missing" }
    });
    expect(excludeMissingGame.statusCode).toBe(409);

    await app.inject({
      method: "POST",
      url: "/api/games/exclude",
      headers: adminHeaders(),
      payload: { title: "Editor Game", reason: "Testing" }
    });
    const duplicateExclude = await app.inject({
      method: "POST",
      url: "/api/games/exclude",
      headers: adminHeaders(),
      payload: { title: "Editor Game", reason: "Testing again" }
    });
    expect(duplicateExclude.statusCode).toBe(409);

    const updateExclusionMissingBody = await app.inject({ method: "PUT", url: "/api/games/1/exclusion", headers: adminHeaders() });
    expect(updateExclusionMissingBody.statusCode).toBe(400);

    const updateExclusionMissingGame = await app.inject({
      method: "PUT",
      url: "/api/games/999/exclusion",
      headers: adminHeaders(),
      payload: { isExcluded: false }
    });
    expect(updateExclusionMissingGame.statusCode).toBe(404);

    const ownedMissingBody = await app.inject({ method: "POST", url: "/api/games/owned", headers: adminHeaders() });
    expect(ownedMissingBody.statusCode).toBe(400);

    const ownedMissingGame = await app.inject({
      method: "POST",
      url: "/api/games/owned",
      headers: adminHeaders(),
      payload: { title: "Not There", ownPhysicalCopy: true, typeOwned: "Base" }
    });
    expect(ownedMissingGame.statusCode).toBe(409);

    await app.inject({
      method: "POST",
      url: "/api/games/owned",
      headers: adminHeaders(),
      payload: { title: "Editor Game", ownPhysicalCopy: true, typeOwned: "Base" }
    });
    const duplicateOwned = await app.inject({
      method: "POST",
      url: "/api/games/owned",
      headers: adminHeaders(),
      payload: { title: "Editor Game", ownPhysicalCopy: true, typeOwned: "Base" }
    });
    expect(duplicateOwned.statusCode).toBe(409);

    const updateOwnershipMissingBody = await app.inject({ method: "PUT", url: "/api/games/1/ownership", headers: adminHeaders() });
    expect(updateOwnershipMissingBody.statusCode).toBe(400);

    const updateOwnershipMissingGame = await app.inject({
      method: "PUT",
      url: "/api/games/999/ownership",
      headers: adminHeaders(),
      payload: { ownPhysicalCopy: true, typeOwned: "Base" }
    });
    expect(updateOwnershipMissingGame.statusCode).toBe(404);

    const progressMissingBody = await app.inject({ method: "POST", url: "/api/games/progress", headers: adminHeaders() });
    expect(progressMissingBody.statusCode).toBe(400);

    const progressMissingGame = await app.inject({
      method: "POST",
      url: "/api/games/progress",
      headers: adminHeaders(),
      payload: { title: "Not There", dateStarted: "2024-01-01", platform: "Physical" }
    });
    expect(progressMissingGame.statusCode).toBe(404);
  });

  it("validates ownership requests and returns C# ownership update payloads", async () => {
    await seedGame(db.pool, 1, "Ownership Game");

    const missingType = await app.inject({
      method: "POST",
      url: "/api/games/owned",
      headers: adminHeaders(),
      payload: { title: "Ownership Game", ownPhysicalCopy: true, typeOwned: "" }
    });
    expect(missingType.statusCode).toBe(400);
    expect(missingType.json()).toEqual({ errors: ["Type owned is required when marking as owned"] });

    const owned = await app.inject({
      method: "POST",
      url: "/api/games/owned",
      headers: adminHeaders(),
      payload: { title: "Ownership Game", ownPhysicalCopy: true, typeOwned: "Base" }
    });
    expect(owned.statusCode).toBe(200);
    expect(owned.json()).toEqual({
      ownershipId: 1,
      gameId: 1,
      ownPhysicalCopy: true,
      typeOwned: "Base",
      message: "Game 'Ownership Game' has been marked as owned"
    });

    const removed = await app.inject({
      method: "PUT",
      url: "/api/games/1/ownership",
      headers: adminHeaders(),
      payload: { ownPhysicalCopy: false, typeOwned: "" }
    });
    expect(removed.statusCode).toBe(200);
    expect(removed.json()).toEqual({
      message: "Game 'Ownership Game' ownership has been removed",
      isOwned: false,
      ownPhysicalCopy: false,
      typeOwned: ""
    });
  });

  it("validates progress title and platform like the C# controller", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/games/progress",
      headers: adminHeaders(),
      payload: {
        title: "",
        dateStarted: "2024-01-01",
        platform: ""
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ errors: ["Title is required", "Platform is required"] });
  });

  it("validates serial-number requests and returns the C# success payload", async () => {
    await seedGame(db.pool, 1, "Serial Game");

    const invalid = await app.inject({
      method: "POST",
      url: "/api/games/serial-numbers",
      headers: adminHeaders(),
      payload: {
        title: "Serial Game",
        serialNumber: "S".repeat(51),
        region: "R".repeat(51),
        notes: "N".repeat(501)
      }
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json()).toEqual({
      errors: [
        "Serial number cannot exceed 50 characters",
        "Region cannot exceed 50 characters",
        "Notes cannot exceed 500 characters"
      ]
    });

    const created = await app.inject({
      method: "POST",
      url: "/api/games/serial-numbers",
      headers: adminHeaders(),
      payload: { title: "Serial Game", serialNumber: "SLUS-12345", region: "NTSC-U", notes: "Original release" }
    });
    expect(created.statusCode).toBe(200);
    expect(created.json()).toEqual({
      serialId: 1,
      gameId: 1,
      gameTitle: "Serial Game",
      serialNumber: "SLUS-12345",
      region: "NTSC-U",
      notes: "Original release",
      message: "Serial number 'SLUS-12345' added successfully to 'Serial Game'"
    });
  });

  it("lists and deletes serial numbers for the React game editor", async () => {
    await seedGame(db.pool, 1, "Serial Management Game");

    const unauthenticated = await app.inject({ method: "GET", url: "/api/games/1/serial-numbers" });
    expect(unauthenticated.statusCode).toBe(401);

    await app.inject({
      method: "POST",
      url: "/api/games/serial-numbers",
      headers: adminHeaders(),
      payload: { title: "Serial Management Game", serialNumber: "SLUS-11111", region: "NTSC-U", notes: "Original release" }
    });

    const listed = await app.inject({ method: "GET", url: "/api/games/1/serial-numbers", headers: adminHeaders() });
    expect(listed.statusCode).toBe(200);
    expect(listed.json()).toEqual([
      {
        serialId: 1,
        gameId: 1,
        serialNumber: "SLUS-11111",
        region: "NTSC-U",
        notes: "Original release"
      }
    ]);

    const missingDelete = await app.inject({ method: "DELETE", url: "/api/games/1/serial-numbers/999", headers: adminHeaders() });
    expect(missingDelete.statusCode).toBe(404);
    expect(missingDelete.json()).toEqual({ message: "Serial number with ID 999 not found for game ID 1" });

    const deleted = await app.inject({ method: "DELETE", url: "/api/games/1/serial-numbers/1", headers: adminHeaders() });
    expect(deleted.statusCode).toBe(200);
    expect(deleted.json()).toEqual({ message: "Serial number deleted successfully from 'Serial Management Game'" });

    const relisted = await app.inject({ method: "GET", url: "/api/games/1/serial-numbers", headers: adminHeaders() });
    expect(relisted.json()).toEqual([]);
  });

  it("returns editor relationship errors for missing serials and alternate titles", async () => {
    await seedGame(db.pool, 1, "Relationship Game");

    const serialMissingBody = await app.inject({ method: "POST", url: "/api/games/serial-numbers", headers: adminHeaders() });
    expect(serialMissingBody.statusCode).toBe(400);

    const serialMissingGame = await app.inject({
      method: "POST",
      url: "/api/games/serial-numbers",
      headers: adminHeaders(),
      payload: { title: "Not There", serialNumber: "SLUS-99999" }
    });
    expect(serialMissingGame.statusCode).toBe(404);

    const listSerialsMissingGame = await app.inject({ method: "GET", url: "/api/games/999/serial-numbers", headers: adminHeaders() });
    expect(listSerialsMissingGame.statusCode).toBe(404);

    const deleteSerialMissingGame = await app.inject({ method: "DELETE", url: "/api/games/999/serial-numbers/1", headers: adminHeaders() });
    expect(deleteSerialMissingGame.statusCode).toBe(404);

    const listAlternatesMissingGame = await app.inject({ method: "GET", url: "/api/games/999/alternate-titles" });
    expect(listAlternatesMissingGame.statusCode).toBe(404);

    const alternateMissingBody = await app.inject({ method: "POST", url: "/api/games/1/alternate-titles", headers: adminHeaders() });
    expect(alternateMissingBody.statusCode).toBe(400);

    const deleteAlternateMissingGame = await app.inject({ method: "DELETE", url: "/api/games/999/alternate-titles/1", headers: adminHeaders() });
    expect(deleteAlternateMissingGame.statusCode).toBe(404);
  });

  it("returns flattened C# alternate-title payloads", async () => {
    await seedGame(db.pool, 1, "Alternate Game");

    const missingGame = await app.inject({
      method: "POST",
      url: "/api/games/999/alternate-titles",
      headers: adminHeaders(),
      payload: { title: "Missing Alt", notes: "No game" }
    });
    expect(missingGame.statusCode).toBe(404);
    expect(missingGame.json()).toEqual({ message: "Game with ID 999 not found" });

    const invalid = await app.inject({
      method: "POST",
      url: "/api/games/1/alternate-titles",
      headers: adminHeaders(),
      payload: { title: "A".repeat(151), notes: "N".repeat(501) }
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json()).toEqual({ errors: ["Title cannot exceed 150 characters", "Notes cannot exceed 500 characters"] });

    const created = await app.inject({
      method: "POST",
      url: "/api/games/1/alternate-titles",
      headers: adminHeaders(),
      payload: { title: "Alt Name", notes: "Regional" }
    });
    expect(created.statusCode).toBe(200);
    expect(created.json()).toEqual({
      alternateTitleId: 1,
      gameId: 1,
      title: "Alt Name",
      notes: "Regional",
      message: "Alternate title 'Alt Name' added successfully to 'Alternate Game'"
    });

    const duplicate = await app.inject({
      method: "POST",
      url: "/api/games/1/alternate-titles",
      headers: adminHeaders(),
      payload: { title: "Alt Name" }
    });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json()).toEqual({ error: "Alternate title 'Alt Name' already exists for game 'Alternate Game' (ID: 1)" });

    const listed = await app.inject({ method: "GET", url: "/api/games/1/alternate-titles" });
    expect(listed.statusCode).toBe(200);
    expect(listed.json()).toEqual([{ alternateTitleId: 1, gameId: 1, title: "Alt Name", notes: "Regional" }]);

    const missingAlternate = await app.inject({
      method: "DELETE",
      url: "/api/games/1/alternate-titles/999",
      headers: adminHeaders()
    });
    expect(missingAlternate.statusCode).toBe(404);
    expect(missingAlternate.json()).toEqual({ message: "Alternate title with ID 999 not found for game ID 1" });

    const deleted = await app.inject({
      method: "DELETE",
      url: "/api/games/1/alternate-titles/1",
      headers: adminHeaders()
    });
    expect(deleted.statusCode).toBe(200);
    expect(deleted.json()).toEqual({ message: "Alternate title deleted successfully from 'Alternate Game'" });
  });
});

function adminHeaders() {
  return {
    "x-api-key": adminApiKey
  };
}

function validGamePayload(title: string) {
  return {
    title,
    developer: "New Developer",
    publisher: "New Publisher",
    firstReleased: "2002-01-01",
    regionFirstReleasedIn: "NA",
    releasedInEuPalOrNa: true,
    imageUrl: null
  };
}
