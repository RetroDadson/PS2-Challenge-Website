import type { GameDto } from "@ps2-challenge/shared";
import { normalizeTitle } from "@ps2-challenge/shared";
import { sql, type Kysely } from "kysely";
import type { Database } from "../db/kysely.js";
import { mapAlternateTitle, mapGame, sortGames, type AlternateTitleRow } from "../utils/dbRows.js";

export type HowLongToBeatGameEntry = {
  gameId: number;
  howLongToBeatId: number;
  mainStorySeconds: number | null;
  mainExtraSeconds: number | null;
  completionistSeconds: number | null;
};

export type HowLongToBeatSyncTiming = {
  attemptedAt: Date;
  nextAttemptAt: Date;
};

const initialHowLongToBeatRetryMs = 30 * 60 * 1000;
const maximumHowLongToBeatRetryMs = 24 * 60 * 60 * 1000;

export class GameRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async list(title?: string): Promise<GameDto[]> {
    const filter = title?.trim();
    const query = this.gameListQuery();
    const rows = filter ? await query.where("g.title", "ilike", `%${filter}%`).execute() : await query.execute();
    return sortGames(rows.map(mapGame));
  }

  async getById(id: number): Promise<GameDto | null> {
    const row = await this.gameListQuery().where("g.game_id", "=", id).executeTakeFirst();
    return row ? mapGame(row) : null;
  }

  async create(game: Omit<GameDto, "id" | "isExcluded" | "isOwned">): Promise<GameDto> {
    const row = await this.db
      .insertInto("games")
      .values({
        title: game.title,
        developer: game.developer ?? null,
        publisher: game.publisher ?? null,
        first_released: game.firstReleased ?? null,
        region_first_released_in: game.regionFirstReleasedIn ?? null,
        released_in_eu_or_na: game.releasedInEuPalOrNa ?? false,
        image_url: game.imageUrl ?? null
      })
      .returning([
        "game_id",
        "title",
        "developer",
        "publisher",
        "first_released",
        "region_first_released_in",
        "released_in_eu_or_na",
        "image_url"
      ])
      .executeTakeFirstOrThrow();

    return mapGame(row);
  }

  async update(id: number, game: Omit<GameDto, "id" | "isExcluded" | "isOwned">): Promise<GameDto | null> {
    const row = await this.db
      .updateTable("games")
      .set({
        title: game.title,
        developer: game.developer ?? null,
        publisher: game.publisher ?? null,
        first_released: game.firstReleased ?? null,
        region_first_released_in: game.regionFirstReleasedIn ?? null,
        released_in_eu_or_na: game.releasedInEuPalOrNa ?? false,
        ...(game.imageUrl === null || game.imageUrl === undefined ? {} : { image_url: game.imageUrl })
      })
      .where("game_id", "=", id)
      .returning([
        "game_id",
        "title",
        "developer",
        "publisher",
        "first_released",
        "region_first_released_in",
        "released_in_eu_or_na",
        "image_url"
      ])
      .executeTakeFirst();

    return row ? mapGame(row) : null;
  }

  async updateCoverUrl(id: number, imageUrl: string | null): Promise<void> {
    const updated = await this.db.updateTable("games").set({ image_url: imageUrl }).where("game_id", "=", id).returning("game_id").executeTakeFirst();
    if (!updated) {
      throw new Error(`No game found with ID ${id}`);
    }
  }

  async upsertHowLongToBeatEntry(entry: HowLongToBeatGameEntry, timing: HowLongToBeatSyncTiming): Promise<boolean> {
    return this.db.transaction().execute(async (transaction) => {
      const existing = await transaction
        .selectFrom("game_howlongtobeat")
        .select(["howlongtobeat_id", "main_story_seconds", "main_extra_seconds", "completionist_seconds"])
        .where("game_id", "=", entry.gameId)
        .executeTakeFirst();
      const changed =
        existing?.howlongtobeat_id !== entry.howLongToBeatId ||
        existing.main_story_seconds !== entry.mainStorySeconds ||
        existing.main_extra_seconds !== entry.mainExtraSeconds ||
        existing.completionist_seconds !== entry.completionistSeconds;

      await transaction
        .insertInto("game_howlongtobeat")
        .values({
          game_id: entry.gameId,
          howlongtobeat_id: entry.howLongToBeatId,
          main_story_seconds: entry.mainStorySeconds,
          main_extra_seconds: entry.mainExtraSeconds,
          completionist_seconds: entry.completionistSeconds,
          last_synced_at: timing.attemptedAt
        })
        .onConflict((oc) =>
          oc.column("game_id").doUpdateSet({
            howlongtobeat_id: entry.howLongToBeatId,
            main_story_seconds: entry.mainStorySeconds,
            main_extra_seconds: entry.mainExtraSeconds,
            completionist_seconds: entry.completionistSeconds,
            last_synced_at: timing.attemptedAt
          })
        )
        .execute();

      await transaction
        .insertInto("game_howlongtobeat_sync_state")
        .values({
          game_id: entry.gameId,
          status: "matched",
          last_attempted_at: timing.attemptedAt,
          last_successful_at: timing.attemptedAt,
          next_attempt_at: timing.nextAttemptAt,
          failure_count: 0,
          last_error: null
        })
        .onConflict((oc) =>
          oc.column("game_id").doUpdateSet({
            status: "matched",
            last_attempted_at: timing.attemptedAt,
            last_successful_at: timing.attemptedAt,
            next_attempt_at: timing.nextAttemptAt,
            failure_count: 0,
            last_error: null
          })
        )
        .execute();
      return changed;
    });
  }

  async ensureHowLongToBeatSyncStates(now = new Date()): Promise<void> {
    await sql`
      INSERT INTO game_howlongtobeat_sync_state (game_id, status, next_attempt_at, failure_count)
      SELECT game_id, 'pending', ${now}, 0
      FROM games
      ON CONFLICT (game_id) DO NOTHING
    `.execute(this.db);
  }

  async listDueHowLongToBeatGames(limit: number, dueAt = new Date()): Promise<GameDto[]> {
    await this.ensureHowLongToBeatSyncStates(dueAt);
    const dueRows = await this.db
      .selectFrom("game_howlongtobeat_sync_state")
      .select("game_id")
      .where("next_attempt_at", "<=", dueAt)
      .orderBy(sql`CASE status WHEN 'pending' THEN 0 WHEN 'error' THEN 1 WHEN 'not_found' THEN 2 ELSE 3 END`)
      .orderBy("next_attempt_at")
      .orderBy("game_id")
      .limit(Math.max(1, limit))
      .execute();
    if (dueRows.length === 0) {
      return [];
    }

    const ids = dueRows.map((row) => row.game_id);
    const games = (await this.gameListQuery().where("g.game_id", "in", ids).execute()).map(mapGame);
    const gamesById = new Map(games.map((game) => [game.id, game]));
    return ids.flatMap((id) => {
      const game = gamesById.get(id);
      return game ? [game] : [];
    });
  }

  async countDueHowLongToBeatGames(dueAt = new Date()): Promise<number> {
    const row = await this.db
      .selectFrom("game_howlongtobeat_sync_state")
      .select((eb) => eb.fn.count<number>("game_id").as("count"))
      .where("next_attempt_at", "<=", dueAt)
      .executeTakeFirstOrThrow();
    return Number(row.count);
  }

  async recordHowLongToBeatNotFound(gameId: number, timing: HowLongToBeatSyncTiming): Promise<void> {
    await this.db
      .insertInto("game_howlongtobeat_sync_state")
      .values({
        game_id: gameId,
        status: "not_found",
        last_attempted_at: timing.attemptedAt,
        last_successful_at: null,
        next_attempt_at: timing.nextAttemptAt,
        failure_count: 0,
        last_error: null
      })
      .onConflict((oc) =>
        oc.column("game_id").doUpdateSet({
          status: "not_found",
          last_attempted_at: timing.attemptedAt,
          next_attempt_at: timing.nextAttemptAt,
          failure_count: 0,
          last_error: null
        })
      )
      .execute();
  }

  async recordHowLongToBeatError(gameId: number, error: string, attemptedAt = new Date()): Promise<void> {
    await this.db.transaction().execute(async (transaction) => {
      await transaction
        .insertInto("game_howlongtobeat_sync_state")
        .values({ game_id: gameId, status: "pending", next_attempt_at: attemptedAt, failure_count: 0 })
        .onConflict((oc) => oc.column("game_id").doNothing())
        .execute();
      const current = await transaction
        .selectFrom("game_howlongtobeat_sync_state")
        .select("failure_count")
        .where("game_id", "=", gameId)
        .executeTakeFirstOrThrow();
      const failureCount = current.failure_count + 1;
      const retryMs = Math.min(maximumHowLongToBeatRetryMs, initialHowLongToBeatRetryMs * 2 ** (failureCount - 1));

      await transaction
        .updateTable("game_howlongtobeat_sync_state")
        .set({
          status: "error",
          last_attempted_at: attemptedAt,
          next_attempt_at: new Date(attemptedAt.getTime() + retryMs),
          failure_count: failureCount,
          last_error: error.slice(0, 2000)
        })
        .where("game_id", "=", gameId)
        .execute();
    });
  }

  async delete(id: number): Promise<boolean> {
    const result = await this.db.deleteFrom("games").where("game_id", "=", id).executeTakeFirst();
    return (result.numDeletedRows ?? 0n) > 0n;
  }

  async findByTitle(title: string): Promise<GameDto | null> {
    const trimmed = title.trim();
    if (!trimmed) {
      return null;
    }

    const exact = await this.gameBasicQuery().where("games.title", "ilike", trimmed).limit(1).executeTakeFirst();
    if (exact) {
      return mapGame(exact);
    }

    const all = await this.gameBasicQuery().execute();
    const normalizedSearch = normalizeTitle(trimmed);
    const fuzzy = all.find((row) => normalizeTitle(row.title) === normalizedSearch);
    if (fuzzy) {
      return mapGame(fuzzy);
    }

    const altExact = await this.db
      .selectFrom("alternate_titles")
      .select("game_id")
      .where("title", "ilike", trimmed)
      .limit(1)
      .executeTakeFirst();
    if (altExact) {
      return this.getById(altExact.game_id);
    }

    const allAlternates = await this.db.selectFrom("alternate_titles").select(["game_id", "title"]).execute();
    const fuzzyAlt = allAlternates.find((row) => normalizeTitle(row.title) === normalizedSearch);
    if (fuzzyAlt) {
      return this.getById(fuzzyAlt.game_id);
    }

    return null;
  }

  async existsByTitle(title: string, excludeId?: number): Promise<boolean> {
    const found = await this.findByTitle(title);
    return !!found && found.id !== excludeId;
  }

  async getExclusion(gameId: number): Promise<{ exclusionId: number; gameId: number; reason: string } | null> {
    const row = await this.db
      .selectFrom("excluded_games")
      .select(["exclusion_id", "game_id", "reason"])
      .where("game_id", "=", gameId)
      .executeTakeFirst();
    return row ? { exclusionId: row.exclusion_id, gameId: row.game_id, reason: row.reason } : null;
  }

  async upsertExclusion(gameId: number, reason: string): Promise<void> {
    const existing = await this.getExclusion(gameId);
    if (existing) {
      await this.db.updateTable("excluded_games").set({ reason }).where("game_id", "=", gameId).execute();
      return;
    }
    await this.db.insertInto("excluded_games").values({ game_id: gameId, reason }).execute();
  }

  async removeExclusion(gameId: number): Promise<boolean> {
    const result = await this.db.deleteFrom("excluded_games").where("game_id", "=", gameId).executeTakeFirst();
    return (result.numDeletedRows ?? 0n) > 0n;
  }

  async getOwnership(gameId: number): Promise<{ ownershipId: number; gameId: number; ownPhysicalCopy: boolean | null; typeOwned: string | null } | null> {
    const row = await this.db
      .selectFrom("game_owned")
      .select(["ownership_id", "game_id", "own_physical_copy", "type_owned"])
      .where("game_id", "=", gameId)
      .executeTakeFirst();
    return row
      ? { ownershipId: row.ownership_id, gameId: row.game_id, ownPhysicalCopy: row.own_physical_copy, typeOwned: row.type_owned }
      : null;
  }

  async upsertOwnership(gameId: number, ownPhysicalCopy: boolean, typeOwned: string): Promise<void> {
    const existing = await this.getOwnership(gameId);
    if (existing) {
      await this.db
        .updateTable("game_owned")
        .set({ own_physical_copy: ownPhysicalCopy, type_owned: typeOwned })
        .where("game_id", "=", gameId)
        .execute();
      return;
    }
    await this.db
      .insertInto("game_owned")
      .values({ game_id: gameId, own_physical_copy: ownPhysicalCopy, type_owned: typeOwned })
      .execute();
  }

  async removeOwnership(gameId: number): Promise<boolean> {
    const result = await this.db.deleteFrom("game_owned").where("game_id", "=", gameId).executeTakeFirst();
    return (result.numDeletedRows ?? 0n) > 0n;
  }

  async ownershipTypes(): Promise<string[]> {
    const rows = await this.db.selectFrom("ownership_types").select("type_owned").orderBy("type_owned").execute();
    return rows.map((row) => row.type_owned);
  }

  async ownedTypesMap(): Promise<Record<number, string>> {
    const rows = await this.db.selectFrom("game_owned").select(["game_id", "type_owned"]).execute();
    return Object.fromEntries(rows.map((row) => [row.game_id, row.type_owned ?? ""]));
  }

  async exclusionReasonsMap(): Promise<Record<number, string>> {
    const rows = await this.db.selectFrom("excluded_games").select(["game_id", "reason"]).execute();
    return Object.fromEntries(rows.map((row) => [row.game_id, row.reason ?? "No reason provided"]));
  }

  async completionStatusMap(): Promise<Record<number, string>> {
    const rows = await this.db.selectFrom("progress").select(["game_id", "date_finished"]).execute();
    return Object.fromEntries(rows.map((row) => [row.game_id, row.date_finished ? "Completed" : "In Progress"]));
  }

  async addSerialNumber(title: string, serialNumber: string, region?: string | null, notes?: string | null) {
    const game = await this.findByTitle(title);
    if (!game) {
      throw new Error(`No game found with title '${title}'`);
    }

    const existing = await this.db
      .selectFrom("game_serial_numbers as s")
      .innerJoin("games as g", "g.game_id", "s.game_id")
      .select(["g.game_id", "g.title"])
      .where("s.serial_number", "=", serialNumber)
      .executeTakeFirst();
    if (existing) {
      throw new Error(`Serial number '${serialNumber}' already exists for game ID ${existing.game_id} ('${existing.title}')`);
    }

    const row = await this.db
      .insertInto("game_serial_numbers")
      .values({ game_id: game.id, serial_number: serialNumber, region: region ?? null, notes: notes ?? null })
      .returning(["serial_id", "game_id", "serial_number", "region", "notes"])
      .executeTakeFirstOrThrow();

    return { ...row, gameTitle: game.title };
  }

  async listSerialNumbers(gameId: number) {
    const rows = await this.db
      .selectFrom("game_serial_numbers")
      .select(["serial_id", "game_id", "serial_number", "region", "notes"])
      .where("game_id", "=", gameId)
      .orderBy("serial_number")
      .execute();
    return rows.map((row) => ({
      serialId: row.serial_id,
      gameId: row.game_id,
      serialNumber: row.serial_number,
      region: row.region,
      notes: row.notes
    }));
  }

  async deleteSerialNumber(gameId: number, serialId: number): Promise<boolean> {
    const result = await this.db
      .deleteFrom("game_serial_numbers")
      .where("game_id", "=", gameId)
      .where("serial_id", "=", serialId)
      .executeTakeFirst();
    return (result.numDeletedRows ?? 0n) > 0n;
  }

  async listAlternateTitles(gameId?: number): Promise<AlternateTitleRow[]> {
    const query = this.db.selectFrom("alternate_titles").select(["alternate_title_id", "game_id", "title", "notes"]).orderBy("title");
    return gameId ? query.where("game_id", "=", gameId).execute() : query.execute();
  }

  async addAlternateTitle(gameId: number, title: string, notes?: string | null) {
    const game = await this.getById(gameId);
    if (!game) {
      throw new Error(`Game with ID ${gameId} not found`);
    }

    const existing = await this.db
      .selectFrom("alternate_titles")
      .select("alternate_title_id")
      .where("game_id", "=", gameId)
      .where("title", "ilike", title)
      .executeTakeFirst();
    if (existing) {
      throw new Error(`Alternate title '${title}' already exists for game '${game.title}' (ID: ${gameId})`);
    }

    const row = await this.db
      .insertInto("alternate_titles")
      .values({ game_id: gameId, title, notes: notes ?? null })
      .returning(["alternate_title_id", "game_id", "title", "notes"])
      .executeTakeFirstOrThrow();
    return mapAlternateTitle(row);
  }

  async deleteAlternateTitle(gameId: number, alternateTitleId: number): Promise<boolean> {
    const result = await this.db
      .deleteFrom("alternate_titles")
      .where("game_id", "=", gameId)
      .where("alternate_title_id", "=", alternateTitleId)
      .executeTakeFirst();
    return (result.numDeletedRows ?? 0n) > 0n;
  }

  private gameListQuery() {
    return this.db
      .selectFrom("games as g")
      .leftJoin("game_howlongtobeat as hltb", "hltb.game_id", "g.game_id")
      .select((eb) => [
        "g.game_id as game_id",
        "g.title as title",
        "g.developer as developer",
        "g.publisher as publisher",
        "g.first_released as first_released",
        "g.region_first_released_in as region_first_released_in",
        "g.released_in_eu_or_na as released_in_eu_or_na",
        "g.image_url as image_url",
        "hltb.howlongtobeat_id as howlongtobeat_id",
        "hltb.main_story_seconds as howlongtobeat_main_story_seconds",
        "hltb.main_extra_seconds as howlongtobeat_main_extra_seconds",
        "hltb.completionist_seconds as howlongtobeat_completionist_seconds",
        eb
          .exists(eb.selectFrom("excluded_games as e").select("e.exclusion_id").whereRef("e.game_id", "=", "g.game_id"))
          .$castTo<boolean>()
          .as("is_excluded"),
        eb
          .exists(eb.selectFrom("game_owned as o").select("o.ownership_id").whereRef("o.game_id", "=", "g.game_id"))
          .$castTo<boolean>()
          .as("is_owned")
      ]);
  }

  private gameBasicQuery() {
    return this.db
      .selectFrom("games")
      .leftJoin("game_howlongtobeat as hltb", "hltb.game_id", "games.game_id")
      .select([
        "games.game_id as game_id",
        "games.title as title",
        "games.developer as developer",
        "games.publisher as publisher",
        "games.first_released as first_released",
        "games.region_first_released_in as region_first_released_in",
        "games.released_in_eu_or_na as released_in_eu_or_na",
        "games.image_url as image_url",
        "hltb.howlongtobeat_id as howlongtobeat_id",
        "hltb.main_story_seconds as howlongtobeat_main_story_seconds",
        "hltb.main_extra_seconds as howlongtobeat_main_extra_seconds",
        "hltb.completionist_seconds as howlongtobeat_completionist_seconds"
      ]);
  }
}
