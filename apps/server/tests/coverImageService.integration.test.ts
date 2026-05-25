import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createDbClient } from "../src/db/client.js";
import { RealtimeHub } from "../src/realtime/hub.js";
import { buildApp } from "../src/server.js";
import { CoverImageRefreshService, GameCoverService } from "../src/services/coverImageService.js";
import { seedGame, seedUser, startIntegrationDatabase, type IntegrationDatabase } from "./helpers/postgres.js";

const adminApiKey = "admin-api-key";
const coverBaseUrl = "https://raw.githubusercontent.com/xlenore/ps2-covers/main/covers/default";

describe("cover image parity", () => {
  let db: IntegrationDatabase;
  let app: FastifyInstance;
  let realtimeHub: RecordingRealtimeHub;

  beforeAll(async () => {
    db = await startIntegrationDatabase();
    realtimeHub = new RecordingRealtimeHub();
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
      {
        dbClient: createDbClient({ databaseConnectionString: db.connectionString }),
        realtimeHub
      }
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
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 200 })));
    await db.reset();
    realtimeHub.gamesBroadcasts = 0;
    await seedUser(db.pool, "Admin", adminApiKey);
  });

  it("generates cover URLs from normalized serial numbers and applies C# region priority", async () => {
    await seedGame(db.pool, 1, "No Serial Game");
    await seedGame(db.pool, 2, "Single Serial Game");
    await seedGame(db.pool, 3, "Priority Game");
    await addSerial(2, " slus-20062 ", "NTSC-U");
    await addSerial(3, "SLPS-12345", "NTSC-J");
    await addSerial(3, "SCES-54321", "PAL");
    await addSerial(3, "SLUS-99999", "NTSC-U");

    const service = new GameCoverService(db.pool);

    await expect(service.getCoverUrl(1)).resolves.toBeNull();
    await expect(service.getCoverUrl(2)).resolves.toBe(`${coverBaseUrl}/SLUS-20062.jpg`);
    await expect(service.getCoverUrl(3)).resolves.toBe(`${coverBaseUrl}/SLUS-99999.jpg`);
  });

  it("returns batch cover URLs only for games with serial numbers", async () => {
    await seedGame(db.pool, 1, "Game One");
    await seedGame(db.pool, 2, "Game Two");
    await seedGame(db.pool, 3, "Game Three");
    await addSerial(1, "SLUS-11111", "NTSC-U");
    await addSerial(2, "SCES-22222", "PAL");

    const result = await new GameCoverService(db.pool).getCoverUrls([1, 2, 3]);

    expect(result).toEqual({
      1: `${coverBaseUrl}/SLUS-11111.jpg`,
      2: `${coverBaseUrl}/SCES-22222.jpg`
    });
  });

  it("refreshes changed and missing cover URLs while skipping unchanged games", async () => {
    await seedGame(db.pool, 1, "Changed Game");
    await seedGame(db.pool, 2, "Unchanged Game");
    await seedGame(db.pool, 3, "Stale Game");
    await addSerial(1, "SLUS-11111", "NTSC-U");
    await addSerial(2, "SCES-22222", "PAL");
    await setImageUrl(1, "old-url");
    await setImageUrl(2, `${coverBaseUrl}/SCES-22222.jpg`);
    await setImageUrl(3, "remove-me");

    const updated = await new CoverImageRefreshService(db.pool).refreshCoverImages();

    expect(updated).toBe(2);
    await expectImageUrl(1, `${coverBaseUrl}/SLUS-11111.jpg`);
    await expectImageUrl(2, `${coverBaseUrl}/SCES-22222.jpg`);
    await expectImageUrl(3, null);
  });

  it("clears generated cover URLs when the cover repository says the image is missing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 404 })));
    await seedGame(db.pool, 1, "Missing Cover Game");
    await addSerial(1, "SLUS-11111", "NTSC-U");
    await setImageUrl(1, `${coverBaseUrl}/SLUS-11111.jpg`);

    const updated = await new CoverImageRefreshService(db.pool).refreshCoverImages();

    expect(updated).toBe(1);
    await expectImageUrl(1, null);
  });

  it("leaves existing covers unchanged when the repository check is inconclusive", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 503 })));
    await seedGame(db.pool, 1, "Unknown Cover Game");
    await addSerial(1, "SLUS-11111", "NTSC-U");
    await setImageUrl(1, "old-url");

    const updated = await new CoverImageRefreshService(db.pool).refreshCoverImages();

    expect(updated).toBe(0);
    await expectImageUrl(1, "old-url");
  });

  it("stops refreshing when cancellation has already been requested", async () => {
    await seedGame(db.pool, 1, "Cancelled Game");
    await addSerial(1, "SLUS-11111", "NTSC-U");
    await setImageUrl(1, "old-url");
    const controller = new AbortController();
    controller.abort();

    const updated = await new CoverImageRefreshService(db.pool).refreshCoverImages(controller.signal);

    expect(updated).toBe(0);
    await expectImageUrl(1, "old-url");
  });

  it("admin refresh broadcasts GamesUpdated only when covers changed", async () => {
    await seedGame(db.pool, 1, "No Change Game");

    const noChange = await app.inject({
      method: "POST",
      url: "/api/admin/update-cover-images",
      headers: adminHeaders(),
      payload: {}
    });
    expect(noChange.statusCode).toBe(200);
    expect(noChange.json()).toEqual({ message: "Cover image update completed", total: 1, updated: 0, skipped: 1, errors: 0 });
    expect(realtimeHub.gamesBroadcasts).toBe(0);

    await db.reset();
    await seedUser(db.pool, "Admin", adminApiKey);
    realtimeHub.gamesBroadcasts = 0;
    await seedGame(db.pool, 1, "Changed Game");
    await addSerial(1, "SLUS-11111", "NTSC-U");

    const changed = await app.inject({
      method: "POST",
      url: "/api/admin/update-cover-images",
      headers: adminHeaders(),
      payload: {}
    });
    expect(changed.statusCode).toBe(200);
    expect(changed.json()).toEqual({ message: "Cover image update completed", total: 1, updated: 1, skipped: 0, errors: 0 });
    expect(realtimeHub.gamesBroadcasts).toBe(1);
  });

  it("streams manual cover refresh progress for the admin page", async () => {
    await seedGame(db.pool, 1, "Stream Game");
    await addSerial(1, "SLUS-11111", "NTSC-U");

    const response = await app.inject({
      method: "POST",
      url: "/api/admin/update-cover-images/stream",
      headers: adminHeaders(),
      payload: {}
    });

    expect(response.statusCode).toBe(200);
    const events = response
      .body
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { type: string; status?: string; total?: number; processed?: number; updated?: number });
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "progress", status: "starting", total: 1, processed: 0 }),
        expect.objectContaining({ type: "progress", status: "updated", total: 1, processed: 1, updated: 1 }),
        expect.objectContaining({ type: "complete", total: 1, updated: 1 })
      ])
    );
  });

  async function addSerial(gameId: number, serialNumber: string, region: string) {
    await db.pool.query("INSERT INTO game_serial_numbers (game_id, serial_number, region) VALUES ($1, $2, $3)", [gameId, serialNumber, region]);
  }

  async function setImageUrl(gameId: number, imageUrl: string | null) {
    await db.pool.query("UPDATE games SET image_url = $2 WHERE game_id = $1", [gameId, imageUrl]);
  }

  async function expectImageUrl(gameId: number, imageUrl: string | null) {
    const result = await db.pool.query<{ image_url: string | null }>("SELECT image_url FROM games WHERE game_id = $1", [gameId]);
    expect(result.rows[0]?.image_url ?? null).toBe(imageUrl);
  }
});

class RecordingRealtimeHub extends RealtimeHub {
  gamesBroadcasts = 0;

  override broadcastGamesUpdated(): void {
    this.gamesBroadcasts++;
    super.broadcastGamesUpdated();
  }
}

function adminHeaders() {
  return {
    "x-api-key": adminApiKey
  };
}
