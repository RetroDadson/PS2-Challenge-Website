import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("sub_pick_settings")
    .addColumn("id", "integer", (col) => col.primaryKey().defaultTo(1))
    .addColumn("tier1_entries", "integer", (col) => col.notNull().defaultTo(1))
    .addColumn("tier2_entries", "integer", (col) => col.notNull().defaultTo(2))
    .addColumn("tier3_entries", "integer", (col) => col.notNull().defaultTo(5))
    .addColumn("spin_duration_seconds", "integer", (col) => col.notNull().defaultTo(10))
    .addColumn("overlay_message", "varchar(300)", (col) =>
      col.notNull().defaultTo("Sub to add a game to the wheel. Every 10th game is picked by subs.")
    )
    .addColumn("updated_by_user_id", "integer", (col) => col.references("users.id").onDelete("set null"))
    .addColumn("updated_at", "timestamp", (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addCheckConstraint("chk_sub_pick_settings_singleton", sql`id = 1`)
    .addCheckConstraint(
      "chk_sub_pick_settings_values",
      sql`tier1_entries >= 0 AND tier2_entries >= 0 AND tier3_entries >= 0 AND spin_duration_seconds BETWEEN 1 AND 120`
    )
    .execute();
  await db.insertInto("sub_pick_settings").values({ id: 1 }).execute();

  await db.schema
    .createTable("sub_entry_grants")
    .addColumn("grant_id", "integer", (col) => col.generatedByDefaultAsIdentity().notNull().primaryKey())
    .addColumn("twitch_user_id", "varchar(255)")
    .addColumn("twitch_login", "varchar(255)")
    .addColumn("twitch_display_name", "varchar(255)")
    .addColumn("tier", "varchar(10)", (col) => col.notNull())
    .addColumn("grant_type", "varchar(10)", (col) => col.notNull())
    .addColumn("gift_count", "integer", (col) => col.notNull().defaultTo(1))
    .addColumn("entry_count", "integer", (col) => col.notNull())
    .addColumn("source", "varchar(10)", (col) => col.notNull())
    .addColumn("notes", "varchar(500)")
    .addColumn("created_by_user_id", "integer", (col) => col.references("users.id").onDelete("set null"))
    .addColumn("created_at", "timestamp", (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn("updated_at", "timestamp", (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addCheckConstraint("chk_sub_entry_grants_tier", sql`tier IN ('prime', '1000', '2000', '3000')`)
    .addCheckConstraint("chk_sub_entry_grants_type", sql`grant_type IN ('new', 'resub', 'gift')`)
    .addCheckConstraint("chk_sub_entry_grants_source", sql`source IN ('eventsub', 'manual')`)
    .addCheckConstraint("chk_sub_entry_grants_counts", sql`gift_count >= 1 AND entry_count >= 0`)
    .execute();
  await db.schema.createIndex("idx_sub_entry_grants_twitch_user_id").on("sub_entry_grants").column("twitch_user_id").execute();

  await db.schema
    .createTable("sub_entries")
    .addColumn("entry_id", "integer", (col) => col.generatedByDefaultAsIdentity().notNull().primaryKey())
    .addColumn("grant_id", "integer", (col) => col.notNull().references("sub_entry_grants.grant_id").onDelete("cascade"))
    .addColumn("twitch_user_id", "varchar(255)")
    .addColumn("game_id", "integer", (col) => col.references("games.game_id").onDelete("set null"))
    .addColumn("status", "varchar(20)", (col) => col.notNull().defaultTo("undrawn"))
    .addColumn("played_game_number", "integer")
    .addColumn("picked_at", "timestamp")
    .addColumn("pick_updated_by_user_id", "integer", (col) => col.references("users.id").onDelete("set null"))
    .addColumn("created_at", "timestamp", (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn("updated_at", "timestamp", (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addCheckConstraint(
      "chk_sub_entries_status",
      sql`status IN ('undrawn', 'in_100s_pool', 'won', 'lost', 'removed_played', 'voided')`
    )
    .execute();
  await db.schema.createIndex("idx_sub_entries_twitch_user_id").on("sub_entries").column("twitch_user_id").execute();
  await db.schema.createIndex("idx_sub_entries_status_game").on("sub_entries").columns(["status", "game_id"]).execute();
  await db.schema.createIndex("idx_sub_entries_grant_id").on("sub_entries").column("grant_id").execute();

  await db.schema
    .createTable("sub_pick_audit")
    .addColumn("audit_id", "integer", (col) => col.generatedByDefaultAsIdentity().notNull().primaryKey())
    .addColumn("actor_user_id", "integer", (col) => col.references("users.id").onDelete("set null"))
    .addColumn("actor_username", "varchar(255)")
    .addColumn("action", "varchar(50)", (col) => col.notNull())
    .addColumn("target_type", "varchar(30)", (col) => col.notNull())
    .addColumn("target_id", "integer")
    .addColumn("details", "jsonb", (col) => col.notNull().defaultTo(sql`'{}'::jsonb`))
    .addColumn("created_at", "timestamp", (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .execute();
  await db.schema.createIndex("idx_sub_pick_audit_created_at").on("sub_pick_audit").column("created_at").execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP TABLE IF EXISTS sub_pick_audit, sub_entries, sub_entry_grants, sub_pick_settings CASCADE`.execute(db);
}
