import type { SubDrawDueDto } from "@ps2-challenge/shared";
import { subDrawDueErrorCode } from "@ps2-challenge/shared";
import { sql, type Insertable, type Kysely, type Transaction } from "kysely";
import type { Database } from "../db/kysely.js";
import { drawKindFor, drawPoolQuery } from "./subDrawPool.js";
import type { SubPickActor } from "./subPickService.js";

const progressNumberLockKey = 1_651_000_001;

export type ProgressInsertOptions = { overrideSubDraw?: boolean; acceptingSubDraw?: boolean; actor?: SubPickActor | null };
export type InsertedProgress = { progressId: number; overriddenSubDraw: SubDrawDueDto | null };

export class SubDrawDueError extends Error {
  readonly statusCode = 409;
  readonly code = subDrawDueErrorCode;

  constructor(readonly draw: SubDrawDueDto) {
    super(
      `Game ${draw.gameNumber} is a sub pick game and ${draw.entryCount} ${draw.entryCount === 1 ? "entry is" : "entries are"} waiting for the ${draw.kind} draw. ` +
        "Run the draw, or start this game anyway."
    );
  }
}

export async function nextGameNumber(db: Kysely<Database>): Promise<number> {
  const row = await db.selectFrom("progress").select((eb) => eb.fn.max<number | null>("progress_id").as("max_id")).executeTakeFirst();
  return (row?.max_id ?? 0) + 1;
}

export async function subDrawDue(db: Kysely<Database>, gameNumber: number): Promise<SubDrawDueDto | null> {
  const kind = drawKindFor(gameNumber);
  if (!kind) return null;
  const row = await db
    .selectFrom(drawPoolQuery(db, kind).as("pool"))
    .select((eb) => eb.fn.countAll<string>().as("count"))
    .executeTakeFirstOrThrow();
  const entryCount = Number(row.count);
  return entryCount > 0 ? { gameNumber, kind, entryCount } : null;
}

export async function insertProgress(
  transaction: Transaction<Database>,
  values: Omit<Insertable<Database["progress"]>, "progress_id">,
  options: ProgressInsertOptions = {}
): Promise<InsertedProgress> {
  await sql`SELECT pg_advisory_xact_lock(${progressNumberLockKey})`.execute(transaction);
  const progressId = await nextGameNumber(transaction);
  const draw = options.acceptingSubDraw ? null : await subDrawDue(transaction, progressId);
  if (draw && !options.overrideSubDraw) {
    throw new SubDrawDueError(draw);
  }
  await sql`SELECT setval(pg_get_serial_sequence('progress', 'progress_id'), ${progressId}, false)`.execute(transaction);
  const inserted = await transaction.insertInto("progress").values(values).returning("progress_id").executeTakeFirstOrThrow();
  if (inserted.progress_id !== progressId) {
    throw new Error(`Expected game number ${progressId} but the database assigned ${inserted.progress_id}`);
  }
  if (draw) {
    await transaction
      .insertInto("sub_pick_audit")
      .values({
        actor_user_id: options.actor?.id ?? null,
        actor_username: options.actor?.username ?? "System",
        action: "draw.override",
        target_type: "game",
        target_id: values.game_id,
        details: { ...draw }
      })
      .execute();
  }
  return { progressId, overriddenSubDraw: draw };
}
