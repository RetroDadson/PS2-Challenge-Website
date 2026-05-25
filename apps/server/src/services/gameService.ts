import type { GameDto, GameProgressDto, GamesPageDataDto } from "@ps2-challenge/shared";
import { parseDurationToSeconds } from "@ps2-challenge/shared";
import { sql, type Kysely } from "kysely";
import type pg from "pg";
import { createKyselyFromPool, type Database } from "../db/kysely.js";
import { GameRepository } from "../repositories/gameRepository.js";
import { mapAlternateTitle, mapProgress } from "../utils/dbRows.js";

const noReasonProvided = "No reason provided";

type OwnershipUpdate = {
  ownPhysicalCopy: boolean;
  typeOwned: string;
};

export class GameService {
  private readonly repository: GameRepository;
  private readonly db: Kysely<Database>;

  constructor(
    private readonly pool: pg.Pool,
    db?: Kysely<Database>
  ) {
    this.db = db ?? createKyselyFromPool(pool);
    this.repository = new GameRepository(this.db);
  }

  list(title?: string): Promise<GameDto[]> {
    return this.repository.list(title);
  }

  getById(id: number): Promise<GameDto | null> {
    return this.repository.getById(id);
  }

  async create(game: Omit<GameDto, "id" | "isExcluded" | "isOwned">): Promise<GameDto> {
    const existing = await this.repository.findByTitle(game.title);
    if (existing) {
      throw new Error(`A game with the title '${game.title}' already exists with ID ${existing.id}`);
    }
    return this.repository.create(game);
  }

  async update(id: number, game: Omit<GameDto, "id" | "isExcluded" | "isOwned">): Promise<GameDto> {
    const existing = await this.repository.getById(id);
    if (!existing) {
      throw new Error(`No game found with ID ${id}`);
    }
    if (existing.title !== game.title && (await this.repository.existsByTitle(game.title, id))) {
      throw new Error(`A game with the title '${game.title}' already exists`);
    }
    const updated = await this.repository.update(id, game);
    if (!updated) {
      throw new Error(`No game found with ID ${id}`);
    }
    return updated;
  }

  delete(id: number): Promise<boolean> {
    return this.repository.delete(id);
  }

  async addExcludedGame(title: string, reason?: string | null) {
    const game = await this.repository.findByTitle(title);
    if (!game) {
      throw new Error(`No game found with title '${title}'`);
    }
    const existing = await this.repository.getExclusion(game.id);
    if (existing) {
      throw new Error(`Game '${title}' is already excluded with reason: ${existing.reason}`);
    }
    await this.repository.upsertExclusion(game.id, reason ?? noReasonProvided);
    return (await this.repository.getExclusion(game.id))!;
  }

  excludeGame(gameId: number, reason?: string | null): Promise<void> {
    return this.repository.upsertExclusion(gameId, reason ?? noReasonProvided);
  }

  includeGame(gameId: number): Promise<boolean> {
    return this.repository.removeExclusion(gameId);
  }

  async addGameOwned(title: string, ownership: OwnershipUpdate) {
    const game = await this.repository.findByTitle(title);
    if (!game) {
      throw new Error(`No game found with title '${title}'`);
    }
    const existing = await this.repository.getOwnership(game.id);
    if (existing) {
      throw new Error(`Game '${title}' is already marked as owned`);
    }
    await this.markGameOwned(game.id, ownership);
    return (await this.repository.getOwnership(game.id))!;
  }

  markGameOwned(gameId: number, ownership: OwnershipUpdate): Promise<void> {
    return this.repository.upsertOwnership(gameId, ownership.ownPhysicalCopy, ownership.typeOwned);
  }

  removeGameOwnership(gameId: number): Promise<boolean> {
    return this.repository.removeOwnership(gameId);
  }

  ownershipTypes(): Promise<string[]> {
    return this.repository.ownershipTypes();
  }

  ownedTypesMap(): Promise<Record<number, string>> {
    return this.repository.ownedTypesMap();
  }

  async upsertProgress(
    title: string,
    dateStarted: string,
    dateFinished: string | null | undefined,
    completionTimeString: string | null | undefined,
    beatenCriteria: string | null | undefined,
    review: string | null | undefined,
    platform: string
  ) {
    const game = await this.repository.findByTitle(title);
    if (!game) {
      throw new Error(`No game found with title '${title}'`);
    }
    const completionSeconds = parseDurationToSeconds(completionTimeString);
    const interval = completionSeconds === null ? null : `${completionSeconds} seconds`;
    const existing = await this.db.selectFrom("progress").select("progress_id").where("game_id", "=", game.id).executeTakeFirst();

    let progressId: number;
    if (existing) {
      const result = await this.db
        .updateTable("progress")
        .set({
          date_started: dateStarted,
          date_finished: dateFinished ?? null,
          completion_time: interval === null ? null : sql`${interval}::interval`,
          beaten_criteria: beatenCriteria ?? null,
          review: review ?? null,
          platform
        })
        .where("game_id", "=", game.id)
        .returning("progress_id")
        .executeTakeFirstOrThrow();
      progressId = result.progress_id;
    } else {
      const result = await this.db
        .insertInto("progress")
        .values({
          game_id: game.id,
          date_started: dateStarted,
          date_finished: dateFinished ?? null,
          completion_time: interval === null ? null : sql`${interval}::interval`,
          beaten_criteria: beatenCriteria ?? null,
          review: review ?? null,
          platform
        })
        .returning("progress_id")
        .executeTakeFirstOrThrow();
      progressId = result.progress_id;
    }

    return this.getProgressById(progressId);
  }

  private async getProgressById(progressId: number): Promise<GameProgressDto> {
    const row = await this.progressQuery().where("p.progress_id", "=", progressId).executeTakeFirstOrThrow();
    return mapProgress(row);
  }

  async allProgress(completedOnly = false): Promise<GameProgressDto[]> {
    const query = completedOnly ? this.progressQuery().where("p.date_finished", "is not", null) : this.progressQuery();
    const rows = await query.orderBy(completedOnly ? "p.date_finished" : "p.date_started", "desc").execute();
    return rows.map(mapProgress);
  }

  async getGamesPageData(): Promise<GamesPageDataDto> {
    const [games, ownedTypes, exclusionReasons, completionStatus, alternateRows] = await Promise.all([
      this.list(),
      this.repository.ownedTypesMap(),
      this.repository.exclusionReasonsMap(),
      this.repository.completionStatusMap(),
      this.repository.listAlternateTitles()
    ]);

    const alternateTitles = alternateRows.reduce<Record<string, ReturnType<typeof mapAlternateTitle>[]>>((acc, row) => {
      const key = String(row.game_id);
      acc[key] ??= [];
      acc[key].push(mapAlternateTitle(row));
      return acc;
    }, {});

    return {
      games,
      ownedTypes: Object.fromEntries(Object.entries(ownedTypes).map(([key, value]) => [key, value])),
      exclusionReasons: Object.fromEntries(Object.entries(exclusionReasons).map(([key, value]) => [key, value])),
      completionStatus: Object.fromEntries(Object.entries(completionStatus).map(([key, value]) => [key, value])),
      alternateTitles
    };
  }

  updateGameCoverUrl(gameId: number, imageUrl: string | null): Promise<void> {
    return this.repository.updateCoverUrl(gameId, imageUrl);
  }

  addSerialNumber(title: string, serialNumber: string, region?: string | null, notes?: string | null) {
    return this.repository.addSerialNumber(title, serialNumber, region, notes);
  }

  listSerialNumbers(gameId: number) {
    return this.repository.listSerialNumbers(gameId);
  }

  deleteSerialNumber(gameId: number, serialId: number): Promise<boolean> {
    return this.repository.deleteSerialNumber(gameId, serialId);
  }

  async getAlternateTitlesForGame(gameId: number) {
    return (await this.repository.listAlternateTitles(gameId)).map(mapAlternateTitle);
  }

  addAlternateTitle(gameId: number, title: string, notes?: string | null) {
    return this.repository.addAlternateTitle(gameId, title, notes);
  }

  deleteAlternateTitle(gameId: number, alternateTitleId: number): Promise<boolean> {
    return this.repository.deleteAlternateTitle(gameId, alternateTitleId);
  }

  getPool(): pg.Pool {
    return this.pool;
  }

  getDatabase(): Kysely<Database> {
    return this.db;
  }

  private progressQuery() {
    return this.db
      .selectFrom("progress as p")
      .innerJoin("games as g", "g.game_id", "p.game_id")
      .select([
        "p.progress_id as progress_id",
        "p.game_id as game_id",
        "g.title as game_title",
        "g.image_url as image_url",
        sql<string>`to_char(p.date_started, 'YYYY-MM-DD')`.as("date_started"),
        sql<string | null>`to_char(p.date_finished, 'YYYY-MM-DD')`.as("date_finished"),
        sql<string | null>`p.completion_time::text`.as("completion_time"),
        "p.beaten_criteria as beaten_criteria",
        "p.review as review",
        "p.platform as platform"
      ]);
  }
}
