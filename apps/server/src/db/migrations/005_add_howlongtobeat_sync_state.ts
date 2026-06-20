import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("game_howlongtobeat_sync_state")
    .addColumn("game_id", "integer", (col) => col.notNull().primaryKey().references("games.game_id").onDelete("cascade"))
    .addColumn("status", "varchar(20)", (col) => col.notNull().defaultTo("pending"))
    .addColumn("last_attempted_at", "timestamp")
    .addColumn("last_successful_at", "timestamp")
    .addColumn("next_attempt_at", "timestamp", (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn("failure_count", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("last_error", "text")
    .addCheckConstraint("chk_game_howlongtobeat_sync_status", sql`status IN ('pending', 'matched', 'not_found', 'error')`)
    .addCheckConstraint("chk_game_howlongtobeat_sync_failure_count", sql`failure_count >= 0`)
    .execute();

  await db.schema
    .createIndex("idx_game_howlongtobeat_sync_due")
    .on("game_howlongtobeat_sync_state")
    .columns(["next_attempt_at", "status"])
    .execute();

  await sql`
    INSERT INTO game_howlongtobeat_sync_state (game_id, status, next_attempt_at, failure_count)
    SELECT game_id, 'pending', CURRENT_TIMESTAMP, 0
    FROM games
    ON CONFLICT (game_id) DO NOTHING
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("game_howlongtobeat_sync_state").ifExists().execute();
}
