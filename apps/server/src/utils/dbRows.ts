import { parseDateOnly, parseNullableDateOnly, type AlternateTitle, type GameDto, type GameProgressDto } from "@ps2-challenge/shared";

export type GameRow = {
  game_id: number;
  title: string;
  developer: string | null;
  publisher: string | null;
  first_released: string | Date | null;
  region_first_released_in: string | null;
  released_in_eu_or_na: boolean | null;
  image_url: string | null;
  is_excluded?: boolean | null;
  is_owned?: boolean | null;
  howlongtobeat_id?: number | null;
  howlongtobeat_main_story_seconds?: number | null;
  howlongtobeat_main_extra_seconds?: number | null;
  howlongtobeat_completionist_seconds?: number | null;
};

export type ProgressRow = {
  progress_id: number;
  game_id: number;
  game_title: string;
  image_url: string | null;
  date_started: string | Date;
  date_finished: string | Date | null;
  completion_time: string | null;
  beaten_criteria: string | null;
  review: string | null;
  platform: string;
};

export type AlternateTitleRow = {
  alternate_title_id: number;
  game_id: number;
  title: string;
  notes: string | null;
};

export function mapGame(row: GameRow): GameDto {
  return {
    id: row.game_id,
    title: row.title,
    developer: row.developer,
    publisher: row.publisher,
    firstReleased: parseNullableDateOnly(row.first_released),
    regionFirstReleasedIn: row.region_first_released_in,
    releasedInEuPalOrNa: row.released_in_eu_or_na ?? false,
    imageUrl: row.image_url,
    isExcluded: row.is_excluded ?? false,
    isOwned: row.is_owned ?? false,
    howLongToBeatId: row.howlongtobeat_id ?? null,
    howLongToBeatMainStorySeconds: row.howlongtobeat_main_story_seconds ?? null,
    howLongToBeatMainExtraSeconds: row.howlongtobeat_main_extra_seconds ?? null,
    howLongToBeatCompletionistSeconds: row.howlongtobeat_completionist_seconds ?? null
  };
}

export function mapProgress(row: ProgressRow): GameProgressDto {
  return {
    progressId: row.progress_id,
    gameId: row.game_id,
    gameTitle: row.game_title,
    imageUrl: row.image_url,
    dateStarted: parseDateOnly(row.date_started),
    dateFinished: parseNullableDateOnly(row.date_finished),
    completionTime: normalizePgInterval(row.completion_time),
    beatenCriteria: row.beaten_criteria,
    review: row.review,
    platform: row.platform
  };
}

export function mapAlternateTitle(row: AlternateTitleRow): AlternateTitle {
  return {
    alternateTitleId: row.alternate_title_id,
    gameId: row.game_id,
    title: row.title,
    notes: row.notes
  };
}

export function normalizePgInterval(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  const simple = /^(\d{1,3}):(\d{2}):(\d{2})$/.exec(trimmed);
  if (simple) {
    return `${simple[1]!.padStart(2, "0")}:${simple[2]}:${simple[3]}`;
  }

  const verbose = /^(?:(\d{1,9})\s{1,3}days?\s{1,3})?(\d{1,3}):(\d{2}):(\d{2})/.exec(trimmed);
  if (verbose) {
    const days = Number.parseInt(verbose[1] ?? "0", 10);
    const hours = Number.parseInt(verbose[2] ?? "0", 10) + days * 24;
    return `${hours.toString().padStart(2, "0")}:${verbose[3]}:${verbose[4]}`;
  }

  return trimmed;
}

export function sortGames(games: GameDto[]): GameDto[] {
  return [...games].sort((left, right) => {
    const leftSpecial = left.title && !/^[a-z0-9]/i.test(left.title) ? 0 : 1;
    const rightSpecial = right.title && !/^[a-z0-9]/i.test(right.title) ? 0 : 1;
    if (leftSpecial !== rightSpecial) {
      return leftSpecial - rightSpecial;
    }
    return left.title.localeCompare(right.title, "en-GB");
  });
}
