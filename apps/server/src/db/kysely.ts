import { Kysely, PostgresDialect, type ColumnType, type Generated } from "kysely";
import pg from "pg";

const { Pool } = pg;

type Timestamp = ColumnType<Date, Date | string | undefined, Date | string>;
type NullableTimestamp = ColumnType<Date | null, Date | string | null | undefined, Date | string | null>;
type DateOnly = ColumnType<string, string | Date, string | Date | null>;
type Interval = ColumnType<unknown, unknown, unknown>;

export interface Database {
  alternate_titles: {
    alternate_title_id: Generated<number>;
    game_id: number;
    title: string;
    notes: string | null;
  };
  current_vote: {
    vote_id: Generated<number>;
    game_id: number;
    vote_count: number;
    game_number: number;
  };
  excluded_games: {
    exclusion_id: Generated<number>;
    game_id: number;
    reason: string;
  };
  game_aliases: {
    alias_id: Generated<number>;
    game_id: number;
    alias_name: string;
  };
  game_owned: {
    ownership_id: Generated<number>;
    game_id: number;
    own_physical_copy: boolean | null;
    type_owned: string | null;
  };
  game_howlongtobeat: {
    game_id: number;
    howlongtobeat_id: number;
    main_story_seconds: number | null;
    main_extra_seconds: number | null;
    completionist_seconds: number | null;
    last_synced_at: Timestamp;
  };
  game_howlongtobeat_sync_state: {
    game_id: number;
    status: "pending" | "matched" | "not_found" | "error";
    last_attempted_at: NullableTimestamp;
    last_successful_at: NullableTimestamp;
    next_attempt_at: Timestamp;
    failure_count: number;
    last_error: string | null;
  };
  game_serial_numbers: {
    serial_id: Generated<number>;
    game_id: number;
    serial_number: string;
    region: string | null;
    notes: string | null;
  };
  games: {
    game_id: Generated<number>;
    title: string;
    notes: string | null;
    first_released: DateOnly | null;
    region_first_released_in: string | null;
    released_in_eu_or_na: boolean | null;
    developer: string | null;
    publisher: string | null;
    image_url: string | null;
  };
  ownership_types: {
    type_owned: string;
  };
  platform_types: {
    platform: string;
  };
  progress: {
    progress_id: Generated<number>;
    game_id: number;
    date_started: DateOnly;
    date_finished: DateOnly | null;
    completion_time: Interval | null;
    beaten_criteria: string | null;
    review: string | null;
    platform: string;
  };
  roles: {
    id: Generated<number>;
    name: string;
    description: string | null;
  };
  ts_migration_baseline: {
    id: number;
    baseline_name: string;
    applied_at: Timestamp;
  };
  twitch_stream_vods: {
    vod_id: string;
    channel_login: string;
    title: string | null;
    url: string | null;
    created_at: Timestamp;
    duration_seconds: number;
    fetched_at: Timestamp;
  };
  users: {
    id: Generated<number>;
    twitch_id: string;
    twitch_username: string;
    profile_image_url: string | null;
    role_id: number;
    created_at: Timestamp;
    last_login_at: Timestamp;
    api_key: string;
  };
  vote_history: {
    history_id: Generated<number>;
    game_id: number;
    vote_round: number;
    vote_count: number;
    position: number | null;
    notes: string | null;
  };
}

export function createKyselyDatabase(connectionString: string): Kysely<Database> {
  return createKyselyFromPool(new Pool({ connectionString }));
}

export function createKyselyFromPool(pool: pg.Pool): Kysely<Database> {
  return new Kysely<Database>({
    dialect: new PostgresDialect({
      pool
    })
  });
}
