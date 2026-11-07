import crypto from "node:crypto";
import {
  parseDateOnly,
  type SubDrawDto,
  type SubDrawHistoryDto,
  type SubDrawHistoryEntryDto,
  type SubDrawOddsDto,
  type SubDrawOutcome,
  type SubDrawState,
  type SubDrawSpinDto,
  type SubSpinResultDto,
  type SubWheelDto,
  type SubWheelSliceDto
} from "@ps2-challenge/shared";
import { sql, type Kysely, type Selectable, type Transaction } from "kysely";
import type { Database } from "../db/kysely.js";
import { shuffle } from "../utils/shuffle.js";
import { insertProgress, nextGameNumber, subDrawDue } from "./progressNumbers.js";
import { drawPool, liveSliceOrder, type DrawSlice } from "./subDrawPool.js";
import type { SubPickActor } from "./subPickService.js";

type DrawRow = Selectable<Database["sub_draws"]>;
type SpinRow = Selectable<Database["sub_draw_spins"]>;

export type AcceptedSubDraw = { draw: SubDrawDto; gameTitle: string };

export class SubDrawError extends Error {
  constructor(message: string, readonly statusCode: number) {
    super(message);
    this.name = "SubDrawError";
  }
}

const minStopOffsetPercent = 10;
const maxStopOffsetPercent = 90;

export class SubDrawService {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly now: () => Date = () => new Date()
  ) {}

  async wheel(): Promise<SubWheelDto> {
    const [draw, settings, gameNumber] = await Promise.all([
      this.db.selectFrom("sub_draws").selectAll().where("status", "!=", "cancelled").orderBy("draw_id", "desc").executeTakeFirst(),
      this.db.selectFrom("sub_pick_settings").select("spin_duration_seconds").where("id", "=", 1).executeTakeFirstOrThrow(),
      nextGameNumber(this.db)
    ]);
    const isOpen = draw?.status === "ready" || draw?.status === "spun";
    return {
      draw: draw ? await this.view(this.db, draw) : null,
      due: isOpen ? null : await subDrawDue(this.db, gameNumber),
      spinDurationSeconds: settings.spin_duration_seconds,
      serverNow: this.now().toISOString()
    };
  }

  async current(): Promise<SubDrawDto | null> {
    const draw = await this.db.selectFrom("sub_draws").selectAll().where("status", "in", ["ready", "spun"]).executeTakeFirst();
    return draw ? this.view(this.db, draw) : null;
  }

  open(actor: SubPickActor): Promise<SubDrawDto> {
    return this.db.transaction().execute(async (transaction) => {
      await sql`SELECT pg_advisory_xact_lock(${drawLockKey})`.execute(transaction);
      const existing = await transaction.selectFrom("sub_draws").select("game_number").where("status", "in", ["ready", "spun"]).executeTakeFirst();
      if (existing) {
        throw new SubDrawError(`The draw for game ${existing.game_number} is already open`, 409);
      }
      const gameNumber = await nextGameNumber(transaction);
      const due = await subDrawDue(transaction, gameNumber);
      if (!due) {
        throw new SubDrawError(`No draw is due: game ${gameNumber} isn't a sub pick game, or nobody has a valid pick for it`, 409);
      }
      const pool = await drawPool(transaction, due.kind);
      const draw = await transaction
        .insertInto("sub_draws")
        .values({
          kind: due.kind,
          game_number: gameNumber,
          slice_order: jsonArray(shuffle(pool.map((slice) => slice.entry_id))),
          created_by_user_id: actor.id
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      await writeAudit(transaction, actor, "draw.open", draw.draw_id, { kind: due.kind, gameNumber, entryCount: pool.length });
      return this.view(transaction, draw);
    });
  }

  shuffle(actor: SubPickActor, drawId: number): Promise<SubDrawDto> {
    return this.db.transaction().execute(async (transaction) => {
      const draw = await this.lockDraw(transaction, drawId);
      if (draw.status !== "ready") {
        throw new SubDrawError(draw.status === "spun" ? "Accept or respin the result before shuffling" : "This draw has finished", 409);
      }
      const slices = await this.slices(transaction, draw);
      const sliceOrder = shuffle(slices.map((slice) => slice.entry_id));
      const updated = await transaction
        .updateTable("sub_draws")
        .set((eb) => ({ slice_order: jsonArray(sliceOrder), shuffle_count: eb("shuffle_count", "+", 1) }))
        .where("draw_id", "=", drawId)
        .returningAll()
        .executeTakeFirstOrThrow();
      await writeAudit(transaction, actor, "draw.shuffle", drawId, { shuffleCount: updated.shuffle_count, sliceCount: sliceOrder.length });
      return this.view(transaction, updated);
    });
  }

  spin(actor: SubPickActor, drawId: number): Promise<SubDrawDto> {
    return this.db.transaction().execute(async (transaction) => {
      const claimed = await transaction
        .updateTable("sub_draws")
        .set({ status: "spun" })
        .where("draw_id", "=", drawId)
        .where("status", "=", "ready")
        .returningAll()
        .executeTakeFirst();
      if (!claimed) {
        const draw = await this.findDraw(transaction, drawId);
        throw new SubDrawError(draw.status === "spun" ? "The wheel has already been spun" : "This draw has finished", 409);
      }
      const slices = await this.slices(transaction, claimed);
      if (slices.length === 0) {
        throw new SubDrawError("Nobody has a valid pick in this draw any more. Cancel it instead.", 409);
      }
      const startedAt = this.now();
      if (!claimed.first_spun_at) {
        await transaction
          .insertInto("sub_draw_entries")
          .values(slices.map((slice) => ({ draw_id: drawId, ...slice })))
          .execute();
      }
      const previous = await transaction
        .selectFrom("sub_draw_spins")
        .select((eb) => eb.fn.max<number | null>("spin_number").as("spin_number"))
        .where("draw_id", "=", drawId)
        .executeTakeFirst();
      const settings = await transaction.selectFrom("sub_pick_settings").select("spin_duration_seconds").where("id", "=", 1).executeTakeFirstOrThrow();
      const sliceOrder = slices.map((slice) => slice.entry_id);
      const winningSliceIndex = crypto.randomInt(slices.length);
      const spinNumber = (previous?.spin_number ?? 0) + 1;
      await transaction
        .insertInto("sub_draw_spins")
        .values({
          draw_id: drawId,
          spin_number: spinNumber,
          started_at: startedAt,
          duration_ms: settings.spin_duration_seconds * 1000,
          slice_order: jsonArray(sliceOrder),
          odds: jsonArray(oddsFor(slices)),
          winning_entry_id: sliceOrder[winningSliceIndex]!,
          winning_slice_index: winningSliceIndex,
          stop_offset: crypto.randomInt(minStopOffsetPercent, maxStopOffsetPercent + 1) / 100,
          spun_by_user_id: actor.id
        })
        .execute();
      const updated = await transaction
        .updateTable("sub_draws")
        .set({ slice_order: jsonArray(sliceOrder), first_spun_at: claimed.first_spun_at ?? startedAt })
        .where("draw_id", "=", drawId)
        .returningAll()
        .executeTakeFirstOrThrow();
      await writeAudit(transaction, actor, "draw.spin", drawId, { spinNumber, sliceCount: slices.length });
      return this.view(transaction, updated);
    });
  }

  respin(actor: SubPickActor, drawId: number): Promise<SubDrawDto> {
    return this.db.transaction().execute(async (transaction) => {
      const { draw, spin } = await this.lockDecision(transaction, drawId);
      const result = await this.spinResult(transaction, spin);
      await this.decide(transaction, actor, spin, "respun");
      const updated = await transaction
        .updateTable("sub_draws")
        .set({ status: "ready" })
        .where("draw_id", "=", draw.draw_id)
        .returningAll()
        .executeTakeFirstOrThrow();
      await writeAudit(transaction, actor, "draw.respin", drawId, { spinNumber: spin.spin_number, rejected: result });
      return this.view(transaction, updated);
    });
  }

  accept(actor: SubPickActor, drawId: number): Promise<AcceptedSubDraw> {
    return this.db.transaction().execute(async (transaction) => {
      const { draw, spin } = await this.lockDecision(transaction, drawId);
      const result = await this.spinResult(transaction, spin);
      if (result.gameId === null) {
        throw new SubDrawError("The winning game no longer exists. Respin or cancel the draw.", 409);
      }
      const started = await transaction.selectFrom("progress").select("progress_id").where("game_id", "=", result.gameId).executeTakeFirst();
      if (started) {
        throw new SubDrawError(`${result.gameTitle} has already been started as game ${started.progress_id}. Respin or cancel the draw.`, 409);
      }
      const owned = await transaction.selectFrom("game_owned").select("own_physical_copy").where("game_id", "=", result.gameId).executeTakeFirst();
      const inserted = await insertProgress(
        transaction,
        { game_id: result.gameId, date_started: parseDateOnly(this.now()), platform: owned?.own_physical_copy === false ? "Emulated" : "Physical" },
        { actor, acceptingSubDraw: true }
      );
      if (inserted.progressId !== draw.game_number) {
        throw new SubDrawError(
          `Game ${draw.game_number} has already been started without this draw, so the result can't be accepted. Cancel the draw instead.`,
          409
        );
      }
      await this.applyOutcomes(transaction, draw, result.entryId, result.gameId);
      await this.decide(transaction, actor, spin, "accepted");
      const updated = await transaction
        .updateTable("sub_draws")
        .set({ status: "accepted", winning_entry_id: result.entryId, winning_game_id: result.gameId, finished_by_user_id: actor.id, finished_at: this.now() })
        .where("draw_id", "=", drawId)
        .returningAll()
        .executeTakeFirstOrThrow();
      await writeAudit(transaction, actor, "draw.accept", drawId, { gameNumber: draw.game_number, spinNumber: spin.spin_number, winner: result });
      return { draw: await this.view(transaction, updated), gameTitle: result.gameTitle };
    });
  }

  cancel(actor: SubPickActor, drawId: number): Promise<SubDrawDto> {
    return this.db.transaction().execute(async (transaction) => {
      const draw = await this.lockDraw(transaction, drawId);
      if (draw.status !== "ready" && draw.status !== "spun") {
        throw new SubDrawError("This draw has already finished", 409);
      }
      if (draw.status === "spun") {
        const { spin } = await this.lockDecision(transaction, drawId);
        await this.decide(transaction, actor, spin, "cancelled");
      }
      const updated = await transaction
        .updateTable("sub_draws")
        .set({ status: "cancelled", finished_by_user_id: actor.id, finished_at: this.now() })
        .where("draw_id", "=", drawId)
        .returningAll()
        .executeTakeFirstOrThrow();
      await writeAudit(transaction, actor, "draw.cancel", drawId, { gameNumber: draw.game_number });
      return this.view(transaction, updated);
    });
  }

  async history(limit = 100): Promise<SubDrawHistoryDto[]> {
    const draws = await this.db
      .selectFrom("sub_draws")
      .selectAll()
      .where("status", "in", ["accepted", "cancelled"])
      .orderBy("game_number", "desc")
      .orderBy("draw_id", "desc")
      .limit(limit)
      .execute();
    if (draws.length === 0) return [];
    const drawIds = draws.map((draw) => draw.draw_id);
    const [entries, spins] = await Promise.all([
      this.db
        .selectFrom("sub_draw_entries as de")
        .innerJoin("sub_entries as e", "e.entry_id", "de.entry_id")
        .select([
          "de.draw_id as draw_id",
          "de.entry_id as entry_id",
          "de.game_id as game_id",
          "de.game_title as game_title",
          "de.twitch_display_name as twitch_display_name",
          "de.outcome as outcome",
          "de.played_game_number as played_game_number",
          "e.status as current_status",
          "e.played_game_number as current_played_game_number"
        ])
        .where("de.draw_id", "in", drawIds)
        .orderBy("de.game_title")
        .orderBy("de.entry_id")
        .execute(),
      this.db.selectFrom("sub_draw_spins").selectAll().where("draw_id", "in", drawIds).orderBy("spin_number").execute()
    ]);
    return draws.map((draw) => {
      const drawEntries = entries.filter((entry) => entry.draw_id === draw.draw_id);
      const drawSpins = spins.filter((spin) => spin.draw_id === draw.draw_id);
      const byId = new Map(drawEntries.map((entry) => [entry.entry_id, entry]));
      const results = drawSpins.map((spin) => ({ spin, result: historyResult(spin, byId.get(spin.winning_entry_id)) }));
      return {
        id: draw.draw_id,
        kind: draw.kind,
        gameNumber: draw.game_number,
        status: draw.status === "accepted" ? "accepted" : "cancelled",
        createdAt: draw.created_at.toISOString(),
        finishedAt: draw.finished_at?.toISOString() ?? null,
        winner: results.find(({ spin }) => spin.decision === "accepted")?.result ?? null,
        odds: drawSpins[0]?.odds ?? [],
        entries: drawEntries.map(toHistoryEntry),
        spins: results.map(({ spin, result }) => ({ spinNumber: spin.spin_number, startedAt: spin.started_at.toISOString(), decision: spin.decision, result }))
      };
    });
  }

  async revealDelayMs(drawId: number): Promise<number | null> {
    const spin = await this.latestSpin(this.db, drawId);
    if (spin?.decision !== "pending") return null;
    return Math.max(0, revealTime(spin) - this.now().getTime());
  }

  private async applyOutcomes(transaction: Transaction<Database>, draw: DrawRow, winningEntryId: number, winningGameId: number): Promise<void> {
    const snapshot = await transaction.selectFrom("sub_draw_entries").select(["entry_id", "game_id"]).where("draw_id", "=", draw.draw_id).execute();
    const groups = new Map<SubDrawOutcome, number[]>();
    for (const entry of snapshot) {
      const outcome = outcomeFor(draw.kind, entry, winningEntryId, winningGameId);
      groups.set(outcome, [...(groups.get(outcome) ?? []), entry.entry_id]);
    }
    const entryStatus = { won: "won", removed_played: "removed_played", moved_to_100s: "in_100s_pool", lost: "lost" } as const;
    await Promise.all(
      [...groups].map(([outcome, entryIds]) => {
        const playedGameNumber = outcome === "won" || outcome === "removed_played" ? draw.game_number : null;
        return Promise.all([
          transaction
            .updateTable("sub_entries")
            .set({ status: entryStatus[outcome], played_game_number: playedGameNumber, updated_at: this.now() })
            .where("entry_id", "in", entryIds)
            .execute(),
          transaction
            .updateTable("sub_draw_entries")
            .set({ outcome, played_game_number: playedGameNumber })
            .where("draw_id", "=", draw.draw_id)
            .where("entry_id", "in", entryIds)
            .execute()
        ]);
      })
    );
    await transaction
      .updateTable("sub_entries")
      .set({ status: "removed_played", played_game_number: draw.game_number, updated_at: this.now() })
      .where("status", "=", "in_100s_pool")
      .where("game_id", "=", winningGameId)
      .execute();
    if (draw.kind === "100s") {
      await transaction
        .updateTable("sub_entries as e")
        .set({
          status: sql`CASE WHEN EXISTS (SELECT 1 FROM progress p WHERE p.game_id = e.game_id) THEN 'removed_played' ELSE 'lost' END`,
          played_game_number: sql`(SELECT MIN(p.progress_id) FROM progress p WHERE p.game_id = e.game_id)`,
          updated_at: this.now()
        })
        .where("e.status", "=", "in_100s_pool")
        .execute();
    }
  }

  private async decide(transaction: Transaction<Database>, actor: SubPickActor, spin: SpinRow, decision: "accepted" | "respun" | "cancelled"): Promise<void> {
    await transaction
      .updateTable("sub_draw_spins")
      .set({ decision, decided_by_user_id: actor.id, decided_at: this.now() })
      .where("spin_id", "=", spin.spin_id)
      .execute();
  }

  private async lockDecision(transaction: Transaction<Database>, drawId: number): Promise<{ draw: DrawRow; spin: SpinRow }> {
    const draw = await this.lockDraw(transaction, drawId);
    if (draw.status !== "spun") {
      throw new SubDrawError(draw.status === "ready" ? "Spin the wheel first" : "This draw has already finished", 409);
    }
    const spin = await this.latestSpin(transaction, drawId);
    if (spin?.decision !== "pending") {
      throw new SubDrawError("There's no spin waiting for a decision", 409);
    }
    if (this.now().getTime() < revealTime(spin)) {
      throw new SubDrawError("Wait for the wheel to stop", 409);
    }
    return { draw, spin };
  }

  private async lockDraw(transaction: Transaction<Database>, drawId: number): Promise<DrawRow> {
    const draw = await transaction.selectFrom("sub_draws").selectAll().where("draw_id", "=", drawId).forUpdate().executeTakeFirst();
    if (!draw) {
      throw new SubDrawError("Draw not found", 404);
    }
    return draw;
  }

  private async findDraw(db: Kysely<Database>, drawId: number): Promise<DrawRow> {
    const draw = await db.selectFrom("sub_draws").selectAll().where("draw_id", "=", drawId).executeTakeFirst();
    if (!draw) {
      throw new SubDrawError("Draw not found", 404);
    }
    return draw;
  }

  private latestSpin(db: Kysely<Database>, drawId: number): Promise<SpinRow | undefined> {
    return db.selectFrom("sub_draw_spins").selectAll().where("draw_id", "=", drawId).orderBy("spin_number", "desc").limit(1).executeTakeFirst();
  }

  private async slices(db: Kysely<Database>, draw: DrawRow): Promise<DrawSlice[]> {
    if (draw.first_spun_at) {
      const snapshot = await db
        .selectFrom("sub_draw_entries")
        .select(["entry_id", "game_id", "game_title", "twitch_user_id", "twitch_display_name", "entry_status"])
        .where("draw_id", "=", draw.draw_id)
        .execute();
      return orderSlices(snapshot, draw.slice_order);
    }
    if (draw.status !== "ready" && draw.status !== "spun") {
      return [];
    }
    const pool = await drawPool(db, draw.kind);
    return orderSlices(pool, liveSliceOrder(draw.slice_order, pool.map((slice) => slice.entry_id), draw.draw_id));
  }

  private async spinResult(db: Kysely<Database>, spin: SpinRow): Promise<SubSpinResultDto> {
    const entry = await db
      .selectFrom("sub_draw_entries")
      .select(["entry_id", "game_id", "game_title", "twitch_display_name"])
      .where("draw_id", "=", spin.draw_id)
      .where("entry_id", "=", spin.winning_entry_id)
      .executeTakeFirstOrThrow();
    const odds = spin.odds.find((game) => game.gameId === entry.game_id);
    return {
      entryId: entry.entry_id,
      gameId: entry.game_id,
      gameTitle: entry.game_title,
      twitchDisplayName: entry.twitch_display_name,
      entries: odds?.entries ?? 1,
      odds: odds?.odds ?? 0
    };
  }

  private async view(db: Kysely<Database>, draw: DrawRow): Promise<SubDrawDto> {
    const [slices, spins] = await Promise.all([
      this.slices(db, draw),
      db.selectFrom("sub_draw_spins").selectAll().where("draw_id", "=", draw.draw_id).orderBy("spin_number").execute()
    ]);
    const latest = spins.at(-1);
    const revealed = latest !== undefined && this.now().getTime() >= revealTime(latest);
    const latestResult = latest && revealed ? await this.spinResult(db, latest) : null;
    const accepted = spins.find((spin) => spin.decision === "accepted");
    return {
      id: draw.draw_id,
      kind: draw.kind,
      gameNumber: draw.game_number,
      state: drawState(draw, revealed),
      locked: draw.first_spun_at !== null,
      slices: slices.map(toSliceDto),
      odds: oddsFor(slices),
      shuffleCount: draw.shuffle_count,
      spinCount: spins.length,
      spin: latest ? toSpinDto(latest, latestResult) : null,
      winner: accepted ? await this.spinResult(db, accepted) : null,
      createdAt: draw.created_at.toISOString(),
      finishedAt: draw.finished_at?.toISOString() ?? null
    };
  }
}

const drawLockKey = 1_651_000_002;

function outcomeFor(kind: DrawRow["kind"], entry: { entry_id: number; game_id: number | null }, winningEntryId: number, winningGameId: number): SubDrawOutcome {
  if (entry.entry_id === winningEntryId) return "won";
  if (entry.game_id === winningGameId) return "removed_played";
  return kind === "10s" ? "moved_to_100s" : "lost";
}

function drawState(draw: DrawRow, revealed: boolean): SubDrawState {
  if (draw.status === "spun") return revealed ? "awaiting_decision" : "spinning";
  return draw.status;
}

function revealTime(spin: Pick<SpinRow, "started_at" | "duration_ms">): number {
  return spin.started_at.getTime() + spin.duration_ms;
}

function orderSlices(slices: DrawSlice[], order: readonly number[]): DrawSlice[] {
  const byId = new Map(slices.map((slice) => [slice.entry_id, slice]));
  return order.flatMap((entryId) => byId.get(entryId) ?? []);
}

export function oddsFor(slices: readonly Pick<DrawSlice, "game_id" | "game_title">[]): SubDrawOddsDto[] {
  const games = new Map<string, SubDrawOddsDto>();
  for (const slice of slices) {
    const key = String(slice.game_id);
    const game = games.get(key) ?? { gameId: slice.game_id, gameTitle: slice.game_title, entries: 0, odds: 0 };
    game.entries++;
    games.set(key, game);
  }
  return [...games.values()]
    .map((game) => ({ ...game, odds: game.entries / slices.length }))
    .sort((left, right) => right.entries - left.entries || left.gameTitle.localeCompare(right.gameTitle, "en-GB"));
}

function jsonArray<T>(values: T[]) {
  return sql<T[]>`${JSON.stringify(values)}::jsonb`;
}

type HistoryEntryRow = {
  entry_id: number;
  game_id: number | null;
  game_title: string;
  twitch_display_name: string | null;
  outcome: SubDrawOutcome | null;
  played_game_number: number | null;
  current_status: SubDrawHistoryEntryDto["currentStatus"];
  current_played_game_number: number | null;
};

function historyResult(spin: SpinRow, entry: HistoryEntryRow | undefined): SubSpinResultDto {
  const odds = spin.odds.find((game) => game.gameId === entry?.game_id);
  return {
    entryId: spin.winning_entry_id,
    gameId: entry?.game_id ?? null,
    gameTitle: entry?.game_title ?? "Unknown game",
    twitchDisplayName: entry?.twitch_display_name ?? null,
    entries: odds?.entries ?? 1,
    odds: odds?.odds ?? 0
  };
}

function toHistoryEntry(entry: HistoryEntryRow): SubDrawHistoryEntryDto {
  return {
    entryId: entry.entry_id,
    gameId: entry.game_id,
    gameTitle: entry.game_title,
    twitchDisplayName: entry.twitch_display_name,
    outcome: entry.outcome,
    playedGameNumber: entry.played_game_number,
    currentStatus: entry.current_status,
    currentPlayedGameNumber: entry.current_played_game_number
  };
}

function toSliceDto(slice: DrawSlice): SubWheelSliceDto {
  return { entryId: slice.entry_id, gameId: slice.game_id, gameTitle: slice.game_title, twitchDisplayName: slice.twitch_display_name };
}

function toSpinDto(spin: SpinRow, result: SubSpinResultDto | null): SubDrawSpinDto {
  return {
    spinNumber: spin.spin_number,
    startedAt: spin.started_at.toISOString(),
    durationMs: spin.duration_ms,
    revealAt: new Date(revealTime(spin)).toISOString(),
    sliceCount: spin.slice_order.length,
    winningSliceIndex: spin.winning_slice_index,
    stopOffset: spin.stop_offset,
    decision: spin.decision,
    result
  };
}

async function writeAudit(transaction: Transaction<Database>, actor: SubPickActor, action: string, drawId: number, details: Record<string, unknown>): Promise<void> {
  await transaction
    .insertInto("sub_pick_audit")
    .values({ actor_user_id: actor.id, actor_username: actor.username, action, target_type: "draw", target_id: drawId, details })
    .execute();
}
