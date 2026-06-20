import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import pg from "pg";
import { createKyselyFromPool } from "../src/db/kysely.js";
import { migrateDatabase } from "../src/db/migrate.js";
import { up as addHowLongToBeatSyncState } from "../src/db/migrations/005_add_howlongtobeat_sync_state.js";

const { Pool } = pg;
const expectedMigrationRecords = [
  "001_csharp_v13_schema",
  "002_record_typescript_baseline",
  "003_add_twitch_stream_vods",
  "004_add_howlongtobeat_games",
  "005_add_howlongtobeat_sync_state"
];

describe("database migrations", () => {
  let container: Awaited<ReturnType<PostgreSqlContainer["start"]>>;
  let connectionString: string;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    connectionString = container.getConnectionUri();
  }, 120_000);

  afterAll(async () => {
    await container?.stop();
  });

  beforeEach(async () => {
    await resetPublicSchema(connectionString);
  });

  it("creates the v13-compatible schema and TypeScript baseline marker", async () => {
    await migrateDatabase(connectionString);

    const pool = new Pool({ connectionString });
    try {
      const tables = await pool.query<{ table_name: string }>(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
      );
      expect(tables.rows.map((row) => row.table_name)).toContain("games");
      expect(tables.rows.map((row) => row.table_name)).toContain("current_vote");
      expect(tables.rows.map((row) => row.table_name)).toContain("ts_migration_baseline");
      expect(tables.rows.map((row) => row.table_name)).toContain("twitch_stream_vods");
      expect(tables.rows.map((row) => row.table_name)).toContain("game_howlongtobeat");
      expect(tables.rows.map((row) => row.table_name)).toContain("game_howlongtobeat_sync_state");

      const apiKeyColumn = await pool.query<{ is_nullable: string; character_maximum_length: number }>(
        `
        SELECT is_nullable, character_maximum_length
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'api_key'
        `
      );
      expect(apiKeyColumn.rows[0]).toEqual({ is_nullable: "NO", character_maximum_length: 64 });

      const imageUrlColumn = await pool.query<{ data_type: string; character_maximum_length: number }>(
        `
        SELECT data_type, character_maximum_length
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'games' AND column_name = 'image_url'
        `
      );
      expect(imageUrlColumn.rows[0]).toEqual({ data_type: "character varying", character_maximum_length: 500 });

      const howLongToBeatColumns = await pool.query<{ column_name: string; data_type: string; is_nullable: string }>(
        `
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'game_howlongtobeat'
        ORDER BY ordinal_position
        `
      );
      expect(howLongToBeatColumns.rows).toEqual([
        { column_name: "game_id", data_type: "integer", is_nullable: "NO" },
        { column_name: "howlongtobeat_id", data_type: "integer", is_nullable: "NO" },
        { column_name: "main_story_seconds", data_type: "integer", is_nullable: "YES" },
        { column_name: "main_extra_seconds", data_type: "integer", is_nullable: "YES" },
        { column_name: "completionist_seconds", data_type: "integer", is_nullable: "YES" },
        { column_name: "last_synced_at", data_type: "timestamp without time zone", is_nullable: "NO" }
      ]);

      const syncStateColumns = await pool.query<{ column_name: string; data_type: string; is_nullable: string }>(
        `
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'game_howlongtobeat_sync_state'
        ORDER BY ordinal_position
        `
      );
      expect(syncStateColumns.rows).toEqual([
        { column_name: "game_id", data_type: "integer", is_nullable: "NO" },
        { column_name: "status", data_type: "character varying", is_nullable: "NO" },
        { column_name: "last_attempted_at", data_type: "timestamp without time zone", is_nullable: "YES" },
        { column_name: "last_successful_at", data_type: "timestamp without time zone", is_nullable: "YES" },
        { column_name: "next_attempt_at", data_type: "timestamp without time zone", is_nullable: "NO" },
        { column_name: "failure_count", data_type: "integer", is_nullable: "NO" },
        { column_name: "last_error", data_type: "text", is_nullable: "YES" }
      ]);

      const constraints = await pool.query<{ conname: string }>(
        "SELECT conname FROM pg_constraint WHERE conname IN ('chk_current_vote_game_number', 'chk_vote_history_position')"
      );
      expect(constraints.rows.map((row) => row.conname).sort()).toEqual(["chk_current_vote_game_number", "chk_vote_history_position"]);

      const migrationRecords = await pool.query<{ name: string }>("SELECT name FROM kysely_migration ORDER BY name");
      expect(migrationRecords.rows.map((row) => row.name)).toEqual(expectedMigrationRecords);
    } finally {
      await pool.end();
    }
  });

  it("seeds every existing game as pending without contacting HowLongToBeat", async () => {
    const pool = new Pool({ connectionString });
    const db = createKyselyFromPool(pool);
    try {
      await sql`CREATE TABLE games (game_id integer PRIMARY KEY, title varchar(150) NOT NULL)`.execute(db);
      await sql`INSERT INTO games (game_id, title) VALUES (1, 'First Game'), (2, 'Second Game')`.execute(db);

      await addHowLongToBeatSyncState(db);

      const states = await db
        .selectFrom("game_howlongtobeat_sync_state")
        .select(["game_id", "status", "failure_count"])
        .orderBy("game_id")
        .execute();
      expect(states).toEqual([
        { game_id: 1, status: "pending", failure_count: 0 },
        { game_id: 2, status: "pending", failure_count: 0 }
      ]);
    } finally {
      await db.destroy();
    }
  });

  it("records a no-op baseline for an existing compatible schema", async () => {
    await migrateDatabase(connectionString);
    const pool = new Pool({ connectionString });
    try {
      await pool.query("DROP TABLE ts_migration_baseline");
    } finally {
      await pool.end();
    }

    await migrateDatabase(connectionString);

    const verifiedPool = new Pool({ connectionString });
    try {
      const baseline = await verifiedPool.query<{ baseline_name: string }>("SELECT baseline_name FROM ts_migration_baseline WHERE id = 13");
      expect(baseline.rows[0]?.baseline_name).toBe("csharp-v13-schema");

      const migrationRecords = await verifiedPool.query<{ name: string }>("SELECT name FROM kysely_migration ORDER BY name");
      expect(migrationRecords.rows.map((row) => row.name)).toEqual(expectedMigrationRecords);
    } finally {
      await verifiedPool.end();
    }
  });

  it("rejects a non-empty database that is missing required C# v13 objects", async () => {
    const pool = new Pool({ connectionString });
    try {
      await pool.query("CREATE TABLE games (game_id integer PRIMARY KEY)");
    } finally {
      await pool.end();
    }

    await expect(migrateDatabase(connectionString)).rejects.toThrow(/not compatible with the expected C# v13 schema/);

    const verifiedPool = new Pool({ connectionString });
    try {
      const baseline = await verifiedPool.query<{ table_name: string }>(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'ts_migration_baseline'"
      );
      expect(baseline.rowCount).toBe(0);
    } finally {
      await verifiedPool.end();
    }
  });
});

async function resetPublicSchema(connectionString: string): Promise<void> {
  const pool = new Pool({ connectionString });
  try {
    await pool.query("DROP SCHEMA public CASCADE");
    await pool.query("CREATE SCHEMA public");
  } finally {
    await pool.end();
  }
}
