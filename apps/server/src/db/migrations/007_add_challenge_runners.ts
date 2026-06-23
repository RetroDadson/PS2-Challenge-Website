import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("challenge_runners")
    .addColumn("challenge_runner_id", "serial", (col) => col.primaryKey())
    .addColumn("name", "varchar(100)", (col) => col.notNull())
    .addColumn("description", "text", (col) => col.notNull())
    .addColumn("twitch_url", "varchar(500)")
    .addColumn("youtube_url", "varchar(500)")
    .addColumn("logo_url", "varchar(500)")
    .addColumn("created_at", "timestamp", (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn("updated_at", "timestamp", (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addCheckConstraint("chk_challenge_runners_channel", sql`twitch_url IS NOT NULL OR youtube_url IS NOT NULL`)
    .execute();

  await db.schema
    .createIndex("idx_challenge_runners_name")
    .ifNotExists()
    .on("challenge_runners")
    .column("name")
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("challenge_runners").ifExists().execute();
}
