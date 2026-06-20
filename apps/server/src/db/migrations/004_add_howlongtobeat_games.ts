import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("game_howlongtobeat")
    .addColumn("game_id", "integer", (col) => col.notNull().primaryKey().references("games.game_id").onDelete("cascade"))
    .addColumn("howlongtobeat_id", "integer", (col) => col.notNull())
    .addColumn("main_story_seconds", "integer")
    .addColumn("main_extra_seconds", "integer")
    .addColumn("completionist_seconds", "integer")
    .addColumn("last_synced_at", "timestamp", (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .execute();

  await db.schema
    .createIndex("idx_game_howlongtobeat_howlongtobeat_id")
    .ifNotExists()
    .on("game_howlongtobeat")
    .column("howlongtobeat_id")
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("game_howlongtobeat").ifExists().execute();
}
