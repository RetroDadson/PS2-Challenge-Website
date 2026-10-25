import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("progress_death_counters")
    .addColumn("progress_id", "integer", (col) => col.primaryKey().references("progress.progress_id").onDelete("cascade"))
    .addColumn("deaths", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("death_label", "varchar(50)")
    .addColumn("updated_at", "timestamp", (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addCheckConstraint("chk_progress_death_counters_deaths", sql`deaths >= 0`)
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("progress_death_counters").ifExists().execute();
}
