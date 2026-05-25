import crypto from "node:crypto";
import type { CurrentVoteDto, UploadRoundDto, VoteRoundDto } from "@ps2-challenge/shared";
import { sql, type Kysely } from "kysely";
import type pg from "pg";
import { createKyselyFromPool, type Database } from "../db/kysely.js";

type CurrentVoteRow = {
  game_id: number;
  vote_count: number;
  game_number: number;
};

type VoteHistoryRow = {
  game_id: number;
  game_title: string;
  vote_round: number;
  vote_count: number;
  position: number | null;
  notes: string | null;
};

export class VoteService {
  private readonly db: Kysely<Database>;

  constructor(pool: pg.Pool, db?: Kysely<Database>) {
    this.db = db ?? createKyselyFromPool(pool);
  }

  async getCurrentVotes(): Promise<CurrentVoteDto[]> {
    const rows = await this.db
      .selectFrom("current_vote as cv")
      .leftJoin("games as g", "g.game_id", "cv.game_id")
      .select([
        "cv.game_id as game_id",
        sql<string>`COALESCE(g.title, '')`.as("game_title"),
        "cv.vote_count as vote_count",
        "cv.game_number as game_number"
      ])
      .orderBy("cv.game_number")
      .orderBy("cv.vote_count", "desc")
      .orderBy("g.title")
      .execute();

    return rows.map(mapCurrentVote);
  }

  async setCurrentVotes(votes: CurrentVoteDto[]): Promise<{ inserted: number; updated: number }> {
    if (!votes.length) {
      throw new Error("No votes provided");
    }

    const titles = [...new Set(votes.map((vote) => vote.gameTitle.trim()).filter(Boolean).map((title) => title.toLocaleLowerCase("en-GB")))];
    if (!titles.length) {
      throw new Error("No game titles provided");
    }

    const games = await this.db.selectFrom("games").select(["game_id", "title"]).execute();
    const titleToId = new Map(games.map((row) => [row.title.trim().toLocaleLowerCase("en-GB"), row.game_id]));
    const missing = titles.filter((title) => !titleToId.has(title));
    if (missing.length) {
      throw new Error(`Some game titles were not found: ${missing.join(", ")}`);
    }

    const resolved = votes
      .map((vote) => ({ vote, gameId: titleToId.get(vote.gameTitle.trim().toLocaleLowerCase("en-GB")) ?? 0 }))
      .filter(({ vote, gameId }) => gameId > 0 && vote.voteCount >= 0 && vote.gameNumber >= 1 && vote.gameNumber <= 3);

    const duplicateGameIds = resolved
      .map((entry) => entry.gameId)
      .filter((gameId, index, all) => all.indexOf(gameId) !== index);
    if (duplicateGameIds.length) {
      const duplicateTitles = resolved
        .filter((entry) => duplicateGameIds.includes(entry.gameId))
        .map((entry) => entry.vote.gameTitle.trim());
      throw new Error(`Duplicate game titles are not allowed: ${[...new Set(duplicateTitles)].join(", ")}`);
    }

    const existing = await this.currentVoteRows(this.db);
    const projectedNumbers = new Map(existing.map((row) => [row.game_id, row.game_number]));
    for (const entry of resolved) {
      projectedNumbers.set(entry.gameId, entry.vote.gameNumber);
    }
    const duplicates = [...projectedNumbers.values()]
      .filter((gameNumber, index, all) => all.indexOf(gameNumber) !== index)
      .sort((left, right) => left - right);
    if (duplicates.length) {
      throw new Error(`Current votes must use unique game numbers. Duplicate positions: ${[...new Set(duplicates)].join(", ")}`);
    }

    let inserted = 0;
    let updated = 0;
    await this.db.transaction().execute(async (transaction) => {
      for (const entry of resolved) {
        const current = existing.find((row) => row.game_id === entry.gameId);
        if (current) {
          if (current.vote_count !== entry.vote.voteCount || current.game_number !== entry.vote.gameNumber) {
            await transaction
              .updateTable("current_vote")
              .set({ vote_count: entry.vote.voteCount, game_number: entry.vote.gameNumber })
              .where("game_id", "=", entry.gameId)
              .execute();
            updated++;
          }
        } else {
          await transaction
            .insertInto("current_vote")
            .values({ game_id: entry.gameId, vote_count: entry.vote.voteCount, game_number: entry.vote.gameNumber })
            .execute();
          inserted++;
        }
      }
    });

    return { inserted, updated };
  }

  async removeCurrentVote(gameTitle: string): Promise<boolean> {
    if (!gameTitle.trim()) {
      throw new Error("Game title is required");
    }
    const game = await this.db.selectFrom("games").select("game_id").where("title", "ilike", gameTitle.trim()).executeTakeFirst();
    if (!game) {
      throw new Error(`Game '${gameTitle}' not found`);
    }
    const result = await this.db.deleteFrom("current_vote").where("game_id", "=", game.game_id).executeTakeFirst();
    return (result.numDeletedRows ?? 0n) > 0n;
  }

  async archiveCurrentVotes(notes?: string | null, manualPositions?: Record<number, number>): Promise<{ roundNumber: number; archivedCount: number }> {
    return this.db
      .transaction()
      .setIsolationLevel("serializable")
      .execute(async (transaction) => {
        const current = await this.currentVoteRows(transaction);
        if (!current.length) {
          throw new Error("No current votes to archive");
        }

        const maxRound = await transaction
          .selectFrom("vote_history")
          .select((eb) => eb.fn.max<number>("vote_round").as("max_round"))
          .executeTakeFirst();
        const roundNumber = (maxRound?.max_round ?? 0) + 1;
        const sorted = [...current].sort((left, right) => right.vote_count - left.vote_count);
        for (let index = 0; index < sorted.length; index++) {
          const vote = sorted[index]!;
          const position = determinePosition(sorted, index, vote, manualPositions);
          await transaction
            .insertInto("vote_history")
            .values({
              game_id: vote.game_id,
              vote_round: roundNumber,
              vote_count: vote.vote_count,
              position,
              notes: notes?.trim() || null
            })
            .execute();
        }
        await transaction.deleteFrom("current_vote").execute();
        return { roundNumber, archivedCount: sorted.length };
      });
  }

  async getVoteHistory(): Promise<VoteRoundDto[]> {
    const rows = await this.db
      .selectFrom("vote_history as vh")
      .leftJoin("games as g", "g.game_id", "vh.game_id")
      .select([
        "vh.game_id as game_id",
        sql<string>`COALESCE(g.title, '')`.as("game_title"),
        "vh.vote_round as vote_round",
        "vh.vote_count as vote_count",
        "vh.position as position",
        "vh.notes as notes"
      ])
      .orderBy("vh.vote_round", "desc")
      .execute();

    const history = rows as VoteHistoryRow[];
    const rounds = [...new Set(history.map((row) => row.vote_round))].sort((left, right) => right - left);
    return rounds.map((round) => {
      const perRound = history.filter((row) => row.vote_round === round);
      const ordered = [...perRound].sort((left, right) => right.vote_count - left.vote_count);
      const top = perRound.find((row) => row.position === 1) ?? ordered[0];
      const second = perRound.find((row) => row.position === 2) ?? ordered[1];
      const last = perRound.find((row) => row.position === 3) ?? ordered[2];
      const notes = perRound.find((row) => row.notes)?.notes ?? "";

      return {
        voteRound: round,
        topGameTitle: top?.game_title ?? "",
        topVotes: top?.vote_count ?? 0,
        topPosition: top?.position ?? undefined,
        secondGameTitle: second?.game_title ?? "",
        secondVotes: second?.vote_count ?? 0,
        secondPosition: second?.position ?? undefined,
        lastGameTitle: last?.game_title ?? "",
        lastVotes: last?.vote_count ?? 0,
        lastPosition: last?.position ?? undefined,
        notes
      };
    });
  }

  async uploadHistory(rounds: UploadRoundDto[]): Promise<{ inserted: number; updated: number }> {
    if (!rounds.length) {
      throw new Error("No rounds provided");
    }

    let inserted = 0;
    let updated = 0;
    await this.db.transaction().execute(async (transaction) => {
      for (const round of rounds) {
        for (const vote of round.votes) {
          const game = await transaction.selectFrom("games").select("game_id").where("title", "ilike", vote.gameTitle.trim()).executeTakeFirst();
          if (!game) {
            throw new Error(`Some game titles were not found: ${vote.gameTitle}`);
          }
          const existing = await transaction
            .selectFrom("vote_history")
            .select("history_id")
            .where("vote_round", "=", round.voteRound)
            .where("game_id", "=", game.game_id)
            .executeTakeFirst();
          if (existing) {
            await transaction
              .updateTable("vote_history")
              .set({ vote_count: vote.count, position: vote.position ?? null, notes: round.notes ?? null })
              .where("vote_round", "=", round.voteRound)
              .where("game_id", "=", game.game_id)
              .execute();
            updated++;
          } else {
            await transaction
              .insertInto("vote_history")
              .values({
                game_id: game.game_id,
                vote_round: round.voteRound,
                vote_count: vote.count,
                position: vote.position ?? null,
                notes: round.notes ?? null
              })
              .execute();
            inserted++;
          }
        }
      }
    });
    return { inserted, updated };
  }

  async updateVoteCountByGameNumber(gameNumber: number, voteCount: number): Promise<CurrentVoteDto | null> {
    const row = await this.db
      .updateTable("current_vote")
      .set({ vote_count: voteCount })
      .where("game_number", "=", gameNumber)
      .returning(["game_id", "vote_count", "game_number"])
      .executeTakeFirst();
    if (!row) {
      return null;
    }

    const game = await this.db.selectFrom("games").select("title").where("game_id", "=", row.game_id).executeTakeFirst();
    return { gameId: row.game_id, gameTitle: game?.title ?? "", voteCount: row.vote_count, gameNumber: row.game_number };
  }

  async fillCurrentVotesWithRandomGameDetails(count: number): Promise<CurrentVoteDto[]> {
    if (count <= 0) {
      throw new Error("Count must be greater than 0");
    }

    const current = await this.getCurrentVotes();
    const slotsAvailable = 3 - current.length;
    if (slotsAvailable <= 0) {
      throw new Error("Current votes already has 3 games. Archive or remove existing votes first.");
    }
    const gamesToAdd = Math.min(count, slotsAvailable);
    const eligible = await this.db
      .selectFrom("games as g")
      .innerJoin("game_owned as go", "go.game_id", "g.game_id")
      .leftJoin("excluded_games as eg", "eg.game_id", "g.game_id")
      .leftJoin("progress as p", "p.game_id", "g.game_id")
      .leftJoin("current_vote as cv", "cv.game_id", "g.game_id")
      .select(["g.game_id as game_id", "g.title as title"])
      .where("eg.game_id", "is", null)
      .where("p.game_id", "is", null)
      .where("cv.game_id", "is", null)
      .execute();
    if (!eligible.length) {
      throw new Error("No eligible games found. Games must be owned, not excluded, and not started.");
    }
    if (eligible.length < gamesToAdd) {
      throw new Error(`Only ${eligible.length} eligible game(s) available, but ${gamesToAdd} requested.`);
    }

    const shuffled = shuffle(eligible);
    const usedNumbers = new Set(current.map((vote) => vote.gameNumber));
    const availableNumbers = [1, 2, 3].filter((number) => !usedNumbers.has(number));
    const added: CurrentVoteDto[] = [];
    for (let index = 0; index < gamesToAdd; index++) {
      const game = shuffled[index]!;
      const gameNumber = availableNumbers[index]!;
      await this.db.insertInto("current_vote").values({ game_id: game.game_id, vote_count: 0, game_number: gameNumber }).execute();
      added.push({ gameId: game.game_id, gameTitle: game.title, voteCount: 0, gameNumber });
    }
    return added;
  }

  private currentVoteRows(db: Kysely<Database>): Promise<CurrentVoteRow[]> {
    return db.selectFrom("current_vote").select(["game_id", "vote_count", "game_number"]).execute();
  }
}

function mapCurrentVote(row: { game_id: number; game_title: string; vote_count: number; game_number: number }): CurrentVoteDto {
  return {
    gameId: row.game_id,
    gameTitle: row.game_title,
    voteCount: row.vote_count,
    gameNumber: row.game_number
  };
}

function determinePosition(
  sortedVotes: { game_id: number; vote_count: number }[],
  index: number,
  vote: { game_id: number; vote_count: number },
  manualPositions?: Record<number, number>
): number | null {
  const manual = manualPositions?.[vote.game_id];
  if (manual !== undefined) {
    return manual;
  }
  if (index === 0 && (sortedVotes.length === 1 || sortedVotes[1]!.vote_count !== vote.vote_count)) {
    return 1;
  }
  if (index === 1 && sortedVotes[0]!.vote_count !== vote.vote_count && (sortedVotes.length === 2 || sortedVotes[2]!.vote_count !== vote.vote_count)) {
    return 2;
  }
  if (index === 2 && sortedVotes[1]!.vote_count !== vote.vote_count) {
    return 3;
  }
  return null;
}

function shuffle<T>(items: T[]): T[] {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index--) {
    const swap = crypto.randomInt(index + 1);
    [shuffled[index], shuffled[swap]] = [shuffled[swap]!, shuffled[index]!];
  }
  return shuffled;
}
