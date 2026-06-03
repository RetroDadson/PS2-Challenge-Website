import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("twitch_stream_vods")
    .addColumn("vod_id", "varchar(50)", (col) => col.notNull().primaryKey())
    .addColumn("channel_login", "varchar(255)", (col) => col.notNull())
    .addColumn("title", "varchar(500)")
    .addColumn("url", "varchar(500)")
    .addColumn("created_at", "timestamp", (col) => col.notNull())
    .addColumn("duration_seconds", "integer", (col) => col.notNull())
    .addColumn("fetched_at", "timestamp", (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .execute();

  await db.schema
    .createIndex("idx_twitch_stream_vods_channel_created_at")
    .ifNotExists()
    .on("twitch_stream_vods")
    .columns(["channel_login", "created_at"])
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("twitch_stream_vods").ifExists().execute();
}
