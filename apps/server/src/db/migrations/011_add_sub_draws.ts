import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("sub_draws")
    .addColumn("draw_id", "integer", (col) => col.generatedByDefaultAsIdentity().notNull().primaryKey())
    .addColumn("kind", "varchar(4)", (col) => col.notNull())
    .addColumn("game_number", "integer", (col) => col.notNull())
    .addColumn("status", "varchar(20)", (col) => col.notNull().defaultTo("ready"))
    .addColumn("slice_order", "jsonb", (col) => col.notNull().defaultTo(sql`'[]'::jsonb`))
    .addColumn("shuffle_count", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("created_by_user_id", "integer", (col) => col.references("users.id").onDelete("set null"))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn("first_spun_at", "timestamptz")
    .addColumn("winning_entry_id", "integer", (col) => col.references("sub_entries.entry_id").onDelete("set null"))
    .addColumn("winning_game_id", "integer", (col) => col.references("games.game_id").onDelete("set null"))
    .addColumn("finished_by_user_id", "integer", (col) => col.references("users.id").onDelete("set null"))
    .addColumn("finished_at", "timestamptz")
    .addCheckConstraint("chk_sub_draws_kind", sql`kind IN ('10s', '100s')`)
    .addCheckConstraint("chk_sub_draws_status", sql`status IN ('ready', 'spun', 'accepted', 'cancelled')`)
    .execute();
  await sql`CREATE UNIQUE INDEX idx_sub_draws_one_open ON sub_draws ((true)) WHERE status IN ('ready', 'spun')`.execute(db);
  await sql`CREATE UNIQUE INDEX idx_sub_draws_game_number ON sub_draws (game_number) WHERE status <> 'cancelled'`.execute(db);

  await db.schema
    .createTable("sub_draw_entries")
    .addColumn("draw_id", "integer", (col) => col.notNull().references("sub_draws.draw_id").onDelete("cascade"))
    .addColumn("entry_id", "integer", (col) => col.notNull().references("sub_entries.entry_id"))
    .addColumn("game_id", "integer", (col) => col.references("games.game_id").onDelete("set null"))
    .addColumn("game_title", "varchar(255)", (col) => col.notNull())
    .addColumn("twitch_user_id", "varchar(255)")
    .addColumn("twitch_display_name", "varchar(255)")
    .addColumn("entry_status", "varchar(20)", (col) => col.notNull())
    .addColumn("outcome", "varchar(20)")
    .addColumn("played_game_number", "integer")
    .addPrimaryKeyConstraint("pk_sub_draw_entries", ["draw_id", "entry_id"])
    .addCheckConstraint("chk_sub_draw_entries_outcome", sql`outcome IS NULL OR outcome IN ('won', 'moved_to_100s', 'lost', 'removed_played')`)
    .execute();
  await db.schema.createIndex("idx_sub_draw_entries_entry").on("sub_draw_entries").column("entry_id").execute();

  await db.schema
    .createTable("sub_draw_spins")
    .addColumn("spin_id", "integer", (col) => col.generatedByDefaultAsIdentity().notNull().primaryKey())
    .addColumn("draw_id", "integer", (col) => col.notNull().references("sub_draws.draw_id").onDelete("cascade"))
    .addColumn("spin_number", "integer", (col) => col.notNull())
    .addColumn("started_at", "timestamptz", (col) => col.notNull())
    .addColumn("duration_ms", "integer", (col) => col.notNull())
    .addColumn("slice_order", "jsonb", (col) => col.notNull())
    .addColumn("odds", "jsonb", (col) => col.notNull())
    .addColumn("winning_entry_id", "integer", (col) => col.notNull().references("sub_entries.entry_id"))
    .addColumn("winning_slice_index", "integer", (col) => col.notNull())
    .addColumn("stop_offset", "real", (col) => col.notNull())
    .addColumn("decision", "varchar(20)", (col) => col.notNull().defaultTo("pending"))
    .addColumn("spun_by_user_id", "integer", (col) => col.references("users.id").onDelete("set null"))
    .addColumn("decided_by_user_id", "integer", (col) => col.references("users.id").onDelete("set null"))
    .addColumn("decided_at", "timestamptz")
    .addUniqueConstraint("uq_sub_draw_spins_number", ["draw_id", "spin_number"])
    .addCheckConstraint("chk_sub_draw_spins_decision", sql`decision IN ('pending', 'accepted', 'respun', 'cancelled')`)
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP TABLE IF EXISTS sub_draw_spins, sub_draw_entries, sub_draws CASCADE`.execute(db);
}
