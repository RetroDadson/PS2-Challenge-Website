import type { SubDrawDto } from "@ps2-challenge/shared";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDbClient } from "../src/db/client.js";
import { createKyselyFromPool } from "../src/db/kysely.js";
import { RealtimeHub } from "../src/realtime/hub.js";
import { buildApp } from "../src/server.js";
import { SubDrawService } from "../src/services/subDrawService.js";
import { SubPickService } from "../src/services/subPickService.js";
import { seedGame, seedUser, startIntegrationDatabase, type IntegrationDatabase } from "./helpers/postgres.js";

const adminApiKey = "admin-api-key";
const admin = { id: 1, username: "AdminUser" };
const start = new Date("2026-11-07T12:00:00.000Z");

class CountingHub extends RealtimeHub {
  wheel = 0;
  games = 0;

  override broadcastWheelUpdated(): void {
    this.wheel++;
  }

  override broadcastGamesUpdated(): void {
    this.games++;
  }
}

describe("sub pick draws", () => {
  let db: IntegrationDatabase;
  let now: Date;
  let draws: SubDrawService;
  let subPicks: SubPickService;

  beforeAll(async () => {
    db = await startIntegrationDatabase();
    const kysely = createKyselyFromPool(db.pool);
    draws = new SubDrawService(kysely, () => now);
    subPicks = new SubPickService(kysely);
  }, 120_000);

  afterAll(async () => {
    await db?.stop();
  });

  beforeEach(async () => {
    now = start;
    await db.reset();
    await seedUser(db.pool, "Admin", adminApiKey);
  });

  async function seedPlayedGames(count: number): Promise<void> {
    await db.pool.query(
      `INSERT INTO games (game_id, title, developer, publisher, region_first_released_in, released_in_eu_or_na)
       SELECT id, 'Played ' || id, 'D', 'P', 'NA', true FROM generate_series(1, $1::int) AS id`,
      [count]
    );
    await db.pool.query(
      `INSERT INTO progress (progress_id, game_id, date_started, platform)
       SELECT id, id, '2024-01-01', 'Physical' FROM generate_series(1, $1::int) AS id`,
      [count]
    );
  }

  async function seedOwnedGame(id: number, title: string, physical = true): Promise<void> {
    await seedGame(db.pool, id, title);
    await db.pool.query("INSERT INTO game_owned (game_id, own_physical_copy, type_owned) VALUES ($1, $2, 'Base')", [id, physical]);
  }

  async function seedEntry(gameId: number | null, viewer = "ViewerOne", status = "undrawn"): Promise<number> {
    const grant = await db.pool.query<{ grant_id: number }>(
      `INSERT INTO sub_entry_grants (twitch_user_id, twitch_login, twitch_display_name, tier, grant_type, entry_count, source)
       VALUES ($1, $2, $3, '1000', 'new', 1, 'manual') RETURNING grant_id`,
      [`id-${viewer}`, viewer.toLocaleLowerCase("en-GB"), viewer]
    );
    const entry = await db.pool.query<{ entry_id: number }>(
      "INSERT INTO sub_entries (grant_id, twitch_user_id, game_id, status) VALUES ($1, $2, $3, $4) RETURNING entry_id",
      [grant.rows[0]!.grant_id, `id-${viewer}`, gameId, status]
    );
    return entry.rows[0]!.entry_id;
  }

  async function entryStatuses(): Promise<Record<number, { status: string; played: number | null }>> {
    const rows = await db.pool.query<{ entry_id: number; status: string; played_game_number: number | null }>(
      "SELECT entry_id, status, played_game_number FROM sub_entries ORDER BY entry_id"
    );
    return Object.fromEntries(rows.rows.map((row) => [row.entry_id, { status: row.status, played: row.played_game_number }]));
  }

  async function seedTensDraw(): Promise<{ entries: Record<number, number> }> {
    await seedPlayedGames(9);
    await seedOwnedGame(50, "Alpha");
    await seedOwnedGame(51, "Beta", false);
    const entries = {
      [await seedEntry(50, "ViewerOne")]: 50,
      [await seedEntry(50, "ViewerTwo")]: 50,
      [await seedEntry(51, "ViewerThree")]: 51
    };
    return { entries };
  }

  function afterReveal(draw: SubDrawDto): void {
    now = new Date(Date.parse(draw.spin!.revealAt));
  }

  it("only opens a draw when one is due and only one at a time", async () => {
    await seedPlayedGames(8);
    await seedOwnedGame(50, "Alpha");
    await seedEntry(50);
    await expect(draws.open(admin)).rejects.toMatchObject({ statusCode: 409, message: expect.stringContaining("game 9 isn't a sub pick game") });
    expect(await draws.wheel()).toEqual({ draw: null, due: null, spinDurationSeconds: 10, serverNow: start.toISOString() });

    await db.pool.query("INSERT INTO progress (progress_id, game_id, date_started, platform) VALUES (9, 50, '2024-01-01', 'Physical')");
    await seedOwnedGame(51, "Beta");
    await expect(draws.open(admin)).rejects.toMatchObject({ statusCode: 409 });
    await seedEntry(51);
    expect((await draws.wheel()).due).toEqual({ gameNumber: 10, kind: "10s", entryCount: 1 });

    const draw = await draws.open(admin);

    expect(draw).toMatchObject({ kind: "10s", gameNumber: 10, state: "ready", locked: false, spin: null, winner: null, spinCount: 0, shuffleCount: 0 });
    expect(draw.slices).toEqual([{ entryId: 2, gameId: 51, gameTitle: "Beta", twitchDisplayName: "ViewerOne" }]);
    expect(draw.odds).toEqual([{ gameId: 51, gameTitle: "Beta", entries: 1, odds: 1 }]);
    await expect(draws.open(admin)).rejects.toMatchObject({ statusCode: 409, message: "The draw for game 10 is already open" });
    expect(await draws.wheel()).toMatchObject({ draw: { id: draw.id, state: "ready" }, due: null });
  });

  it("keeps the wheel in step with picks until the first spin, then locks it", async () => {
    await seedTensDraw();
    await seedOwnedGame(52, "Gamma");
    const draw = await draws.open(admin);
    expect(draw.slices).toHaveLength(3);

    const late = await seedEntry(52, "LateViewer");
    const withLate = (await draws.current())!;
    expect(withLate.slices.map((slice) => slice.entryId).sort()).toEqual([1, 2, 3, late].sort());
    expect((await draws.current())!.slices).toEqual(withLate.slices);
    await subPicks.setPick(admin, late, null);
    expect((await draws.current())!.slices.map((slice) => slice.entryId)).toEqual(draw.slices.map((slice) => slice.entryId));

    const shuffled = await draws.shuffle(admin, draw.id);
    expect(shuffled.shuffleCount).toBe(1);
    expect(shuffled.slices.map((slice) => slice.entryId).sort()).toEqual([1, 2, 3]);

    const spun = await draws.spin(admin, draw.id);
    expect(spun).toMatchObject({ state: "spinning", locked: true, spinCount: 1 });
    await subPicks.setPick(admin, late, 52);
    expect((await draws.current())!.slices).toHaveLength(3);
    await expect(subPicks.setPick(admin, 1, 52)).rejects.toMatchObject({ statusCode: 409, message: expect.stringContaining("pick is locked") });
    await expect(subPicks.removeEntry(admin, 1)).rejects.toMatchObject({ statusCode: 409 });
    await expect(subPicks.deleteGrant(admin, 1)).rejects.toMatchObject({ statusCode: 409 });
    const mine = await subPicks.myEntries("id-ViewerOne");
    expect(mine.entries.find((entry) => entry.id === 1)?.canChangePick).toBe(false);
  });

  it("hides the result until the wheel stops, then allows a respin", async () => {
    await seedTensDraw();
    const draw = await draws.open(admin);
    const spun = await draws.spin(admin, draw.id);

    expect(spun.spin).toMatchObject({ spinNumber: 1, durationMs: 10_000, sliceCount: 3, decision: "pending", result: null });
    expect(spun.spin!.winningSliceIndex).toBeGreaterThanOrEqual(0);
    expect(spun.spin!.winningSliceIndex).toBeLessThan(3);
    expect(spun.spin!.stopOffset).toBeGreaterThanOrEqual(0.1);
    expect(spun.spin!.stopOffset).toBeLessThanOrEqual(0.9);
    expect(spun.spin!.revealAt).toBe("2026-11-07T12:00:10.000Z");
    expect((await draws.wheel()).draw?.spin?.result).toBeNull();
    expect(await draws.revealDelayMs(draw.id)).toBe(10_000);
    await expect(draws.spin(admin, draw.id)).rejects.toMatchObject({ statusCode: 409, message: "The wheel has already been spun" });
    await expect(draws.shuffle(admin, draw.id)).rejects.toMatchObject({ statusCode: 409 });
    await expect(draws.accept(admin, draw.id)).rejects.toMatchObject({ statusCode: 409, message: "Wait for the wheel to stop" });
    await expect(draws.respin(admin, draw.id)).rejects.toMatchObject({ statusCode: 409, message: "Wait for the wheel to stop" });
    await expect(draws.cancel(admin, draw.id)).rejects.toMatchObject({ statusCode: 409, message: "Wait for the wheel to stop" });

    afterReveal(spun);
    const revealed = (await draws.current())!;
    const winningSlice = revealed.slices[spun.spin!.winningSliceIndex]!;
    expect(revealed.state).toBe("awaiting_decision");
    expect(revealed.spin!.result).toEqual({
      ...winningSlice,
      entries: winningSlice.gameId === 50 ? 2 : 1,
      odds: winningSlice.gameId === 50 ? 2 / 3 : 1 / 3
    });
    expect(await draws.revealDelayMs(draw.id)).toBe(0);

    const respun = await draws.respin(admin, draw.id);
    expect(respun).toMatchObject({ state: "ready", locked: true, spinCount: 1, spin: { decision: "respun" } });
    expect(await draws.revealDelayMs(draw.id)).toBeNull();
    await expect(draws.respin(admin, draw.id)).rejects.toMatchObject({ statusCode: 409, message: "Spin the wheel first" });
    await draws.shuffle(admin, draw.id);
    const second = await draws.spin(admin, draw.id);
    expect(second.spin).toMatchObject({ spinNumber: 2, result: null });
    const audit = await db.pool.query<{ action: string }>("SELECT action FROM sub_pick_audit ORDER BY audit_id");
    expect(audit.rows.map((row) => row.action)).toEqual(["draw.open", "draw.spin", "draw.respin", "draw.shuffle", "draw.spin"]);
  });

  it("lets exactly one of two simultaneous spins through", async () => {
    await seedTensDraw();
    const draw = await draws.open(admin);

    const results = await Promise.allSettled([draws.spin(admin, draw.id), draws.spin(admin, draw.id)]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({ reason: { statusCode: 409 } });
    const spins = await db.pool.query("SELECT spin_number FROM sub_draw_spins");
    expect(spins.rows).toEqual([{ spin_number: 1 }]);
  });

  it("accepts a 10s result: starts the game, moves losers to the 100s pool and removes co-picks", async () => {
    const { entries } = await seedTensDraw();
    await seedOwnedGame(52, "Gamma");
    const hundredsCoPick = await seedEntry(50, "OldViewer", "in_100s_pool");
    const hundredsOther = await seedEntry(52, "OtherOldViewer", "in_100s_pool");
    await db.pool.query("UPDATE sub_entries SET game_id = 51 WHERE entry_id = $1", [hundredsCoPick]);
    const draw = await draws.open(admin);
    const spun = await draws.spin(admin, draw.id);
    afterReveal(spun);

    const accepted = await draws.accept(admin, draw.id);

    const winner = accepted.draw.winner!;
    expect(accepted.draw).toMatchObject({ state: "accepted", spin: { decision: "accepted" } });
    expect(accepted.gameTitle).toBe(winner.gameTitle);
    const progress = await db.pool.query("SELECT progress_id, game_id, date_started::text AS date_started, platform FROM progress WHERE progress_id = 10");
    expect(progress.rows).toEqual([{ progress_id: 10, game_id: winner.gameId, date_started: "2026-11-07", platform: winner.gameId === 51 ? "Emulated" : "Physical" }]);
    const statuses = await entryStatuses();
    for (const [entryId, gameId] of Object.entries(entries)) {
      const id = Number(entryId);
      if (id === winner.entryId) expect(statuses[id]).toEqual({ status: "won", played: 10 });
      else if (gameId === winner.gameId) expect(statuses[id]).toEqual({ status: "removed_played", played: 10 });
      else expect(statuses[id]).toEqual({ status: "in_100s_pool", played: null });
    }
    expect(statuses[hundredsCoPick]).toEqual(winner.gameId === 51 ? { status: "removed_played", played: 10 } : { status: "in_100s_pool", played: null });
    expect(statuses[hundredsOther]).toEqual({ status: "in_100s_pool", played: null });
    const outcomes = await db.pool.query<{ entry_id: number; outcome: string }>("SELECT entry_id, outcome FROM sub_draw_entries ORDER BY entry_id");
    expect(outcomes.rows.find((row) => row.entry_id === winner.entryId)?.outcome).toBe("won");
    expect(outcomes.rows.every((row) => row.outcome !== null)).toBe(true);
    expect(await draws.wheel()).toMatchObject({ draw: { id: draw.id, state: "accepted", winner }, due: null });
    await expect(draws.cancel(admin, draw.id)).rejects.toMatchObject({ statusCode: 409 });
    await expect(draws.accept(admin, draw.id)).rejects.toMatchObject({ statusCode: 409 });
  });

  it("refuses to accept when the game number or the winning game has been taken", async () => {
    await seedTensDraw();
    const draw = await draws.open(admin);
    const spun = await draws.spin(admin, draw.id);
    afterReveal(spun);
    await seedOwnedGame(60, "Overridden");
    await db.pool.query("INSERT INTO progress (progress_id, game_id, date_started, platform) VALUES (10, 60, '2024-01-01', 'Physical')");

    await expect(draws.accept(admin, draw.id)).rejects.toMatchObject({ statusCode: 409, message: expect.stringContaining("Game 10 has already been started") });

    const winner = (await draws.current())!.spin!.result!;
    await db.pool.query("INSERT INTO progress (progress_id, game_id, date_started, platform) VALUES (11, $1, '2024-01-01', 'Physical')", [winner.gameId]);
    await expect(draws.accept(admin, draw.id)).rejects.toMatchObject({ statusCode: 409, message: `${winner.gameTitle} has already been started as game 11. Respin or cancel the draw.` });
    expect((await draws.current())!.state).toBe("awaiting_decision");
    expect(Object.values(await entryStatuses()).every((entry) => entry.status === "undrawn")).toBe(true);
  });

  it("clears the whole 100s pool when a 100s result is accepted", async () => {
    await seedPlayedGames(99);
    await seedOwnedGame(150, "Alpha");
    await seedOwnedGame(151, "Beta");
    const fresh = await seedEntry(150, "Fresh");
    const pooled = await seedEntry(151, "Pooled", "in_100s_pool");
    const played = await seedEntry(7, "Played", "in_100s_pool");
    const draw = await draws.open(admin);
    expect(draw).toMatchObject({ kind: "100s", gameNumber: 100 });
    expect(draw.slices.map((slice) => slice.entryId).sort()).toEqual([fresh, pooled]);
    const spun = await draws.spin(admin, draw.id);
    afterReveal(spun);

    const { draw: accepted } = await draws.accept(admin, draw.id);

    const loser = accepted.winner!.entryId === fresh ? pooled : fresh;
    const statuses = await entryStatuses();
    expect(statuses[accepted.winner!.entryId]).toEqual({ status: "won", played: 100 });
    expect(statuses[loser]).toEqual({ status: "lost", played: null });
    expect(statuses[played]).toEqual({ status: "removed_played", played: 7 });
  });

  it("cancels a draw, unlocks its entries and voids rather than deletes them afterwards", async () => {
    await seedTensDraw();
    const draw = await draws.open(admin);
    const spun = await draws.spin(admin, draw.id);
    afterReveal(spun);

    const cancelled = await draws.cancel(admin, draw.id);

    expect(cancelled).toMatchObject({ state: "cancelled", spin: { decision: "cancelled" }, winner: null });
    await expect(draws.cancel(admin, draw.id)).rejects.toMatchObject({ statusCode: 409 });
    await expect(draws.shuffle(admin, draw.id)).rejects.toMatchObject({ statusCode: 409, message: "This draw has finished" });
    await expect(draws.spin(admin, draw.id)).rejects.toMatchObject({ statusCode: 409, message: "This draw has finished" });
    await expect(draws.respin(admin, draw.id)).rejects.toMatchObject({ statusCode: 409, message: "This draw has already finished" });
    expect((await subPicks.setPick(admin, 1, 51)).gameId).toBe(51);
    expect(await subPicks.removeEntry(admin, 1)).toEqual({ deleted: false });
    expect(await subPicks.deleteGrant(admin, 2)).toEqual({ deleted: false, voidedEntries: 1 });
    const reopened = await draws.open(admin);
    expect(reopened.slices.map((slice) => slice.entryId)).toEqual([3]);
    expect(await draws.cancel(admin, reopened.id)).toMatchObject({ state: "cancelled", spin: null });
    await expect(draws.spin(admin, 999)).rejects.toMatchObject({ statusCode: 404 });
    await expect(draws.shuffle(admin, 999)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("records finished draws in the history with every spin and each entry's fate, leaving open draws out", async () => {
    expect(await draws.history()).toEqual([]);
    const { entries } = await seedTensDraw();
    const cancelledDraw = await draws.open(admin);
    await draws.cancel(admin, cancelledDraw.id);
    const draw = await draws.open(admin);
    const first = await draws.spin(admin, draw.id);
    afterReveal(first);
    await draws.respin(admin, draw.id);
    const second = await draws.spin(admin, draw.id);
    afterReveal(second);
    const { draw: accepted } = await draws.accept(admin, draw.id);
    const history = await draws.history();

    expect(history.map((item) => [item.id, item.status])).toEqual([[draw.id, "accepted"], [cancelledDraw.id, "cancelled"]]);
    const [result, cancelled] = history;
    expect(cancelled).toMatchObject({ gameNumber: 10, winner: null, spins: [], entries: [], odds: [] });
    expect(result!.winner).toEqual(accepted.winner);
    expect(result!.odds).toEqual([
      { gameId: 50, gameTitle: "Alpha", entries: 2, odds: 2 / 3 },
      { gameId: 51, gameTitle: "Beta", entries: 1, odds: 1 / 3 }
    ]);
    expect(result!.spins.map((spin) => [spin.spinNumber, spin.decision])).toEqual([[1, "respun"], [2, "accepted"]]);
    expect(result!.spins[0]!.result.gameTitle).toMatch(/Alpha|Beta/);
    expect(result!.spins[1]!.result).toEqual(accepted.winner);
    expect(result!.entries).toHaveLength(Object.keys(entries).length);
    const winnerEntry = result!.entries.find((entry) => entry.entryId === accepted.winner!.entryId)!;
    expect(winnerEntry).toMatchObject({ outcome: "won", playedGameNumber: 10, currentStatus: "won", currentPlayedGameNumber: 10 });
    for (const entry of result!.entries.filter((item) => item.entryId !== accepted.winner!.entryId)) {
      if (entry.gameId === accepted.winner!.gameId) expect(entry).toMatchObject({ outcome: "removed_played", currentStatus: "removed_played" });
      else expect(entry).toMatchObject({ outcome: "moved_to_100s", playedGameNumber: null, currentStatus: "in_100s_pool" });
    }

    await db.pool.query(
      `INSERT INTO games (game_id, title, developer, publisher, region_first_released_in, released_in_eu_or_na)
       SELECT 1000 + n, 'Later ' || n, 'D', 'P', 'NA', true FROM generate_series(11, 19) AS n`
    );
    await db.pool.query("INSERT INTO progress (progress_id, game_id, date_started, platform) SELECT n, 1000 + n, '2024-01-01', 'Physical' FROM generate_series(11, 19) AS n");
    await seedOwnedGame(60, "Zeta");
    await seedEntry(60, "Next");
    const open = await draws.open(admin);
    expect(open.gameNumber).toBe(20);
    expect((await draws.history()).map((item) => item.id)).toEqual([draw.id, cancelledDraw.id]);
  });

  it("refuses to spin a wheel whose picks have all become invalid", async () => {
    await seedPlayedGames(9);
    await seedOwnedGame(50, "Alpha");
    const entry = await seedEntry(50);
    const draw = await draws.open(admin);
    await subPicks.setPick(admin, entry, null);

    await expect(draws.spin(admin, draw.id)).rejects.toMatchObject({ statusCode: 409, message: expect.stringContaining("Cancel it instead") });
    expect((await draws.current())!.state).toBe("ready");
  });

  describe("routes", () => {
    let app: FastifyInstance;
    let hub: CountingHub;

    beforeAll(async () => {
      hub = new CountingHub();
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
        { dbClient: createDbClient({ databaseConnectionString: db.connectionString }), realtimeHub: hub, clock: () => now }
      );
    });

    afterAll(async () => {
      await app?.close();
    });

    it("runs a draw end to end over HTTP and protects the admin actions", async () => {
      await seedTensDraw();
      const headers = { "x-api-key": adminApiKey };
      const anonymous = await app.inject({ method: "POST", url: "/api/admin/sub-picks/draws" });
      expect(anonymous.statusCode).toBe(401);

      const opened = await app.inject({ method: "POST", url: "/api/admin/sub-picks/draws", headers });
      expect(opened.statusCode).toBe(200);
      const drawId = opened.json<SubDrawDto>().id;
      const again = await app.inject({ method: "POST", url: "/api/admin/sub-picks/draws", headers });
      expect(again.statusCode).toBe(409);

      const shuffled = await app.inject({ method: "POST", url: `/api/admin/sub-picks/draws/${drawId}/shuffle`, headers });
      expect(shuffled.json()).toMatchObject({ shuffleCount: 1 });
      const spun = await app.inject({ method: "POST", url: `/api/admin/sub-picks/draws/${drawId}/spin`, headers });
      expect(spun.json()).toMatchObject({ state: "spinning", spin: { result: null } });
      const publicWheel = await app.inject({ method: "GET", url: "/api/sub-picks/wheel" });
      expect(publicWheel.json()).toMatchObject({ draw: { state: "spinning", spin: { result: null } }, serverNow: start.toISOString() });

      afterReveal(spun.json<SubDrawDto>());
      const respun = await app.inject({ method: "POST", url: `/api/admin/sub-picks/draws/${drawId}/respin`, headers });
      expect(respun.json()).toMatchObject({ state: "ready", spin: { decision: "respun" } });
      const second = await app.inject({ method: "POST", url: `/api/admin/sub-picks/draws/${drawId}/spin`, headers });
      afterReveal(second.json<SubDrawDto>());
      const accepted = await app.inject({ method: "POST", url: `/api/admin/sub-picks/draws/${drawId}/accept`, headers });
      expect(accepted.statusCode).toBe(200);
      expect(accepted.json()).toMatchObject({ state: "accepted", spinCount: 2 });
      expect(hub.games).toBe(1);
      expect(hub.wheel).toBeGreaterThanOrEqual(6);

      const history = await app.inject({ method: "GET", url: "/api/sub-picks/history" });
      expect(history.statusCode).toBe(200);
      expect(history.json()).toMatchObject([{ id: drawId, status: "accepted", spins: [{ decision: "respun" }, { decision: "accepted" }] }]);
      const missing = await app.inject({ method: "POST", url: "/api/admin/sub-picks/draws/999/cancel", headers });
      expect(missing.statusCode).toBe(404);
      const games = await app.inject({ method: "GET", url: "/api/games/progress" });
      expect(games.json()).toContainEqual(expect.objectContaining({ progressId: 10, gameId: accepted.json<SubDrawDto>().winner!.gameId }));
    });

    it("cancels a draw over HTTP", async () => {
      await seedTensDraw();
      const headers = { "x-api-key": adminApiKey };
      const opened = await app.inject({ method: "POST", url: "/api/admin/sub-picks/draws", headers });
      const cancelled = await app.inject({ method: "POST", url: `/api/admin/sub-picks/draws/${opened.json<SubDrawDto>().id}/cancel`, headers });
      expect(cancelled.json()).toMatchObject({ state: "cancelled" });
      expect((await app.inject({ method: "GET", url: "/api/sub-picks/wheel" })).json()).toMatchObject({
        draw: null,
        due: { gameNumber: 10, kind: "10s", entryCount: 3 }
      });
    });
  });
});
