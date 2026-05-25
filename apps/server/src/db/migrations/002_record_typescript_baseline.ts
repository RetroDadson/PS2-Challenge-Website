import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("ts_migration_baseline")
    .ifNotExists()
    .addColumn("id", "integer", (col) => col.notNull().primaryKey())
    .addColumn("baseline_name", "varchar(100)", (col) => col.notNull())
    .addColumn("applied_at", "timestamp", (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .execute();

  await db
    .insertInto("ts_migration_baseline")
    .values({ id: 13, baseline_name: "csharp-v13-schema" })
    .onConflict((oc) => oc.column("id").doUpdateSet({ baseline_name: "csharp-v13-schema" }))
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("ts_migration_baseline").ifExists().execute();
}
