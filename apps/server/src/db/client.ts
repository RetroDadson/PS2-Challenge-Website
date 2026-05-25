import type { Kysely } from "kysely";
import pg from "pg";
import type { AppConfig } from "../config.js";
import { createKyselyFromPool, type Database } from "./kysely.js";

const { Pool } = pg;

export type DbClient = {
  pool: pg.Pool;
  db: Kysely<Database>;
};

export function createDbClient(config: Pick<AppConfig, "databaseConnectionString">): DbClient {
  const pool = new Pool({
    connectionString: config.databaseConnectionString,
    max: Number.parseInt(process.env.PG_POOL_SIZE ?? "10", 10)
  });

  return {
    pool,
    db: createKyselyFromPool(pool)
  };
}

export async function closeDbClient(client: DbClient): Promise<void> {
  await client.pool.end();
}
