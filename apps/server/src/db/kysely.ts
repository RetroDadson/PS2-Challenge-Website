import type { GameTablePreferencesDto, SubEntryStatus, SubGrantType, SubTier } from "@ps2-challenge/shared";
import { Kysely, PostgresDialect, type ColumnType, type Generated, type JSONColumnType } from "kysely";
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
  challenge_runners: {
    challenge_runner_id: Generated<number>;
    name: string;
    description: string;
    twitch_url: string | null;
    youtube_url: string | null;
    logo_url: string | null;
    created_at: Timestamp;
    updated_at: Timestamp;
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
  progress_death_counters: {
    progress_id: number;
    deaths: Generated<number>;
    death_label: string | null;
    updated_at: Timestamp;
  };
  roles: {
    id: Generated<number>;
    name: string;
    description: string | null;
  };
  sub_entries: {
    entry_id: Generated<number>;
    grant_id: number;
    twitch_user_id: string | null;
    game_id: number | null;
    status: Generated<SubEntryStatus>;
    played_game_number: number | null;
    picked_at: NullableTimestamp;
    pick_updated_by_user_id: number | null;
    created_at: Timestamp;
    updated_at: Timestamp;
  };
  sub_entry_grants: {
    grant_id: Generated<number>;
    twitch_user_id: string | null;
    twitch_login: string | null;
    twitch_display_name: string | null;
    tier: SubTier;
    grant_type: SubGrantType;
    gift_count: Generated<number>;
    entry_count: number;
    source: "eventsub" | "manual";
    notes: string | null;
    created_by_user_id: number | null;
    created_at: Timestamp;
    updated_at: Timestamp;
  };
  sub_pick_audit: {
    audit_id: Generated<number>;
    actor_user_id: number | null;
    actor_username: string | null;
    action: string;
    target_type: string;
    target_id: number | null;
    details: JSONColumnType<Record<string, unknown>, Record<string, unknown> | undefined, Record<string, unknown>>;
    created_at: Timestamp;
  };
  sub_pick_settings: {
    id: number;
    tier1_entries: number;
    tier2_entries: number;
    tier3_entries: number;
    spin_duration_seconds: number;
    overlay_message: string;
    updated_by_user_id: number | null;
    updated_at: Timestamp;
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
    game_table_preferences: JSONColumnType<
      GameTablePreferencesDto | null,
      GameTablePreferencesDto | null | undefined,
      GameTablePreferencesDto | null
    >;
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
