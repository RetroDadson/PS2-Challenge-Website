import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GameService } from "../src/services/gameService.js";
import { seedGame, startIntegrationDatabase, type IntegrationDatabase } from "./helpers/postgres.js";

describe("GameService parity", () => {
  let db: IntegrationDatabase;
  let gameService: GameService;

  beforeAll(async () => {
    db = await startIntegrationDatabase();
    gameService = new GameService(db.pool);
  }, 120_000);

  afterAll(async () => {
    await db?.stop();
  });

  beforeEach(async () => {
    await db.reset();
  });

  it("lists games in C# order and marks excluded and owned games", async () => {
    await seedGame(db.pool, 1, "Alpha Game");
    await seedGame(db.pool, 2, ".hack//G.U.");
    await seedGame(db.pool, 3, "24: The Game");
    await db.pool.query("INSERT INTO excluded_games (game_id, reason) VALUES (1, 'Testing')");
    await db.pool.query("INSERT INTO game_owned (game_id, own_physical_copy, type_owned) VALUES (3, true, 'Base')");

    const games = await gameService.list();

    expect(games.map((game) => game.title)).toEqual([".hack//G.U.", "24: The Game", "Alpha Game"]);
    expect(games.find((game) => game.id === 1)?.isExcluded).toBe(true);
    expect(games.find((game) => game.id === 3)?.isOwned).toBe(true);
  });

  it("searches games by partial title", async () => {
    await seedGame(db.pool, 1, "Grand Theft Auto");
    await seedGame(db.pool, 2, "Grand Turismo");
    await seedGame(db.pool, 3, "Metal Gear Solid");

    const games = await gameService.list("Grand");

    expect(games.map((game) => game.title)).toEqual(["Grand Theft Auto", "Grand Turismo"]);
  });

  it("rejects duplicate titles when creating games", async () => {
    await seedGame(db.pool, 1, "Duplicate Game");

    await expect(
      gameService.create({
        title: "Duplicate Game",
        developer: "D",
        publisher: "P",
        firstReleased: null,
        regionFirstReleasedIn: "NA",
        releasedInEuPalOrNa: true,
        imageUrl: null
      })
    ).rejects.toThrow("already exists");
  });

  it("creates progress and returns the full updated progress payload", async () => {
    await seedGame(db.pool, 1, "Test Game");

    const progress = await gameService.upsertProgress(
      "Test Game",
      "2024-01-01",
      null,
      "05:30:00",
      "Beat the main story",
      "Great game!",
      "Physical"
    );

    expect(progress).toEqual(
      expect.objectContaining({
        progressId: expect.any(Number),
        gameId: 1,
        gameTitle: "Test Game",
        dateStarted: "2024-01-01",
        dateFinished: null,
        completionTime: "05:30:00",
        beatenCriteria: "Beat the main story",
        review: "Great game!",
        platform: "Physical"
      })
    );
  });

  it("updates existing progress instead of inserting duplicates", async () => {
    await seedGame(db.pool, 1, "Test Game");
    const created = await gameService.upsertProgress("Test Game", "2024-01-01", null, "05:30:00", null, null, "Physical");

    const updated = await gameService.upsertProgress(
      "Test Game",
      "2024-01-01",
      "2024-01-15",
      "10:45:30",
      "100% completion",
      "Updated review",
      "Physical"
    );

    expect(updated.progressId).toBe(created.progressId);
    expect(updated).toEqual(
      expect.objectContaining({
        dateFinished: "2024-01-15",
        completionTime: "10:45:30",
        beatenCriteria: "100% completion",
        review: "Updated review"
      })
    );

    const rows = await db.pool.query<{ count: string }>("SELECT count(*) FROM progress");
    expect(rows.rows[0]?.count).toBe("1");
  });

  it("can return only completed progress records", async () => {
    await seedGame(db.pool, 1, "Completed Game");
    await seedGame(db.pool, 2, "In Progress Game");
    await gameService.upsertProgress("Completed Game", "2024-01-01", "2024-01-15", null, null, null, "Physical");
    await gameService.upsertProgress("In Progress Game", "2024-01-01", null, null, null, null, "Physical");

    const completed = await gameService.allProgress(true);

    expect(completed).toHaveLength(1);
    expect(completed[0]?.gameTitle).toBe("Completed Game");
  });

  it("adds serial numbers and reports the existing game on duplicates", async () => {
    await seedGame(db.pool, 1, "Game 1");
    await seedGame(db.pool, 2, "Game 2");

    const serial = await gameService.addSerialNumber("Game 1", "SLUS-20062", "NTSC-U", "North American release");

    expect(serial).toEqual(
      expect.objectContaining({
        game_id: 1,
        serial_number: "SLUS-20062",
        region: "NTSC-U",
        notes: "North American release",
        gameTitle: "Game 1"
      })
    );
    await expect(gameService.addSerialNumber("Game 2", "SLUS-20062", "PAL", null)).rejects.toThrow(
      "Serial number 'SLUS-20062' already exists for game ID 1 ('Game 1')"
    );
  });

  it("combines games page data with owned, excluded, completion, and alternate-title lookups", async () => {
    await seedGame(db.pool, 1, "Alpha");
    await seedGame(db.pool, 2, ".hack//G.U.");
    await seedGame(db.pool, 3, "Beta");
    await db.pool.query("INSERT INTO game_owned (game_id, own_physical_copy, type_owned) VALUES (1, true, 'Base')");
    await db.pool.query("INSERT INTO excluded_games (game_id, reason) VALUES (3, 'Filtered')");
    await gameService.upsertProgress("Alpha", "2024-01-01", "2024-01-02", null, null, null, "Physical");
    await gameService.upsertProgress(".hack//G.U.", "2024-02-01", null, null, null, null, "Physical");
    await gameService.addAlternateTitle(2, "hack GU", "Alt");

    const result = await gameService.getGamesPageData();

    expect(result.games.map((game) => game.title)).toEqual([".hack//G.U.", "Alpha", "Beta"]);
    expect(result.ownedTypes["1"]).toBe("Base");
    expect(result.exclusionReasons["3"]).toBe("Filtered");
    expect(result.completionStatus["1"]).toBe("Completed");
    expect(result.completionStatus["2"]).toBe("In Progress");
    expect(result.alternateTitles["2"]).toEqual([expect.objectContaining({ title: "hack GU", notes: "Alt" })]);
  });
});
