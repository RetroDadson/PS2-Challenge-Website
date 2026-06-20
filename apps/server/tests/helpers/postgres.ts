import { PostgreSqlContainer } from "@testcontainers/postgresql";
import pg from "pg";
import { migrateDatabase } from "../../src/db/migrate.js";
import { hashApiKey } from "../../src/repositories/userRepository.js";

const { Pool } = pg;

export type IntegrationDatabase = {
  connectionString: string;
  pool: pg.Pool;
  reset: () => Promise<void>;
  stop: () => Promise<void>;
};

export async function startIntegrationDatabase(): Promise<IntegrationDatabase> {
  const container = await new PostgreSqlContainer("postgres:16-alpine").start();
  const connectionString = container.getConnectionUri();
  await migrateDatabase(connectionString);

  const pool = new Pool({ connectionString });

  return {
    connectionString,
    pool,
    reset: () => resetDatabase(pool),
    stop: async () => {
      await pool.end();
      await container.stop();
    }
  };
}

async function resetDatabase(pool: pg.Pool): Promise<void> {
  await pool.query(`
    TRUNCATE
      twitch_stream_vods,
      vote_history,
      current_vote,
      progress,
      excluded_games,
      game_owned,
      game_howlongtobeat,
      game_serial_numbers,
      alternate_titles,
      games,
      users
    RESTART IDENTITY CASCADE
  `);
}

export async function seedGame(pool: pg.Pool, id: number, title: string): Promise<void> {
  await pool.query(
    `
    INSERT INTO games (game_id, title, developer, publisher, region_first_released_in, released_in_eu_or_na)
    VALUES ($1, $2, 'D', 'P', 'NA', true)
    `,
    [id, title]
  );
}

export async function seedCurrentVote(pool: pg.Pool, gameId: number, voteCount: number, gameNumber: number): Promise<void> {
  await pool.query("INSERT INTO current_vote (game_id, vote_count, game_number) VALUES ($1, $2, $3)", [gameId, voteCount, gameNumber]);
}

export type SeedUserOptions = {
  twitchId?: string;
  username?: string;
  profileImageUrl?: string | null;
  createdAt?: string;
  lastLoginAt?: string;
};

export async function seedUser(pool: pg.Pool, roleName: "Admin" | "User", rawApiKey: string, options: SeedUserOptions = {}): Promise<number> {
  const role = await pool.query<{ id: number }>("SELECT id FROM roles WHERE name = $1", [roleName]);
  const roleId = role.rows[0]?.id;
  if (!roleId) {
    throw new Error(`Role '${roleName}' not found`);
  }

  const result = await pool.query<{ id: number }>(
    `
    INSERT INTO users (twitch_id, twitch_username, profile_image_url, role_id, created_at, last_login_at, api_key)
    VALUES ($1, $2, $3, $4, COALESCE($5::timestamp, CURRENT_TIMESTAMP), COALESCE($6::timestamp, CURRENT_TIMESTAMP), $7)
    RETURNING id
    `,
    [
      options.twitchId ?? `${roleName.toLocaleLowerCase("en-GB")}-twitch`,
      options.username ?? `${roleName}User`,
      options.profileImageUrl ?? null,
      roleId,
      options.createdAt ?? null,
      options.lastLoginAt ?? null,
      hashApiKey(rawApiKey)
    ]
  );
  return result.rows[0]!.id;
}
