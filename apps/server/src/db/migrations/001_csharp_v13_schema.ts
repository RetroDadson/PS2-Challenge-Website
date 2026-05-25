import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.createTable("platform_types").addColumn("platform", "varchar(50)", (col) => col.notNull().primaryKey()).execute();
  await db.schema.createTable("ownership_types").addColumn("type_owned", "varchar(50)", (col) => col.notNull().primaryKey()).execute();

  await db
    .insertInto("platform_types")
    .values([{ platform: "Physical" }, { platform: "Emulated" }])
    .onConflict((oc) => oc.column("platform").doNothing())
    .execute();
  await db
    .insertInto("ownership_types")
    .values([{ type_owned: "Base" }, { type_owned: "Platinum" }])
    .onConflict((oc) => oc.column("type_owned").doNothing())
    .execute();

  await db.schema
    .createTable("games")
    .addColumn("game_id", "integer", (col) => col.generatedByDefaultAsIdentity().notNull().primaryKey())
    .addColumn("title", "varchar(150)", (col) => col.notNull())
    .addColumn("notes", "text")
    .addColumn("first_released", "date")
    .addColumn("region_first_released_in", "varchar(100)")
    .addColumn("released_in_eu_or_na", "boolean")
    .addColumn("developer", "varchar(100)")
    .addColumn("publisher", "varchar(100)")
    .addColumn("image_url", "varchar(500)")
    .execute();
  await db.schema.createIndex("idx_games_image_url").ifNotExists().on("games").column("image_url").execute();

  await db.schema
    .createTable("game_aliases")
    .addColumn("alias_id", "integer", (col) => col.generatedByDefaultAsIdentity().notNull().primaryKey())
    .addColumn("game_id", "integer", (col) => col.notNull().references("games.game_id").onDelete("cascade"))
    .addColumn("alias_name", "varchar(150)", (col) => col.notNull())
    .execute();

  await db.schema
    .createTable("game_owned")
    .addColumn("ownership_id", "integer", (col) => col.generatedByDefaultAsIdentity().notNull().primaryKey())
    .addColumn("game_id", "integer", (col) => col.notNull().references("games.game_id").onDelete("cascade"))
    .addColumn("own_physical_copy", "boolean")
    .addColumn("type_owned", "varchar(50)", (col) => col.references("ownership_types.type_owned"))
    .execute();

  await db.schema
    .createTable("progress")
    .addColumn("progress_id", "integer", (col) => col.generatedByDefaultAsIdentity().notNull().primaryKey())
    .addColumn("game_id", "integer", (col) => col.notNull().references("games.game_id").onDelete("cascade"))
    .addColumn("date_started", "date", (col) => col.notNull())
    .addColumn("date_finished", "date")
    .addColumn("completion_time", sql`interval`)
    .addColumn("beaten_criteria", "text")
    .addColumn("review", "text")
    .addColumn("platform", "varchar(50)", (col) => col.notNull().references("platform_types.platform"))
    .execute();

  await db.schema
    .createTable("excluded_games")
    .addColumn("exclusion_id", "integer", (col) => col.generatedByDefaultAsIdentity().notNull().primaryKey())
    .addColumn("game_id", "integer", (col) => col.notNull().references("games.game_id").onDelete("cascade"))
    .addColumn("reason", "text", (col) => col.notNull())
    .execute();

  await db.schema
    .createTable("roles")
    .addColumn("id", "integer", (col) => col.generatedByDefaultAsIdentity().notNull().primaryKey())
    .addColumn("name", "varchar(50)", (col) => col.notNull().unique())
    .addColumn("description", "varchar(200)")
    .execute();
  await db
    .insertInto("roles")
    .values([
      { name: "Admin", description: "Administrator with full permissions" },
      { name: "User", description: "Standard user with basic permissions" }
    ])
    .onConflict((oc) => oc.column("name").doNothing())
    .execute();

  await db.schema
    .createTable("users")
    .addColumn("id", "integer", (col) => col.generatedByDefaultAsIdentity().notNull().primaryKey())
    .addColumn("twitch_id", "varchar(255)", (col) => col.notNull().unique())
    .addColumn("twitch_username", "varchar(255)", (col) => col.notNull())
    .addColumn("profile_image_url", "varchar(500)")
    .addColumn("role_id", "integer", (col) => col.notNull().references("roles.id").onDelete("restrict"))
    .addColumn("created_at", "timestamp", (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn("last_login_at", "timestamp", (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn("api_key", "varchar(64)", (col) => col.notNull().unique())
    .execute();
  await db.schema.createIndex("idx_users_twitch_id").ifNotExists().unique().on("users").column("twitch_id").execute();
  await db.schema.createIndex("idx_users_api_key").ifNotExists().unique().on("users").column("api_key").execute();

  await db.schema
    .createTable("votes")
    .addColumn("vote_id", "integer", (col) => col.generatedByDefaultAsIdentity().notNull().primaryKey())
    .addColumn("vote_round", "integer", (col) => col.notNull())
    .addColumn("game_id", "integer", (col) => col.notNull().references("games.game_id").onDelete("cascade"))
    .addColumn("created_at", "timestamp", (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .execute();
  await db.schema.createIndex("idx_votes_round").ifNotExists().on("votes").column("vote_round").execute();

  await db.schema
    .createTable("vote_history")
    .addColumn("history_id", "integer", (col) => col.generatedByDefaultAsIdentity().notNull().primaryKey())
    .addColumn("game_id", "integer", (col) => col.notNull().references("games.game_id").onDelete("cascade"))
    .addColumn("vote_round", "integer", (col) => col.notNull())
    .addColumn("vote_count", "integer", (col) => col.notNull())
    .addColumn("position", "integer")
    .addColumn("notes", "text")
    .addCheckConstraint("chk_vote_history_position", sql`${sql.ref("position")} is null or ${sql.ref("position")} in (1, 2, 3)`)
    .execute();

  await db.schema
    .createTable("current_vote")
    .addColumn("vote_id", "integer", (col) => col.generatedByDefaultAsIdentity().notNull().primaryKey())
    .addColumn("game_id", "integer", (col) => col.notNull().references("games.game_id").onDelete("cascade"))
    .addColumn("vote_count", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("game_number", "integer", (col) => col.notNull())
    .addCheckConstraint("chk_current_vote_game_number", sql`${sql.ref("game_number")} in (1, 2, 3)`)
    .execute();
  await db.schema.createIndex("idx_current_vote_game_id_unique").ifNotExists().unique().on("current_vote").column("game_id").execute();
  await db.schema
    .createIndex("idx_current_vote_game_number_unique")
    .ifNotExists()
    .unique()
    .on("current_vote")
    .column("game_number")
    .execute();

  await db.schema
    .createTable("game_serial_numbers")
    .addColumn("serial_id", "integer", (col) => col.generatedByDefaultAsIdentity().notNull().primaryKey())
    .addColumn("game_id", "integer", (col) => col.notNull().references("games.game_id").onDelete("cascade"))
    .addColumn("serial_number", "varchar(50)", (col) => col.notNull().unique())
    .addColumn("region", "varchar(50)")
    .addColumn("notes", "varchar(500)")
    .execute();
  await db.schema.createIndex("idx_game_serial_numbers_game_id").ifNotExists().on("game_serial_numbers").column("game_id").execute();
  await db.schema
    .createIndex("idx_game_serial_numbers_serial_number_unique")
    .ifNotExists()
    .unique()
    .on("game_serial_numbers")
    .column("serial_number")
    .execute();

  await db.schema
    .createTable("alternate_titles")
    .addColumn("alternate_title_id", "integer", (col) => col.generatedByDefaultAsIdentity().notNull().primaryKey())
    .addColumn("game_id", "integer", (col) => col.notNull().references("games.game_id").onDelete("cascade"))
    .addColumn("title", "varchar(150)", (col) => col.notNull().unique())
    .addColumn("notes", "varchar(500)")
    .execute();
  await db.schema.createIndex("idx_alternate_titles_game_id").ifNotExists().on("alternate_titles").column("game_id").execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  for (const table of [
    "alternate_titles",
    "game_serial_numbers",
    "current_vote",
    "vote_history",
    "votes",
    "users",
    "roles",
    "excluded_games",
    "progress",
    "game_owned",
    "game_aliases",
    "games",
    "ownership_types",
    "platform_types"
  ]) {
    await db.schema.dropTable(table).ifExists().cascade().execute();
  }
}
