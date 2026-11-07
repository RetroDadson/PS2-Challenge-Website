import {
  subDrawSchedule,
  subGrantEntryCount,
  type CreateSubGrantRequest,
  type EligibleGameDto,
  type MySubPicksDto,
  type SubEntryDto,
  type SubEntryPool,
  type SubGrantDto,
  type SubPickAuditDto,
  type SubPickSettingsDto,
  type SubPicksSummaryDto,
  type SubGrantType,
  type SubPoolDto,
  type SubTier,
  type UpdateSubGrantRequest,
  type UpdateSubPickSettingsRequest
} from "@ps2-challenge/shared";
import { sql, type Kysely, type Selectable, type Transaction } from "kysely";
import type { Database } from "../db/kysely.js";
import { eligibleChallengeGamesQuery } from "./eligibleGames.js";
import { nextGameNumber } from "./progressNumbers.js";
import { drawnEntryIds, openDrawEntryIds } from "./subDrawPool.js";

export type SubPickActor = { id: number; username: string };

export type EventSubGrantInput = {
  twitchUserId: string;
  twitchLogin: string;
  twitchDisplayName: string;
  tier: SubTier;
  grantType: SubGrantType;
  giftCount?: number;
  entryCount?: number;
  notes?: string | null;
};

export class SubPickError extends Error {
  constructor(message: string, readonly statusCode: number) {
    super(message);
    this.name = "SubPickError";
  }
}

type DbOrTransaction = Kysely<Database> | Transaction<Database>;
type SettingsRow = Selectable<Database["sub_pick_settings"]>;

type EntryRow = {
  entry_id: number;
  grant_id: number;
  twitch_user_id: string | null;
  twitch_display_name: string | null;
  game_id: number | null;
  game_title: string | null;
  image_url: string | null;
  status: SubEntryDto["status"];
  played_game_number: number | null;
  created_at: Date;
  game_eligible: boolean;
  game_progress_id: number | null;
  in_open_draw: boolean;
};

type PoolEntry = Pick<EntryRow, "game_id" | "game_title" | "image_url">;

export class SubPickService {
  constructor(private readonly db: Kysely<Database>) {}

  async getSettings(): Promise<SubPickSettingsDto> {
    return toSettingsDto(await this.settingsRow(this.db));
  }

  updateSettings(actor: SubPickActor, patch: UpdateSubPickSettingsRequest): Promise<SubPickSettingsDto> {
    return this.db.transaction().execute(async (transaction) => {
      const before = toSettingsDto(await this.settingsRow(transaction));
      const row = await transaction
        .updateTable("sub_pick_settings")
        .set({
          ...(patch.tier1Entries === undefined ? {} : { tier1_entries: patch.tier1Entries }),
          ...(patch.tier2Entries === undefined ? {} : { tier2_entries: patch.tier2Entries }),
          ...(patch.tier3Entries === undefined ? {} : { tier3_entries: patch.tier3Entries }),
          ...(patch.spinDurationSeconds === undefined ? {} : { spin_duration_seconds: patch.spinDurationSeconds }),
          ...(patch.overlayMessage === undefined ? {} : { overlay_message: patch.overlayMessage }),
          updated_by_user_id: actor.id,
          updated_at: new Date()
        })
        .where("id", "=", 1)
        .returningAll()
        .executeTakeFirstOrThrow();
      const after = toSettingsDto(row);
      await writeAudit(transaction, actor, "settings.update", "settings", 1, { before, after });
      return after;
    });
  }

  async listGrants(): Promise<SubGrantDto[]> {
    const grants = await this.db
      .selectFrom("sub_entry_grants as gr")
      .leftJoin("users as u", "u.id", "gr.created_by_user_id")
      .selectAll("gr")
      .select("u.twitch_username as created_by")
      .orderBy("gr.created_at", "desc")
      .orderBy("gr.grant_id", "desc")
      .execute();
    const entries = await this.entryQuery(this.db).orderBy("e.entry_id").execute();
    const entriesByGrant = new Map<number, EntryRow[]>();
    for (const entry of entries) {
      entriesByGrant.set(entry.grant_id, [...(entriesByGrant.get(entry.grant_id) ?? []), entry]);
    }
    return grants.map((grant) => ({
      id: grant.grant_id,
      twitchUserId: grant.twitch_user_id,
      twitchLogin: grant.twitch_login,
      twitchDisplayName: grant.twitch_display_name,
      tier: grant.tier,
      grantType: grant.grant_type,
      giftCount: grant.gift_count,
      entryCount: grant.entry_count,
      source: grant.source,
      notes: grant.notes,
      createdBy: grant.created_by,
      createdAt: grant.created_at.toISOString(),
      entries: (entriesByGrant.get(grant.grant_id) ?? []).map(toEntryDto)
    }));
  }

  async createGrant(actor: SubPickActor, input: CreateSubGrantRequest): Promise<SubGrantDto> {
    const grantId = await this.db.transaction().execute((transaction) => this.insertGrant(transaction, actor, input, "manual"));
    return this.getGrant(grantId);
  }

  createEventSubGrant(transaction: Transaction<Database>, input: EventSubGrantInput): Promise<number> {
    return this.insertGrant(transaction, null, input, "eventsub");
  }

  private async insertGrant(
    transaction: Transaction<Database>,
    actor: SubPickActor | null,
    input: CreateSubGrantRequest | EventSubGrantInput,
    source: "manual" | "eventsub"
  ): Promise<number> {
    const settings = toSettingsDto(await this.settingsRow(transaction));
    const giftCount = input.grantType === "gift" ? input.giftCount ?? 1 : 1;
    const entryCount = input.entryCount ?? subGrantEntryCount({ tier: input.tier, grantType: input.grantType, giftCount }, settings);
    const grant = await transaction
      .insertInto("sub_entry_grants")
      .values({
        twitch_user_id: input.twitchUserId,
        twitch_login: input.twitchLogin.toLocaleLowerCase("en-GB"),
        twitch_display_name: input.twitchDisplayName,
        tier: input.tier,
        grant_type: input.grantType,
        gift_count: giftCount,
        entry_count: entryCount,
        source,
        notes: input.notes?.trim() || null,
        created_by_user_id: actor?.id ?? null
      })
      .returning("grant_id")
      .executeTakeFirstOrThrow();
    await insertEntries(transaction, grant.grant_id, input.twitchUserId, entryCount);
    await writeAudit(transaction, actor, source === "manual" ? "grant.create" : "grant.eventsub", "grant", grant.grant_id, {
      twitchUserId: input.twitchUserId,
      twitchLogin: input.twitchLogin,
      tier: input.tier,
      grantType: input.grantType,
      giftCount,
      entryCount
    });
    return grant.grant_id;
  }

  async updateGrant(actor: SubPickActor, grantId: number, input: UpdateSubGrantRequest): Promise<SubGrantDto> {
    await this.db.transaction().execute(async (transaction) => {
      const grant = await transaction
        .selectFrom("sub_entry_grants")
        .selectAll()
        .where("grant_id", "=", grantId)
        .forUpdate()
        .executeTakeFirst();
      if (!grant) {
        throw new SubPickError("Grant not found", 404);
      }
      const entryCount = input.entryCount ?? grant.entry_count;
      if (entryCount > grant.entry_count) {
        await insertEntries(transaction, grantId, grant.twitch_user_id, entryCount - grant.entry_count);
      } else if (entryCount < grant.entry_count) {
        await removeUndrawnEntries(transaction, grantId, grant.entry_count - entryCount);
      }
      await transaction
        .updateTable("sub_entry_grants")
        .set({
          ...(input.tier === undefined ? {} : { tier: input.tier }),
          ...(input.grantType === undefined ? {} : { grant_type: input.grantType }),
          ...(input.giftCount === undefined ? {} : { gift_count: input.giftCount }),
          ...(input.notes === undefined ? {} : { notes: input.notes?.trim() || null }),
          entry_count: entryCount,
          updated_at: new Date()
        })
        .where("grant_id", "=", grantId)
        .execute();
      await writeAudit(transaction, actor, "grant.update", "grant", grantId, {
        before: { tier: grant.tier, grantType: grant.grant_type, giftCount: grant.gift_count, entryCount: grant.entry_count, notes: grant.notes },
        changes: input
      });
    });
    return this.getGrant(grantId);
  }

  deleteGrant(actor: SubPickActor, grantId: number): Promise<{ deleted: boolean; voidedEntries: number }> {
    return this.db.transaction().execute(async (transaction) => {
      const grant = await transaction
        .selectFrom("sub_entry_grants")
        .select(["grant_id", "twitch_login", "entry_count"])
        .where("grant_id", "=", grantId)
        .forUpdate()
        .executeTakeFirst();
      if (!grant) {
        throw new SubPickError("Grant not found", 404);
      }
      const entryIds = (await transaction.selectFrom("sub_entries").select("entry_id").where("grant_id", "=", grantId).execute()).map((row) => row.entry_id);
      await assertNotInOpenDraw(transaction, entryIds, "Some of these entries are in the draw that's running now, so they can't be removed until the draw finishes");
      const drawn = await transaction
        .selectFrom("sub_entries")
        .select((eb) => eb.fn.countAll<string>().as("count"))
        .where("grant_id", "=", grantId)
        .where((eb) => eb.or([eb("status", "!=", "undrawn"), eb("entry_id", "in", drawnEntryIds(transaction))]))
        .executeTakeFirstOrThrow();
      if (Number(drawn.count) === 0) {
        await transaction.deleteFrom("sub_entry_grants").where("grant_id", "=", grantId).execute();
        await writeAudit(transaction, actor, "grant.delete", "grant", grantId, { twitchLogin: grant.twitch_login, entryCount: grant.entry_count });
        return { deleted: true, voidedEntries: 0 };
      }
      const voided = await transaction
        .updateTable("sub_entries")
        .set({ status: "voided", updated_at: new Date() })
        .where("grant_id", "=", grantId)
        .where("status", "in", ["undrawn", "in_100s_pool"])
        .executeTakeFirst();
      const voidedEntries = Number(voided.numUpdatedRows);
      await writeAudit(transaction, actor, "grant.void", "grant", grantId, { twitchLogin: grant.twitch_login, voidedEntries });
      return { deleted: false, voidedEntries };
    });
  }

  async setPick(actor: SubPickActor, entryId: number, gameId: number | null, ownerTwitchUserId?: string): Promise<SubEntryDto> {
    await this.db.transaction().execute(async (transaction) => {
      const entry = await transaction
        .selectFrom("sub_entries")
        .select(["entry_id", "twitch_user_id", "game_id", "status"])
        .where("entry_id", "=", entryId)
        .forUpdate()
        .executeTakeFirst();
      if (!entry || (ownerTwitchUserId !== undefined && entry.twitch_user_id !== ownerTwitchUserId)) {
        throw new SubPickError("Entry not found", 404);
      }
      if (entry.status !== "undrawn") {
        throw new SubPickError("This entry has already been in a draw, so its pick is locked", 409);
      }
      await assertNotInOpenDraw(transaction, [entryId], "This entry is in the draw that's running now, so its pick is locked until the draw finishes");
      if (gameId !== null) {
        const eligible = await eligibleChallengeGamesQuery(transaction).select("g.game_id").where("g.game_id", "=", gameId).executeTakeFirst();
        if (!eligible) {
          throw new SubPickError("That game can't be picked. Games must be owned, in the challenge and not started.", 400);
        }
      }
      await transaction
        .updateTable("sub_entries")
        .set({ game_id: gameId, picked_at: gameId === null ? null : new Date(), pick_updated_by_user_id: actor.id, updated_at: new Date() })
        .where("entry_id", "=", entryId)
        .execute();
      await writeAudit(transaction, actor, ownerTwitchUserId === undefined ? "entry.pick.admin" : "entry.pick.viewer", "entry", entryId, {
        fromGameId: entry.game_id,
        toGameId: gameId
      });
    });
    return this.getEntry(entryId);
  }

  removeEntry(actor: SubPickActor, entryId: number): Promise<{ deleted: boolean }> {
    return this.db.transaction().execute(async (transaction) => {
      const entry = await transaction
        .selectFrom("sub_entries")
        .select(["entry_id", "grant_id", "status", "game_id", "twitch_user_id"])
        .where("entry_id", "=", entryId)
        .forUpdate()
        .executeTakeFirst();
      if (!entry) {
        throw new SubPickError("Entry not found", 404);
      }
      if (entry.status === "undrawn") {
        await assertNotInOpenDraw(transaction, [entryId], "This entry is in the draw that's running now, so it can't be removed until the draw finishes");
      }
      if (entry.status === "undrawn" && !(await everDrawn(transaction, [entryId]))) {
        await transaction.deleteFrom("sub_entries").where("entry_id", "=", entryId).execute();
        await transaction
          .updateTable("sub_entry_grants")
          .set((eb) => ({ entry_count: eb("entry_count", "-", 1), updated_at: new Date() }))
          .where("grant_id", "=", entry.grant_id)
          .execute();
        await writeAudit(transaction, actor, "entry.delete", "entry", entryId, { grantId: entry.grant_id, gameId: entry.game_id, twitchUserId: entry.twitch_user_id });
        return { deleted: true };
      }
      if (entry.status === "undrawn" || entry.status === "in_100s_pool") {
        await transaction.updateTable("sub_entries").set({ status: "voided", updated_at: new Date() }).where("entry_id", "=", entryId).execute();
        await writeAudit(transaction, actor, "entry.void", "entry", entryId, { grantId: entry.grant_id, gameId: entry.game_id, twitchUserId: entry.twitch_user_id });
        return { deleted: false };
      }
      throw new SubPickError("This entry has already finished its draws and can't be removed", 409);
    });
  }

  async myEntries(twitchUserId: string): Promise<MySubPicksDto> {
    const [entries, summary] = await Promise.all([
      this.entryQuery(this.db).where("e.twitch_user_id", "=", twitchUserId).orderBy("e.entry_id").execute(),
      this.summary()
    ]);
    const dtos = entries.map(toEntryDto);
    const inNextDraw = dtos.filter((entry) => entry.pool === "next_draw" || (summary.schedule.nextDrawKind === "100s" && entry.pool === "100s_pool"));
    return {
      entries: dtos,
      stats: {
        entriesEarned: dtos.filter((entry) => entry.status !== "voided").length,
        picksMade: dtos.filter((entry) => entry.gameId !== null && entry.status !== "voided").length,
        wins: dtos.filter((entry) => entry.status === "won").length,
        nextDrawOdds: summary.nextDrawPool.totalEntries > 0 ? inNextDraw.length / summary.nextDrawPool.totalEntries : 0
      }
    };
  }

  async eligibleGames(): Promise<EligibleGameDto[]> {
    const rows = await eligibleChallengeGamesQuery(this.db)
      .select(["g.game_id as id", "g.title as title", "g.image_url as image_url"])
      .orderBy("g.title")
      .execute();
    return rows.map((row) => ({ id: row.id, title: row.title, imageUrl: row.image_url }));
  }

  async summary(): Promise<SubPicksSummaryDto> {
    const [settings, gameNumber, activeEntries] = await Promise.all([
      this.getSettings(),
      nextGameNumber(this.db),
      this.entryQuery(this.db).where("e.status", "in", ["undrawn", "in_100s_pool"]).execute()
    ]);
    const schedule = subDrawSchedule(gameNumber);
    const tensEntries = activeEntries.filter((entry) => entryPool(entry) === "next_draw");
    const hundredsEntries = activeEntries.filter((entry) => entryPool(entry) === "100s_pool");
    return {
      schedule,
      nextDrawPool: buildPool(schedule.nextDrawKind === "100s" ? [...tensEntries, ...hundredsEntries] : tensEntries),
      tensPool: buildPool(tensEntries),
      hundredsPool: buildPool(hundredsEntries),
      overlayMessage: settings.overlayMessage,
      tierEntries: { tier1: settings.tier1Entries, tier2: settings.tier2Entries, tier3: settings.tier3Entries }
    };
  }

  async audit(limit = 200): Promise<SubPickAuditDto[]> {
    const rows = await this.db
      .selectFrom("sub_pick_audit")
      .selectAll()
      .orderBy("created_at", "desc")
      .orderBy("audit_id", "desc")
      .limit(limit)
      .execute();
    return rows.map((row) => ({
      id: row.audit_id,
      actor: row.actor_username,
      action: row.action,
      targetType: row.target_type,
      targetId: row.target_id,
      details: row.details,
      createdAt: row.created_at.toISOString()
    }));
  }

  private async getGrant(grantId: number): Promise<SubGrantDto> {
    const grant = (await this.listGrants()).find((candidate) => candidate.id === grantId);
    if (!grant) {
      throw new SubPickError("Grant not found", 404);
    }
    return grant;
  }

  private async getEntry(entryId: number): Promise<SubEntryDto> {
    const row = await this.entryQuery(this.db).where("e.entry_id", "=", entryId).executeTakeFirst();
    if (!row) {
      throw new SubPickError("Entry not found", 404);
    }
    return toEntryDto(row);
  }

  private settingsRow(db: DbOrTransaction): Promise<SettingsRow> {
    return db.selectFrom("sub_pick_settings").selectAll().where("id", "=", 1).executeTakeFirstOrThrow();
  }

  private entryQuery(db: DbOrTransaction) {
    return db
      .selectFrom("sub_entries as e")
      .innerJoin("sub_entry_grants as gr", "gr.grant_id", "e.grant_id")
      .leftJoin("games as g", "g.game_id", "e.game_id")
      .select([
        "e.entry_id as entry_id",
        "e.grant_id as grant_id",
        "e.twitch_user_id as twitch_user_id",
        "gr.twitch_display_name as twitch_display_name",
        "e.game_id as game_id",
        "g.title as game_title",
        "g.image_url as image_url",
        "e.status as status",
        "e.played_game_number as played_game_number",
        "e.created_at as created_at",
        sql<number | null>`(SELECT MIN(pr.progress_id) FROM progress pr WHERE pr.game_id = e.game_id)`.as("game_progress_id"),
        sql<boolean>`(
          e.game_id IS NOT NULL
          AND EXISTS (SELECT 1 FROM game_owned o WHERE o.game_id = e.game_id)
          AND NOT EXISTS (SELECT 1 FROM excluded_games x WHERE x.game_id = e.game_id)
          AND NOT EXISTS (SELECT 1 FROM progress pr WHERE pr.game_id = e.game_id)
        )`.as("game_eligible"),
        sql<boolean>`EXISTS (
          SELECT 1 FROM sub_draw_entries de
          INNER JOIN sub_draws d ON d.draw_id = de.draw_id
          WHERE de.entry_id = e.entry_id AND d.status IN ('ready', 'spun')
        )`.as("in_open_draw")
      ]);
  }
}

async function insertEntries(transaction: Transaction<Database>, grantId: number, twitchUserId: string | null, count: number): Promise<void> {
  if (count <= 0) {
    return;
  }
  await transaction
    .insertInto("sub_entries")
    .values(Array.from({ length: count }, () => ({ grant_id: grantId, twitch_user_id: twitchUserId })))
    .execute();
}

async function removeUndrawnEntries(transaction: Transaction<Database>, grantId: number, count: number): Promise<void> {
  const removable = await transaction
    .selectFrom("sub_entries")
    .select("entry_id")
    .where("grant_id", "=", grantId)
    .where("status", "=", "undrawn")
    .where("entry_id", "not in", drawnEntryIds(transaction))
    .orderBy(sql`game_id IS NULL`, "desc")
    .orderBy("entry_id", "desc")
    .limit(count)
    .execute();
  if (removable.length < count) {
    throw new SubPickError("Some of these entries have already been in a draw, so the entry count can't go that low", 409);
  }
  await transaction.deleteFrom("sub_entries").where("entry_id", "in", removable.map((row) => row.entry_id)).execute();
}

async function assertNotInOpenDraw(transaction: Transaction<Database>, entryIds: number[], message: string): Promise<void> {
  if (entryIds.length === 0) return;
  const locked = await openDrawEntryIds(transaction).where("de.entry_id", "in", entryIds).executeTakeFirst();
  if (locked) {
    throw new SubPickError(message, 409);
  }
}

async function everDrawn(transaction: Transaction<Database>, entryIds: number[]): Promise<boolean> {
  const drawn = await drawnEntryIds(transaction).where("sub_draw_entries.entry_id", "in", entryIds).executeTakeFirst();
  return drawn !== undefined;
}

async function writeAudit(
  transaction: Transaction<Database>,
  actor: SubPickActor | null,
  action: string,
  targetType: string,
  targetId: number | null,
  details: Record<string, unknown>
): Promise<void> {
  await transaction
    .insertInto("sub_pick_audit")
    .values({ actor_user_id: actor?.id ?? null, actor_username: actor?.username ?? "Twitch", action, target_type: targetType, target_id: targetId, details })
    .execute();
}

function toSettingsDto(row: SettingsRow): SubPickSettingsDto {
  return {
    tier1Entries: row.tier1_entries,
    tier2Entries: row.tier2_entries,
    tier3Entries: row.tier3_entries,
    spinDurationSeconds: row.spin_duration_seconds,
    overlayMessage: row.overlay_message
  };
}

export function entryPool(entry: Pick<EntryRow, "status" | "game_id" | "game_eligible" | "game_progress_id">): SubEntryPool {
  if (entry.status === "undrawn") {
    if (entry.game_id === null) return "awaiting_pick";
    return entry.game_eligible ? "next_draw" : "needs_new_pick";
  }
  if (entry.status === "in_100s_pool" && entry.game_progress_id === null) {
    return "100s_pool";
  }
  return "finished";
}

function toEntryDto(row: EntryRow): SubEntryDto {
  const pool = entryPool(row);
  return {
    id: row.entry_id,
    grantId: row.grant_id,
    twitchUserId: row.twitch_user_id,
    twitchDisplayName: row.twitch_display_name,
    gameId: row.game_id,
    gameTitle: row.game_title,
    status: row.status,
    pool,
    canChangePick: row.status === "undrawn" && !row.in_open_draw,
    playedGameNumber: row.played_game_number ?? (row.status === "in_100s_pool" ? row.game_progress_id : null),
    createdAt: row.created_at.toISOString()
  };
}

export function buildPool(entries: PoolEntry[]): SubPoolDto {
  const byGame = new Map<number, { gameTitle: string; imageUrl: string | null; entries: number }>();
  for (const entry of entries) {
    if (entry.game_id === null) continue;
    const current = byGame.get(entry.game_id) ?? { gameTitle: entry.game_title ?? "", imageUrl: entry.image_url, entries: 0 };
    current.entries++;
    byGame.set(entry.game_id, current);
  }
  const totalEntries = [...byGame.values()].reduce((sum, game) => sum + game.entries, 0);
  const games = [...byGame.entries()]
    .map(([gameId, game]) => ({ gameId, ...game, odds: totalEntries > 0 ? game.entries / totalEntries : 0 }))
    .sort((left, right) => right.entries - left.entries || left.gameTitle.localeCompare(right.gameTitle, "en-GB"));
  return { totalEntries, games };
}
