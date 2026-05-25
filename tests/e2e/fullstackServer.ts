import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { sql } from "kysely";
import { closeDbClient, createDbClient, type DbClient } from "../../apps/server/src/db/client.js";
import { migrateDatabase } from "../../apps/server/src/db/migrate.js";
import type { Database } from "../../apps/server/src/db/kysely.js";
import { hashApiKey } from "../../apps/server/src/repositories/userRepository.js";
import { buildApp } from "../../apps/server/src/server.js";

const port = Number.parseInt(process.env.PLAYWRIGHT_FULLSTACK_PORT ?? "4173", 10);
const cookieSecret = process.env.PLAYWRIGHT_COOKIE_SECRET ?? "playwright-cookie-secret";

let dbClient: DbClient | undefined;
let container: Awaited<ReturnType<PostgreSqlContainer["start"]>> | undefined;
let app: Awaited<ReturnType<typeof buildApp>> | undefined;

async function main() {
  container = await new PostgreSqlContainer("postgres:16-alpine").start();
  const connectionString = container.getConnectionUri();

  await migrateDatabase(connectionString);
  dbClient = createDbClient({ databaseConnectionString: connectionString });
  await seedDatabase(dbClient);

  app = await buildApp(
    {
      nodeEnv: "Testing",
      port,
      databaseConnectionString: connectionString,
      twitchClientId: "playwright-client",
      twitchClientSecret: "playwright-secret",
      publicBaseUrl: `http://127.0.0.1:${port}`,
      cookieSecret,
      logLevel: "silent"
    },
    { dbClient }
  );

  await app.listen({ port, host: "127.0.0.1" });
  console.log(`Playwright full-stack app listening on http://127.0.0.1:${port}`);
}

async function seedDatabase(client: DbClient) {
  const db = client.db;
  const adminRole = await db.selectFrom("roles").select("id").where("name", "=", "Admin").executeTakeFirstOrThrow();
  const userRole = await db.selectFrom("roles").select("id").where("name", "=", "User").executeTakeFirstOrThrow();

  await db
    .insertInto("users")
    .values([
      {
        twitch_id: "playwright-admin",
        twitch_username: "PlaywrightAdmin",
        profile_image_url: "/assets/glitch_flat_purple.svg",
        role_id: adminRole.id,
        created_at: "2024-01-01T10:00:00",
        last_login_at: "2024-01-10T10:00:00",
        api_key: hashApiKey("playwright-admin-api-key")
      },
      {
        twitch_id: "playwright-user",
        twitch_username: "PlaywrightUser",
        profile_image_url: null,
        role_id: userRole.id,
        created_at: "2024-01-02T10:00:00",
        last_login_at: "2024-01-09T10:00:00",
        api_key: hashApiKey("playwright-user-api-key")
      }
    ])
    .execute();

  const insertedGames = await db
    .insertInto("games")
    .values([
      game("Amplitude", "Harmonix", "Sony Computer Entertainment", "2003-09-26", "NA", "/assets/glitch_flat_purple.svg"),
      game("Burnout 3: Takedown", "Criterion Games", "Electronic Arts", "2004-09-10", "EU", "/assets/yt_icon_red_digital.png"),
      game("Bomberman Hardball", "Hudson Soft", "Hudson Soft", "2004-10-07", "JP", null),
      game("Boogie", "Pipeworks Studios", "Electronic Arts", "2007-11-12", "NA", null),
      game("Frequency", "Harmonix", "Sony Computer Entertainment", "2001-11-20", "NA", null),
      game("Ecco the Dolphin: Defender of the Future", "Appaloosa Interactive", "Sega", "2002-02-22", "EU", null)
    ])
    .returning(["game_id", "title"])
    .execute();
  const gameIds = Object.fromEntries(insertedGames.map((row) => [row.title, row.game_id]));
  const amplitudeId = gameIds["Amplitude"]!;
  const burnoutId = gameIds["Burnout 3: Takedown"]!;
  const bombermanId = gameIds["Bomberman Hardball"]!;
  const boogieId = gameIds["Boogie"]!;
  const frequencyId = gameIds["Frequency"]!;
  const eccoId = gameIds["Ecco the Dolphin: Defender of the Future"]!;

  await db
    .insertInto("game_owned")
    .values([
      { game_id: amplitudeId, own_physical_copy: true, type_owned: "Base" },
      { game_id: burnoutId, own_physical_copy: true, type_owned: "Platinum" },
      { game_id: bombermanId, own_physical_copy: true, type_owned: "Base" },
      { game_id: frequencyId, own_physical_copy: true, type_owned: "Base" },
      { game_id: eccoId, own_physical_copy: true, type_owned: "Base" }
    ])
    .execute();

  await db.insertInto("excluded_games").values({ game_id: boogieId, reason: "Not part of the current challenge rules" }).execute();
  await db.insertInto("alternate_titles").values({ game_id: amplitudeId, title: "Amplitude: Special Edition", notes: "Seeded e2e alternate title" }).execute();
  await db
    .insertInto("progress")
    .values([
      {
        game_id: amplitudeId,
        date_started: "2024-01-01",
        date_finished: "2024-01-03",
        completion_time: sql<Database["progress"]["completion_time"]>`'4 hours 30 minutes'::interval`,
        beaten_criteria: "Credits",
        review: "Seeded full-stack completion",
        platform: "Physical"
      },
      {
        game_id: burnoutId,
        date_started: "2024-02-01",
        date_finished: null,
        completion_time: null,
        beaten_criteria: "In progress",
        review: null,
        platform: "Emulated"
      }
    ])
    .execute();

  await db
    .insertInto("current_vote")
    .values([
      { game_id: amplitudeId, vote_count: 4, game_number: 1 },
      { game_id: burnoutId, vote_count: 1, game_number: 2 },
      { game_id: bombermanId, vote_count: 0, game_number: 3 }
    ])
    .execute();

  await db
    .insertInto("vote_history")
    .values([
      { game_id: amplitudeId, vote_round: 1, vote_count: 8, position: 1, notes: "Opening round" },
      { game_id: burnoutId, vote_round: 1, vote_count: 5, position: 2, notes: "Opening round" },
      { game_id: bombermanId, vote_round: 1, vote_count: 2, position: 3, notes: "Opening round" }
    ])
    .execute();
}

function game(
  title: string,
  developer: string,
  publisher: string,
  first_released: string,
  region_first_released_in: string,
  image_url: string | null
) {
  return {
    title,
    developer,
    publisher,
    first_released,
    region_first_released_in,
    released_in_eu_or_na: true,
    image_url,
    notes: null
  };
}

async function shutdown() {
  await app?.close();
  if (!app && dbClient) {
    await closeDbClient(dbClient);
  }
  await container?.stop();
}

process.once("SIGINT", () => void shutdown().finally(() => process.exit(0)));
process.once("SIGTERM", () => void shutdown().finally(() => process.exit(0)));

main().catch((error) => {
  console.error(error);
  void shutdown().finally(() => process.exit(1));
});
