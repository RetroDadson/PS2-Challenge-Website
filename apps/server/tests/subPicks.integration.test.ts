import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createDbClient } from "../src/db/client.js";
import { RealtimeHub } from "../src/realtime/hub.js";
import { buildApp } from "../src/server.js";
import { seedGame, seedUser, startIntegrationDatabase, type IntegrationDatabase } from "./helpers/postgres.js";

const admin = { "x-api-key": "admin-api-key" };
const viewer = { "x-api-key": "viewer-api-key" };
const otherViewer = { "x-api-key": "other-viewer-api-key" };
const viewerTwitchId = "1001";

const twitchUserLookup = { getUserByLogin: vi.fn() };

class CountingHub extends RealtimeHub {
  subPickUpdates = 0;

  override broadcastSubPicksUpdated(): void {
    this.subPickUpdates++;
    super.broadcastSubPicksUpdated();
  }
}

const realtimeHub = new CountingHub();

describe("sub picks API", () => {
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
        twitchChannelLogin: "retrodadson",
        publicBaseUrl: "http://localhost",
        cookieSecret: "test-cookie-secret",
        logLevel: "silent",
        trustProxy: true
      },
      { dbClient: createDbClient({ databaseConnectionString: db.connectionString }), twitchUserLookup, realtimeHub }
    );
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await db?.stop();
  });

  beforeEach(async () => {
    await db.reset();
    twitchUserLookup.getUserByLogin.mockReset();
    realtimeHub.subPickUpdates = 0;
    await seedUser(db.pool, "Admin", "admin-api-key", { twitchId: "9000", username: "StreamAdmin" });
    await seedUser(db.pool, "User", "viewer-api-key", { twitchId: viewerTwitchId, username: "ViewerOne" });
    await seedUser(db.pool, "User", "other-viewer-api-key", { twitchId: "1002", username: "ViewerTwo" });
    for (const [id, title] of [
      [1, "Amplitude"],
      [2, "Burnout 3"],
      [3, "Frequency"],
      [4, "Boogie"],
      [5, "Unowned Game"]
    ] as const) {
      await seedGame(db.pool, id, title);
    }
    await db.pool.query("INSERT INTO game_owned (game_id, own_physical_copy, type_owned) VALUES (1, true, 'Base'), (2, true, 'Base'), (3, true, 'Base'), (4, true, 'Base')");
    await db.pool.query("INSERT INTO excluded_games (game_id, reason) VALUES (4, 'Not in the challenge')");
  });

  async function createGrant(payload: Record<string, unknown> = {}) {
    const response = await app.inject({
      method: "POST",
      url: "/api/admin/sub-picks/grants",
      headers: admin,
      payload: { twitchUserId: viewerTwitchId, twitchLogin: "viewerone", twitchDisplayName: "ViewerOne", tier: "1000", grantType: "new", ...payload }
    });
    expect(response.statusCode).toBe(201);
    return response.json();
  }

  async function myEntries(headers = viewer) {
    const response = await app.inject({ method: "GET", url: "/api/sub-picks/me", headers });
    expect(response.statusCode).toBe(200);
    return response.json();
  }

  async function summary() {
    const response = await app.inject({ method: "GET", url: "/api/sub-picks/summary" });
    expect(response.statusCode).toBe(200);
    return response.json();
  }

  it("serves an empty public summary with the draw schedule", async () => {
    await db.pool.query("INSERT INTO progress (progress_id, game_id, date_started, platform) VALUES (7, 1, '2024-01-01', 'Physical')");

    const body = await summary();

    expect(body.schedule).toEqual({
      nextGameNumber: 8,
      nextDrawGameNumber: 10,
      nextDrawKind: "10s",
      gamesUntilNextDraw: 2,
      nextHundredDrawGameNumber: 100,
      gamesUntilNextHundredDraw: 92
    });
    expect(body.nextDrawPool).toEqual({ totalEntries: 0, games: [] });
    expect(body.tierEntries).toEqual({ tier1: 1, tier2: 2, tier3: 5 });
    expect(body.overlayMessage).toMatch(/Every 10th game/);
  });

  it("protects admin routes and viewer routes", async () => {
    expect((await app.inject({ method: "GET", url: "/api/admin/sub-picks/grants" })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/api/admin/sub-picks/grants", headers: viewer })).statusCode).toBe(403);
    expect((await app.inject({ method: "PUT", url: "/api/admin/sub-picks/settings", headers: viewer, payload: { tier1Entries: 9 } })).statusCode).toBe(403);
    expect((await app.inject({ method: "GET", url: "/api/sub-picks/me" })).statusCode).toBe(401);
    expect((await app.inject({ method: "PUT", url: "/api/sub-picks/me/entries/1/pick", payload: { gameId: 1 } })).statusCode).toBe(401);
  });

  it("looks up Twitch users through the injected client", async () => {
    twitchUserLookup.getUserByLogin.mockResolvedValueOnce({ twitchUserId: "1001", login: "viewerone", displayName: "ViewerOne", profileImageUrl: null });
    const found = await app.inject({ method: "POST", url: "/api/admin/sub-picks/twitch-lookup", headers: admin, payload: { login: "ViewerOne" } });
    expect(found.statusCode).toBe(200);
    expect(found.json()).toEqual({ twitchUserId: "1001", login: "viewerone", displayName: "ViewerOne", profileImageUrl: null });

    twitchUserLookup.getUserByLogin.mockResolvedValueOnce(null);
    expect((await app.inject({ method: "POST", url: "/api/admin/sub-picks/twitch-lookup", headers: admin, payload: { login: "nobody" } })).statusCode).toBe(404);

    twitchUserLookup.getUserByLogin.mockRejectedValueOnce(new Error("down"));
    expect((await app.inject({ method: "POST", url: "/api/admin/sub-picks/twitch-lookup", headers: admin, payload: { login: "viewerone" } })).statusCode).toBe(502);

    const invalid = await app.inject({ method: "POST", url: "/api/admin/sub-picks/twitch-lookup", headers: admin, payload: { login: "not a name!" } });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json().message).toMatch(/letters, numbers and underscores/);
  });

  it("creates entries from tier values, gift counts and overrides", async () => {
    expect((await createGrant({ tier: "3000" })).entries).toHaveLength(5);
    expect((await createGrant({ tier: "prime", grantType: "resub" })).entries).toHaveLength(1);
    const gift = await createGrant({ tier: "2000", grantType: "gift", giftCount: 3 });
    expect(gift).toMatchObject({ giftCount: 3, entryCount: 6, source: "manual", createdBy: "StreamAdmin" });
    expect((await createGrant({ entryCount: 4, notes: "  Silent resub  " })).notes).toBe("Silent resub");

    const settings = await app.inject({ method: "PUT", url: "/api/admin/sub-picks/settings", headers: admin, payload: { tier1Entries: 3 } });
    expect(settings.json()).toMatchObject({ tier1Entries: 3, tier2Entries: 2, tier3Entries: 5 });
    expect((await createGrant()).entryCount).toBe(3);

    const grants = await app.inject({ method: "GET", url: "/api/admin/sub-picks/grants", headers: admin });
    expect(grants.json().map((grant: { entryCount: number }) => grant.entryCount)).toEqual([3, 4, 6, 1, 5]);
    expect((await myEntries()).stats).toMatchObject({ entriesEarned: 19, picksMade: 0, wins: 0, nextDrawOdds: 0 });

    const invalid = await app.inject({ method: "POST", url: "/api/admin/sub-picks/grants", headers: admin, payload: { twitchUserId: "abc", tier: "1000" } });
    expect(invalid.statusCode).toBe(400);
  });

  it("lets viewers pick only eligible games on their own un-drawn entries", async () => {
    const grant = await createGrant({ tier: "2000" });
    const [first, second] = grant.entries;

    const eligible = await app.inject({ method: "GET", url: "/api/sub-picks/eligible-games" });
    expect(eligible.json().map((game: { title: string }) => game.title)).toEqual(["Amplitude", "Burnout 3", "Frequency"]);

    const picked = await app.inject({ method: "PUT", url: `/api/sub-picks/me/entries/${first.id}/pick`, headers: viewer, payload: { gameId: 3 } });
    expect(picked.statusCode).toBe(200);
    expect(picked.json()).toMatchObject({ gameTitle: "Frequency", pool: "next_draw", canChangePick: true });

    const excluded = await app.inject({ method: "PUT", url: `/api/sub-picks/me/entries/${second.id}/pick`, headers: viewer, payload: { gameId: 4 } });
    expect(excluded.statusCode).toBe(400);
    expect((await app.inject({ method: "PUT", url: `/api/sub-picks/me/entries/${second.id}/pick`, headers: viewer, payload: { gameId: 5 } })).statusCode).toBe(400);
    expect((await app.inject({ method: "PUT", url: `/api/sub-picks/me/entries/${second.id}/pick`, headers: otherViewer, payload: { gameId: 1 } })).statusCode).toBe(404);
    expect((await app.inject({ method: "PUT", url: `/api/sub-picks/me/entries/${second.id}/pick`, headers: viewer, payload: { gameId: "1" } })).statusCode).toBe(400);
    expect((await app.inject({ method: "PUT", url: "/api/sub-picks/me/entries/999/pick", headers: viewer, payload: { gameId: 1 } })).statusCode).toBe(404);

    const mine = await myEntries();
    expect(mine.entries.map((entry: { pool: string }) => entry.pool)).toEqual(["next_draw", "awaiting_pick"]);
    expect(mine.stats).toMatchObject({ entriesEarned: 2, picksMade: 1, nextDrawOdds: 1 });
    expect((await myEntries(otherViewer)).entries).toEqual([]);

    const cleared = await app.inject({ method: "PUT", url: `/api/sub-picks/me/entries/${first.id}/pick`, headers: viewer, payload: { gameId: null } });
    expect(cleared.json()).toMatchObject({ gameId: null, pool: "awaiting_pick" });
  });

  it("builds pools with odds and flags picks whose game has started", async () => {
    const grant = await createGrant({ tier: "3000" });
    const picks = [1, 1, 2, 3, null];
    for (const [index, entry] of grant.entries.entries()) {
      const gameId = picks[index];
      if (gameId) {
        await app.inject({ method: "PUT", url: `/api/admin/sub-picks/entries/${entry.id}/pick`, headers: admin, payload: { gameId } });
      }
    }

    let body = await summary();
    expect(body.nextDrawPool.totalEntries).toBe(4);
    expect(body.nextDrawPool.games).toEqual([
      { gameId: 1, gameTitle: "Amplitude", imageUrl: null, entries: 2, odds: 0.5 },
      { gameId: 2, gameTitle: "Burnout 3", imageUrl: null, entries: 1, odds: 0.25 },
      { gameId: 3, gameTitle: "Frequency", imageUrl: null, entries: 1, odds: 0.25 }
    ]);

    await db.pool.query("INSERT INTO progress (game_id, date_started, platform) VALUES (1, '2024-01-01', 'Physical')");
    body = await summary();
    expect(body.nextDrawPool.totalEntries).toBe(2);
    const mine = await myEntries();
    expect(mine.entries.filter((entry: { pool: string }) => entry.pool === "needs_new_pick")).toHaveLength(2);
    expect(mine.stats.nextDrawOdds).toBe(1);
  });

  it("combines the 100s pool into the next draw when a 100s draw is due", async () => {
    const grant = await createGrant({ tier: "2000" });
    const [held, fresh] = grant.entries;
    await app.inject({ method: "PUT", url: `/api/admin/sub-picks/entries/${held.id}/pick`, headers: admin, payload: { gameId: 2 } });
    await app.inject({ method: "PUT", url: `/api/admin/sub-picks/entries/${fresh.id}/pick`, headers: admin, payload: { gameId: 3 } });
    await db.pool.query("UPDATE sub_entries SET status = 'in_100s_pool' WHERE entry_id = $1", [held.id]);

    let body = await summary();
    expect(body.schedule.nextDrawKind).toBe("10s");
    expect(body.nextDrawPool.totalEntries).toBe(1);
    expect(body.hundredsPool.games).toEqual([{ gameId: 2, gameTitle: "Burnout 3", imageUrl: null, entries: 1, odds: 1 }]);

    await db.pool.query("INSERT INTO progress (progress_id, game_id, date_started, platform) VALUES (95, 1, '2024-01-01', 'Physical')");
    body = await summary();
    expect(body.schedule).toMatchObject({ nextGameNumber: 96, nextDrawGameNumber: 100, nextDrawKind: "100s", gamesUntilNextHundredDraw: 4 });
    expect(body.nextDrawPool.totalEntries).toBe(2);
    expect((await myEntries()).stats.nextDrawOdds).toBe(1);

    await db.pool.query("INSERT INTO progress (progress_id, game_id, date_started, platform) VALUES (96, 2, '2024-01-02', 'Physical')");
    body = await summary();
    expect(body.hundredsPool.totalEntries).toBe(0);
    const heldEntry = (await myEntries()).entries.find((entry: { id: number }) => entry.id === held.id);
    expect(heldEntry).toMatchObject({ pool: "finished", playedGameNumber: 96, canChangePick: false });
  });

  it("locks picks and protects history once an entry has been drawn", async () => {
    const grant = await createGrant({ tier: "3000" });
    const [drawn, won] = grant.entries;
    await db.pool.query("UPDATE sub_entries SET status = 'in_100s_pool', game_id = 2 WHERE entry_id = $1", [drawn.id]);
    await db.pool.query("UPDATE sub_entries SET status = 'won', game_id = 3 WHERE entry_id = $1", [won.id]);

    const locked = await app.inject({ method: "PUT", url: `/api/sub-picks/me/entries/${drawn.id}/pick`, headers: viewer, payload: { gameId: 1 } });
    expect(locked.statusCode).toBe(409);
    expect((await app.inject({ method: "PUT", url: `/api/admin/sub-picks/entries/${drawn.id}/pick`, headers: admin, payload: { gameId: 1 } })).statusCode).toBe(409);

    const tooLow = await app.inject({ method: "PUT", url: `/api/admin/sub-picks/grants/${grant.id}`, headers: admin, payload: { entryCount: 1 } });
    expect(tooLow.statusCode).toBe(409);

    expect((await app.inject({ method: "DELETE", url: `/api/admin/sub-picks/entries/${won.id}`, headers: admin })).statusCode).toBe(409);
    const voided = await app.inject({ method: "DELETE", url: `/api/admin/sub-picks/entries/${drawn.id}`, headers: admin });
    expect(voided.json()).toEqual({ deleted: false });

    const removed = await app.inject({ method: "DELETE", url: `/api/admin/sub-picks/grants/${grant.id}`, headers: admin });
    expect(removed.json()).toEqual({ deleted: false, voidedEntries: 3 });
    expect((await myEntries()).entries.map((entry: { status: string }) => entry.status)).toEqual(["voided", "won", "voided", "voided", "voided"]);
    expect((await myEntries()).stats).toMatchObject({ entriesEarned: 1, wins: 1 });
  });

  it("edits, removes and deletes un-drawn grants and entries", async () => {
    const grant = await createGrant({ tier: "2000" });
    await app.inject({ method: "PUT", url: `/api/admin/sub-picks/entries/${grant.entries[0].id}/pick`, headers: admin, payload: { gameId: 1 } });

    const grown = await app.inject({ method: "PUT", url: `/api/admin/sub-picks/grants/${grant.id}`, headers: admin, payload: { entryCount: 4, tier: "3000", notes: "Fixed tier" } });
    expect(grown.json()).toMatchObject({ entryCount: 4, tier: "3000", notes: "Fixed tier" });
    expect(grown.json().entries).toHaveLength(4);

    const shrunk = await app.inject({ method: "PUT", url: `/api/admin/sub-picks/grants/${grant.id}`, headers: admin, payload: { entryCount: 1 } });
    expect(shrunk.json().entries.map((entry: { gameTitle: string | null }) => entry.gameTitle)).toEqual(["Amplitude"]);

    const removed = await app.inject({ method: "DELETE", url: `/api/admin/sub-picks/entries/${grant.entries[0].id}`, headers: admin });
    expect(removed.json()).toEqual({ deleted: true });
    expect((await app.inject({ method: "GET", url: "/api/admin/sub-picks/grants", headers: admin })).json()[0]).toMatchObject({ entryCount: 0, entries: [] });

    expect((await app.inject({ method: "DELETE", url: `/api/admin/sub-picks/grants/${grant.id}`, headers: admin })).json()).toEqual({ deleted: true, voidedEntries: 0 });
    expect((await app.inject({ method: "DELETE", url: `/api/admin/sub-picks/grants/${grant.id}`, headers: admin })).statusCode).toBe(404);
    expect((await app.inject({ method: "PUT", url: `/api/admin/sub-picks/grants/${grant.id}`, headers: admin, payload: { entryCount: 1 } })).statusCode).toBe(404);
    expect((await app.inject({ method: "DELETE", url: "/api/admin/sub-picks/entries/999", headers: admin })).statusCode).toBe(404);
    expect((await app.inject({ method: "PUT", url: "/api/admin/sub-picks/entries/999/pick", headers: admin, payload: { gameId: 1 } })).statusCode).toBe(404);
    expect(realtimeHub.subPickUpdates).toBe(6);
  });

  it("validates settings and records an audit trail with the acting user", async () => {
    const invalid = await app.inject({ method: "PUT", url: "/api/admin/sub-picks/settings", headers: admin, payload: { spinDurationSeconds: 0 } });
    expect(invalid.statusCode).toBe(400);
    expect((await app.inject({ method: "PUT", url: "/api/admin/sub-picks/settings", headers: admin, payload: { unknown: 1 } })).statusCode).toBe(400);

    const updated = await app.inject({
      method: "PUT",
      url: "/api/admin/sub-picks/settings",
      headers: admin,
      payload: { spinDurationSeconds: 15, overlayMessage: "Sub for a spin!" }
    });
    expect(updated.json()).toMatchObject({ spinDurationSeconds: 15, overlayMessage: "Sub for a spin!" });
    expect((await app.inject({ method: "GET", url: "/api/admin/sub-picks/settings", headers: admin })).json()).toMatchObject({ spinDurationSeconds: 15 });

    const grant = await createGrant();
    await app.inject({ method: "PUT", url: `/api/sub-picks/me/entries/${grant.entries[0].id}/pick`, headers: viewer, payload: { gameId: 2 } });

    const audit = await app.inject({ method: "GET", url: "/api/admin/sub-picks/audit", headers: admin });
    expect(audit.json().map((row: { actor: string; action: string }) => [row.actor, row.action])).toEqual([
      ["ViewerOne", "entry.pick.viewer"],
      ["StreamAdmin", "grant.create"],
      ["StreamAdmin", "settings.update"]
    ]);
    expect(audit.json()[0].details).toEqual({ fromGameId: null, toGameId: 2 });
    expect(audit.json()[2].details.before).toMatchObject({ spinDurationSeconds: 10 });
    expect(realtimeHub.subPickUpdates).toBe(3);
  });
});
