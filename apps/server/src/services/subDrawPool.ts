import crypto from "node:crypto";
import type { SubDrawKind, SubEntryStatus } from "@ps2-challenge/shared";
import type { Kysely } from "kysely";
import type { Database } from "../db/kysely.js";
import { eligibleChallengeGamesQuery } from "./eligibleGames.js";

export type DrawSlice = {
  entry_id: number;
  game_id: number | null;
  game_title: string;
  twitch_user_id: string | null;
  twitch_display_name: string | null;
  entry_status: SubEntryStatus;
};

export function drawKindFor(gameNumber: number): SubDrawKind | null {
  if (gameNumber % 100 === 0) return "100s";
  return gameNumber % 10 === 0 ? "10s" : null;
}

export function drawPoolQuery(db: Kysely<Database>, kind: SubDrawKind) {
  const eligibleGameIds = eligibleChallengeGamesQuery(db).select("g.game_id");
  const playedGameIds = db.selectFrom("progress").select("progress.game_id");
  return db
    .selectFrom("sub_entries as e")
    .innerJoin("sub_entry_grants as gr", "gr.grant_id", "e.grant_id")
    .innerJoin("games as pick", "pick.game_id", "e.game_id")
    .select([
      "e.entry_id as entry_id",
      "e.game_id as game_id",
      "pick.title as game_title",
      "e.twitch_user_id as twitch_user_id",
      "gr.twitch_display_name as twitch_display_name",
      "e.status as entry_status"
    ])
    .where((eb) => {
      const tens = eb.and([eb("e.status", "=", "undrawn"), eb("e.game_id", "in", eligibleGameIds)]);
      if (kind === "10s") return tens;
      return eb.or([tens, eb.and([eb("e.status", "=", "in_100s_pool"), eb("e.game_id", "not in", playedGameIds)])]);
    });
}

export function drawPool(db: Kysely<Database>, kind: SubDrawKind): Promise<DrawSlice[]> {
  return drawPoolQuery(db, kind).orderBy("e.entry_id").execute();
}

export function openDrawEntryIds(db: Kysely<Database>) {
  return db
    .selectFrom("sub_draw_entries as de")
    .innerJoin("sub_draws as d", "d.draw_id", "de.draw_id")
    .select("de.entry_id")
    .where("d.status", "in", ["ready", "spun"]);
}

export function drawnEntryIds(db: Kysely<Database>) {
  return db.selectFrom("sub_draw_entries").select("sub_draw_entries.entry_id");
}

export function liveSliceOrder(stored: readonly number[], poolIds: readonly number[], seed: number): number[] {
  const pool = new Set(poolIds);
  const order = stored.filter((entryId) => pool.has(entryId));
  const placed = new Set(order);
  for (const entryId of [...poolIds].filter((id) => !placed.has(id)).sort((left, right) => left - right)) {
    order.splice(stablePosition(seed, entryId, order.length + 1), 0, entryId);
  }
  return order;
}

function stablePosition(seed: number, entryId: number, slots: number): number {
  return crypto.createHash("sha256").update(`${seed}:${entryId}`).digest().readUInt32BE(0) % slots;
}
