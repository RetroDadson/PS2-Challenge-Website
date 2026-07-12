import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { parseDateOnly } from "@ps2-challenge/shared";
import type pg from "pg";
import { VoteService } from "../src/services/voteService.js";
import { seedCurrentVote, seedGame, startIntegrationDatabase, type IntegrationDatabase } from "./helpers/postgres.js";

type HistoryRow = {
  game_id: number;
  vote_round: number;
  vote_count: number;
  position: number | null;
  notes: string | null;
};

type CurrentVoteRow = {
  game_id: number;
  vote_count: number;
  game_number: number;
};

type ProgressRow = {
  game_id: number;
  date_started: string;
  date_finished: string | null;
  platform: string;
};

describe("VoteService parity", () => {
  let db: IntegrationDatabase;
  let voteService: VoteService;

  beforeAll(async () => {
    db = await startIntegrationDatabase();
    voteService = new VoteService(db.pool);
  }, 120_000);

  afterAll(async () => {
    await db?.stop();
  });

  beforeEach(async () => {
    await db.reset();
  });

  it("throws when archiving without current votes", async () => {
    await expect(voteService.archiveCurrentVotes()).rejects.toThrow("No current votes to archive");
  });

  it("archives current votes, assigns positions, trims notes, and clears current votes", async () => {
    await seedGames(db.pool, [
      [1, "Top Game"],
      [2, "Second Game"],
      [3, "Last Game"]
    ]);
    await seedCurrentVote(db.pool, 1, 30, 1);
    await seedCurrentVote(db.pool, 2, 20, 2);
    await seedCurrentVote(db.pool, 3, 10, 3);

    const result = await voteService.archiveCurrentVotes("  Round notes  ");

    expect(result).toEqual({ roundNumber: 1, archivedCount: 3, progressStartedGameTitle: "Top Game" });

    const history = await historyRows(db.pool);
    expect(history).toHaveLength(3);
    expect(history.every((row) => row.notes === "Round notes")).toBe(true);
    expect(history.find((row) => row.game_id === 1)?.position).toBe(1);
    expect(history.find((row) => row.game_id === 2)?.position).toBe(2);
    expect(history.find((row) => row.game_id === 3)?.position).toBe(3);
    expect(await currentRows(db.pool)).toEqual([]);
    expect(await progressRows(db.pool)).toEqual([
      { game_id: 1, date_started: parseDateOnly(new Date()), date_finished: null, platform: "Physical" }
    ]);
  });

  it("uses manual archive positions and stores blank notes as null", async () => {
    await seedGames(db.pool, [
      [10, "Tie One"],
      [11, "Tie Two"],
      [12, "Third"]
    ]);
    await seedCurrentVote(db.pool, 10, 15, 1);
    await seedCurrentVote(db.pool, 11, 15, 2);
    await seedCurrentVote(db.pool, 12, 10, 3);

    const result = await voteService.archiveCurrentVotes("", { 10: 2, 11: 1, 12: 3 });

    expect(result.progressStartedGameTitle).toBe("Tie Two");
    const history = await historyRows(db.pool);
    expect(history.find((row) => row.game_id === 10)?.position).toBe(2);
    expect(history.find((row) => row.game_id === 11)?.position).toBe(1);
    expect(history.find((row) => row.game_id === 12)?.position).toBe(3);
    expect(history.every((row) => row.notes === null)).toBe(true);
    expect((await progressRows(db.pool)).map((row) => row.game_id)).toEqual([11]);
  });

  it("does not start progress when the top position is an unresolved tie", async () => {
    await seedGames(db.pool, [
      [10, "Tie One"],
      [11, "Tie Two"],
      [12, "Third"]
    ]);
    await seedCurrentVote(db.pool, 10, 15, 1);
    await seedCurrentVote(db.pool, 11, 15, 2);
    await seedCurrentVote(db.pool, 12, 10, 3);

    const result = await voteService.archiveCurrentVotes();

    expect(result.progressStartedGameTitle).toBeNull();
    expect(await progressRows(db.pool)).toEqual([]);
  });

  it("keeps an existing progress row for the archive winner untouched", async () => {
    await seedGames(db.pool, [
      [1, "Top Game"],
      [2, "Second Game"]
    ]);
    await seedCurrentVote(db.pool, 1, 30, 1);
    await seedCurrentVote(db.pool, 2, 20, 2);
    await db.pool.query("INSERT INTO progress (game_id, date_started, date_finished, platform) VALUES (1, '2025-01-01', '2025-02-01', 'Emulated')");

    const result = await voteService.archiveCurrentVotes();

    expect(result.progressStartedGameTitle).toBeNull();
    expect(await progressRows(db.pool)).toEqual([
      { game_id: 1, date_started: "2025-01-01", date_finished: "2025-02-01", platform: "Emulated" }
    ]);
  });

  it("starts progress as Emulated when the winner is not owned physically", async () => {
    await seedGames(db.pool, [
      [1, "Top Game"],
      [2, "Second Game"]
    ]);
    await db.pool.query("INSERT INTO game_owned (game_id, own_physical_copy, type_owned) VALUES (1, false, 'Base')");
    await seedCurrentVote(db.pool, 1, 30, 1);
    await seedCurrentVote(db.pool, 2, 20, 2);

    const result = await voteService.archiveCurrentVotes();

    expect(result.progressStartedGameTitle).toBe("Top Game");
    expect(await progressRows(db.pool)).toEqual([
      { game_id: 1, date_started: parseDateOnly(new Date()), date_finished: null, platform: "Emulated" }
    ]);
  });

  it("throws when setting an empty current-vote payload", async () => {
    await expect(voteService.setCurrentVotes([])).rejects.toThrow("No votes provided");
  });

  it("inserts, updates, and skips invalid current-vote rows", async () => {
    await seedGames(db.pool, [
      [1, "Game One"],
      [2, "Game Two"],
      [3, "Game Three"]
    ]);
    await seedCurrentVote(db.pool, 1, 5, 1);

    const result = await voteService.setCurrentVotes([
      { gameId: 0, gameTitle: "Game One", voteCount: 7, gameNumber: 2 },
      { gameId: 0, gameTitle: "Game Two", voteCount: 3, gameNumber: 1 },
      { gameId: 0, gameTitle: "Game Three", voteCount: -1, gameNumber: 1 },
      { gameId: 0, gameTitle: "   ", voteCount: 2, gameNumber: 1 }
    ]);

    expect(result).toEqual({ inserted: 1, updated: 1 });
    expect(await currentRows(db.pool)).toEqual([
      { game_id: 1, vote_count: 7, game_number: 2 },
      { game_id: 2, vote_count: 3, game_number: 1 }
    ]);
  });

  it("throws when duplicate game titles are provided", async () => {
    await seedGame(db.pool, 1, "Game One");

    await expect(
      voteService.setCurrentVotes([
        { gameId: 0, gameTitle: "Game One", voteCount: 7, gameNumber: 1 },
        { gameId: 0, gameTitle: "game one", voteCount: 5, gameNumber: 2 }
      ])
    ).rejects.toThrow("Duplicate game titles");
  });

  it("throws when projected current-vote game numbers collide", async () => {
    await seedGames(db.pool, [
      [1, "Game One"],
      [2, "Game Two"]
    ]);
    await seedCurrentVote(db.pool, 1, 5, 1);
    await seedCurrentVote(db.pool, 2, 3, 2);

    await expect(voteService.setCurrentVotes([{ gameId: 0, gameTitle: "Game One", voteCount: 7, gameNumber: 2 }])).rejects.toThrow(
      "unique game numbers"
    );
  });

  it("removes current votes by case-insensitive title", async () => {
    await seedGame(db.pool, 1, "God of War");
    await seedCurrentVote(db.pool, 1, 9, 1);

    await expect(voteService.removeCurrentVote("  god OF war  ")).resolves.toBe(true);
    expect(await currentRows(db.pool)).toEqual([]);
  });

  it("returns false when removing a known game without a current vote", async () => {
    await seedGame(db.pool, 1, "Silent Hill 2");

    await expect(voteService.removeCurrentVote("Silent Hill 2")).resolves.toBe(false);
  });

  it("falls back to vote-count order when history positions are missing", async () => {
    await seedGames(db.pool, [
      [1, "Top Game"],
      [2, "Second Game"],
      [3, "Last Game"]
    ]);
    await db.pool.query(
      `
      INSERT INTO vote_history (game_id, vote_round, vote_count, position, notes)
      VALUES
        (1, 3, 50, null, 'Round 3 notes'),
        (2, 3, 40, null, null),
        (3, 3, 30, null, null)
      `
    );

    const history = await voteService.getVoteHistory();

    expect(history).toEqual([
      expect.objectContaining({
        voteRound: 3,
        topGameTitle: "Top Game",
        topVotes: 50,
        secondGameTitle: "Second Game",
        secondVotes: 40,
        lastGameTitle: "Last Game",
        lastVotes: 30,
        notes: "Round 3 notes"
      })
    ]);
  });

  it("fills current votes with eligible random games up to available slots", async () => {
    await seedGames(db.pool, [
      [1, "Eligible One"],
      [2, "Eligible Two"],
      [3, "Already In Votes"],
      [4, "Excluded"],
      [5, "Started"]
    ]);
    await db.pool.query(
      `
      INSERT INTO game_owned (game_id, own_physical_copy, type_owned)
      VALUES
        (1, true, 'Base'),
        (2, true, 'Base'),
        (3, true, 'Base'),
        (4, true, 'Base'),
        (5, true, 'Base')
      `
    );
    await seedCurrentVote(db.pool, 3, 1, 1);
    await db.pool.query("INSERT INTO excluded_games (game_id, reason) VALUES (4, 'No longer available')");
    await db.pool.query("INSERT INTO progress (game_id, date_started, platform) VALUES (5, '2025-01-01', 'Physical')");

    const added = await voteService.fillCurrentVotesWithRandomGameDetails(2);

    expect(added).toHaveLength(2);
    const currentVotes = await currentRows(db.pool, "game_number");
    expect(currentVotes).toHaveLength(3);
    expect(currentVotes.map((vote) => vote.game_id).sort()).toEqual([1, 2, 3]);
    expect(currentVotes.map((vote) => vote.game_number).sort()).toEqual([1, 2, 3]);
  });
});

async function seedGames(pool: pg.Pool, games: Array<[number, string]>): Promise<void> {
  for (const [id, title] of games) {
    await seedGame(pool, id, title);
  }
}

async function historyRows(pool: pg.Pool): Promise<HistoryRow[]> {
  const result = await pool.query<HistoryRow>("SELECT game_id, vote_round, vote_count, position, notes FROM vote_history ORDER BY game_id");
  return result.rows;
}

async function currentRows(pool: pg.Pool, orderBy = "game_id"): Promise<CurrentVoteRow[]> {
  const result = await pool.query<CurrentVoteRow>(`SELECT game_id, vote_count, game_number FROM current_vote ORDER BY ${orderBy}`);
  return result.rows;
}

async function progressRows(pool: pg.Pool): Promise<ProgressRow[]> {
  const result = await pool.query<ProgressRow>(
    `
    SELECT game_id, to_char(date_started, 'YYYY-MM-DD') AS date_started, to_char(date_finished, 'YYYY-MM-DD') AS date_finished, platform
    FROM progress ORDER BY game_id
    `
  );
  return result.rows;
}
