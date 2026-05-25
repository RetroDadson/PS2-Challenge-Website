import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Kysely } from "kysely";
import { FileMigrationProvider, Migrator } from "kysely/migration";
import { loadConfig } from "../config.js";
import { createKyselyDatabase } from "./kysely.js";
import { up as recordTypeScriptBaseline } from "./migrations/002_record_typescript_baseline.js";
import { publicColumns, publicConstraintNames, publicIndexNames, publicTableNames } from "./schemaInspector.js";

type ExpectedColumn = {
  table: string;
  column: string;
  dataType: string;
  nullable: boolean;
  maxLength?: number;
};

const baselineMigrationNames = ["001_csharp_v13_schema", "002_record_typescript_baseline"] as const;

const expectedTables = [
  "platform_types",
  "ownership_types",
  "games",
  "game_aliases",
  "game_owned",
  "progress",
  "excluded_games",
  "current_vote",
  "vote_history",
  "roles",
  "users",
  "game_serial_numbers",
  "alternate_titles"
];

const expectedColumns: ExpectedColumn[] = [
  { table: "platform_types", column: "platform", dataType: "character varying", nullable: false, maxLength: 50 },
  { table: "ownership_types", column: "type_owned", dataType: "character varying", nullable: false, maxLength: 50 },
  { table: "games", column: "game_id", dataType: "integer", nullable: false },
  { table: "games", column: "title", dataType: "character varying", nullable: false, maxLength: 150 },
  { table: "games", column: "notes", dataType: "text", nullable: true },
  { table: "games", column: "first_released", dataType: "date", nullable: true },
  { table: "games", column: "region_first_released_in", dataType: "character varying", nullable: true, maxLength: 100 },
  { table: "games", column: "released_in_eu_or_na", dataType: "boolean", nullable: true },
  { table: "games", column: "developer", dataType: "character varying", nullable: true, maxLength: 100 },
  { table: "games", column: "publisher", dataType: "character varying", nullable: true, maxLength: 100 },
  { table: "games", column: "image_url", dataType: "character varying", nullable: true, maxLength: 500 },
  { table: "game_aliases", column: "alias_id", dataType: "integer", nullable: false },
  { table: "game_aliases", column: "game_id", dataType: "integer", nullable: false },
  { table: "game_aliases", column: "alias_name", dataType: "character varying", nullable: false, maxLength: 150 },
  { table: "game_owned", column: "ownership_id", dataType: "integer", nullable: false },
  { table: "game_owned", column: "game_id", dataType: "integer", nullable: false },
  { table: "game_owned", column: "own_physical_copy", dataType: "boolean", nullable: true },
  { table: "game_owned", column: "type_owned", dataType: "character varying", nullable: true, maxLength: 50 },
  { table: "progress", column: "progress_id", dataType: "integer", nullable: false },
  { table: "progress", column: "game_id", dataType: "integer", nullable: false },
  { table: "progress", column: "date_started", dataType: "date", nullable: false },
  { table: "progress", column: "date_finished", dataType: "date", nullable: true },
  { table: "progress", column: "completion_time", dataType: "interval", nullable: true },
  { table: "progress", column: "beaten_criteria", dataType: "text", nullable: true },
  { table: "progress", column: "review", dataType: "text", nullable: true },
  { table: "progress", column: "platform", dataType: "character varying", nullable: false, maxLength: 50 },
  { table: "excluded_games", column: "exclusion_id", dataType: "integer", nullable: false },
  { table: "excluded_games", column: "game_id", dataType: "integer", nullable: false },
  { table: "excluded_games", column: "reason", dataType: "text", nullable: false },
  { table: "current_vote", column: "vote_id", dataType: "integer", nullable: false },
  { table: "current_vote", column: "game_id", dataType: "integer", nullable: false },
  { table: "current_vote", column: "vote_count", dataType: "integer", nullable: false },
  { table: "current_vote", column: "game_number", dataType: "integer", nullable: false },
  { table: "vote_history", column: "history_id", dataType: "integer", nullable: false },
  { table: "vote_history", column: "game_id", dataType: "integer", nullable: false },
  { table: "vote_history", column: "vote_round", dataType: "integer", nullable: false },
  { table: "vote_history", column: "vote_count", dataType: "integer", nullable: false },
  { table: "vote_history", column: "position", dataType: "integer", nullable: true },
  { table: "vote_history", column: "notes", dataType: "text", nullable: true },
  { table: "roles", column: "id", dataType: "integer", nullable: false },
  { table: "roles", column: "name", dataType: "character varying", nullable: false, maxLength: 50 },
  { table: "roles", column: "description", dataType: "character varying", nullable: true, maxLength: 200 },
  { table: "users", column: "id", dataType: "integer", nullable: false },
  { table: "users", column: "twitch_id", dataType: "character varying", nullable: false, maxLength: 255 },
  { table: "users", column: "twitch_username", dataType: "character varying", nullable: false, maxLength: 255 },
  { table: "users", column: "profile_image_url", dataType: "character varying", nullable: true, maxLength: 500 },
  { table: "users", column: "role_id", dataType: "integer", nullable: false },
  { table: "users", column: "created_at", dataType: "timestamp without time zone", nullable: false },
  { table: "users", column: "last_login_at", dataType: "timestamp without time zone", nullable: false },
  { table: "users", column: "api_key", dataType: "character varying", nullable: false, maxLength: 64 },
  { table: "game_serial_numbers", column: "serial_id", dataType: "integer", nullable: false },
  { table: "game_serial_numbers", column: "game_id", dataType: "integer", nullable: false },
  { table: "game_serial_numbers", column: "serial_number", dataType: "character varying", nullable: false, maxLength: 50 },
  { table: "game_serial_numbers", column: "region", dataType: "character varying", nullable: true, maxLength: 50 },
  { table: "game_serial_numbers", column: "notes", dataType: "character varying", nullable: true, maxLength: 500 },
  { table: "alternate_titles", column: "alternate_title_id", dataType: "integer", nullable: false },
  { table: "alternate_titles", column: "game_id", dataType: "integer", nullable: false },
  { table: "alternate_titles", column: "title", dataType: "character varying", nullable: false, maxLength: 150 },
  { table: "alternate_titles", column: "notes", dataType: "character varying", nullable: true, maxLength: 500 }
];

const expectedIndexes = [
  "idx_games_image_url",
  "idx_users_api_key",
  "idx_users_twitch_id",
  "idx_current_vote_game_id_unique",
  "idx_current_vote_game_number_unique",
  "idx_game_serial_numbers_game_id",
  "idx_game_serial_numbers_serial_number_unique",
  "idx_alternate_titles_game_id"
];

const expectedConstraints = ["chk_current_vote_game_number", "chk_vote_history_position"];

export async function migrateDatabase(connectionString: string): Promise<void> {
  const db = createKyselyDatabase(connectionString);
  try {
    const tables = await publicTableNames(db);
    if (tables.size === 0) {
      await runMigrationsToLatest(db);
      return;
    }

    await db.transaction().execute(async (transaction) => {
      await assertCSharpV13CompatibleSchema(transaction, tables);
      await recordTypeScriptBaseline(transaction);
      await markBaselineMigrationsAsExecuted(transaction);
    });

    await runMigrationsToLatest(db);
  } finally {
    await db.destroy();
  }
}

async function runMigrationsToLatest(db: Kysely<any>): Promise<void> {
  const migrator = createMigrator(db);
  const { error, results } = await migrator.migrateToLatest();
  if (error) {
    const resultSummary = results?.map((result) => `${result.migrationName}: ${result.status}`).join(", ") ?? "no migration results";
    throw new Error(`Database migration failed (${resultSummary}): ${errorMessage(error)}`);
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return typeof error === "string" ? error : JSON.stringify(error) ?? "Unknown error";
}

function createMigrator(db: Kysely<any>): Migrator {
  return new Migrator({
    db,
    provider: new FileMigrationProvider({
      fs,
      import: async (modulePath) => import(pathToFileURL(modulePath).href),
      migrationFolder: path.join(path.dirname(fileURLToPath(import.meta.url)), "migrations"),
      path
    })
  });
}

async function markBaselineMigrationsAsExecuted(db: Kysely<any>): Promise<void> {
  await ensureKyselyMigrationTables(db);
  const timestamp = new Date().toISOString();

  for (const name of baselineMigrationNames) {
    await db
      .insertInto("kysely_migration")
      .values({ name, timestamp })
      .onConflict((oc) => oc.column("name").doNothing())
      .execute();
  }
}

async function ensureKyselyMigrationTables(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("kysely_migration")
    .ifNotExists()
    .addColumn("name", "varchar(255)", (col) => col.notNull().primaryKey())
    .addColumn("timestamp", "varchar(255)", (col) => col.notNull())
    .execute();

  await db.schema
    .createTable("kysely_migration_lock")
    .ifNotExists()
    .addColumn("id", "varchar(255)", (col) => col.notNull().primaryKey())
    .addColumn("is_locked", "integer", (col) => col.notNull().defaultTo(0))
    .execute();

  await db
    .insertInto("kysely_migration_lock")
    .values({ id: "migration_lock", is_locked: 0 })
    .onConflict((oc) => oc.column("id").doNothing())
    .execute();
}

async function assertCSharpV13CompatibleSchema(db: Kysely<any>, tables: Set<string>): Promise<void> {
  const errors: string[] = [];

  for (const table of expectedTables) {
    if (!tables.has(table)) {
      errors.push(`missing table '${table}'`);
    }
  }

  await assertColumns(db, errors);
  await assertIndexes(db, errors);
  await assertConstraints(db, errors);

  if (errors.length) {
    throw new Error(`Existing database is not compatible with the expected C# v13 schema:\n${errors.join("\n")}`);
  }
}

async function assertColumns(db: Kysely<any>, errors: string[]): Promise<void> {
  const columns = await publicColumns(db);

  for (const expected of expectedColumns) {
    const actual = columns.get(`${expected.table}.${expected.column}`);
    if (!actual) {
      errors.push(`missing column '${expected.table}.${expected.column}'`);
      continue;
    }
    if (actual.dataType !== expected.dataType) {
      errors.push(`column '${expected.table}.${expected.column}' has type '${actual.dataType}', expected '${expected.dataType}'`);
    }
    if (actual.nullable !== expected.nullable) {
      errors.push(`column '${expected.table}.${expected.column}' nullable=${actual.nullable}, expected ${expected.nullable}`);
    }
    if (expected.maxLength !== undefined && actual.maxLength !== expected.maxLength) {
      errors.push(`column '${expected.table}.${expected.column}' length=${actual.maxLength ?? "none"}, expected ${expected.maxLength}`);
    }
  }
}

async function assertIndexes(db: Kysely<any>, errors: string[]): Promise<void> {
  const indexes = await publicIndexNames(db);
  for (const index of expectedIndexes) {
    if (!indexes.has(index)) {
      errors.push(`missing index '${index}'`);
    }
  }
}

async function assertConstraints(db: Kysely<any>, errors: string[]): Promise<void> {
  const constraints = await publicConstraintNames(db);
  for (const constraint of expectedConstraints) {
    if (!constraints.has(constraint)) {
      errors.push(`missing constraint '${constraint}'`);
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = loadConfig();
  await migrateDatabase(config.databaseConnectionString);
}
