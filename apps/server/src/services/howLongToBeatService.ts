import type { GameDto } from "@ps2-challenge/shared";
import { normalizeTitle } from "@ps2-challenge/shared";
import type { Kysely } from "kysely";
import type pg from "pg";
import { createKyselyFromPool, type Database } from "../db/kysely.js";
import { GameRepository } from "../repositories/gameRepository.js";

type FetchHowLongToBeat = (input: string, init?: RequestInit) => Promise<Response>;
const howLongToBeatOrigin = "https://howlongtobeat.com";
const howLongToBeatSearchEndpoint = `${howLongToBeatOrigin}/api/bleed`;
const abortedHowLongToBeatRefresh = Symbol("abortedHowLongToBeatRefresh");
const howLongToBeatAuthHeaderNames = new Map<string, string>([
  ["token", "x-auth-token"],
  ["hpKey", "x-hp-key"],
  ["hpVal", "x-hp-val"]
]);
const supportedHeaderValueTypes = new Set(["string", "number", "boolean"]);

type HowLongToBeatAuth = {
  hpKey: string;
  hpVal: string;
  headers: Record<string, string>;
};

export type HowLongToBeatGame = {
  id: number;
  title: string;
  mainStorySeconds: number | null;
  mainExtraSeconds: number | null;
  completionistSeconds: number | null;
  similarity: number | null;
};

export type HowLongToBeatRefreshProgress = {
  status: "starting" | "searching" | "updated" | "skipped" | "error" | "completed";
  total: number;
  processed: number;
  updated: number;
  skipped: number;
  errors: number;
  currentGameId?: number;
  currentGameTitle?: string;
  error?: string;
};

export type HowLongToBeatRefreshResult = {
  total: number;
  updated: number;
  skipped: number;
  errors: number;
};

export type HowLongToBeatRefreshProgressHandler = (progress: HowLongToBeatRefreshProgress) => void | Promise<void>;

export class HowLongToBeatClient {
  private auth: HowLongToBeatAuth | null = null;

  constructor(private readonly fetchHowLongToBeat: FetchHowLongToBeat = globalThis.fetch.bind(globalThis)) {}

  async search(title: string, signal?: AbortSignal): Promise<HowLongToBeatGame[]> {
    const payload = searchPayload(title);
    if (payload.searchTerms.length === 0) {
      return [];
    }

    let response = await this.postSearch(payload, await this.ensureAuthorized(signal), signal);
    if (response.status === 403) {
      this.auth = null;
      response = await this.postSearch(payload, await this.ensureAuthorized(signal), signal);
    }

    if (response.status === 404) {
      return [];
    }
    if (!response.ok) {
      throw new Error(`HowLongToBeat search returned HTTP ${response.status}`);
    }

    return parseHowLongToBeatResults(await response.json());
  }

  private async ensureAuthorized(signal?: AbortSignal): Promise<HowLongToBeatAuth> {
    if (this.auth) {
      return this.auth;
    }

    const init: RequestInit = { headers: requestHeaders() };
    if (signal) {
      init.signal = signal;
    }
    const response = await this.fetchHowLongToBeat(`${howLongToBeatSearchEndpoint}/init?t=${Date.now()}`, init);
    if (!response.ok) {
      throw new Error(`HowLongToBeat auth init returned HTTP ${response.status}`);
    }

    const body: unknown = await response.json();
    if (!isRecord(body)) {
      throw new Error("HowLongToBeat auth init returned an invalid payload");
    }

    const token = stringField(body, ["token"]);
    const hpKey = stringField(body, ["hpKey"]);
    const hpVal = stringField(body, ["hpVal"]);
    if (!token || !hpKey || !hpVal) {
      throw new Error("HowLongToBeat auth init did not include the expected token values");
    }

    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(body)) {
      if (!isSupportedHeaderValue(value)) {
        continue;
      }
      headers[howLongToBeatAuthHeaderName(key)] = String(value);
    }

    this.auth = { hpKey, hpVal, headers };
    return this.auth;
  }

  private async postSearch(payload: ReturnType<typeof searchPayload>, auth: HowLongToBeatAuth, signal?: AbortSignal): Promise<Response> {
    const init: RequestInit = {
      method: "POST",
      headers: requestHeaders(auth),
      body: JSON.stringify({ ...payload, [auth.hpKey]: auth.hpVal })
    };
    if (signal) {
      init.signal = signal;
    }
    return this.fetchHowLongToBeat(howLongToBeatSearchEndpoint, init);
  }
}

function howLongToBeatAuthHeaderName(key: string): string {
  return howLongToBeatAuthHeaderNames.get(key) ?? `x-${key}`;
}

function isSupportedHeaderValue(value: unknown): value is string | number | boolean {
  return supportedHeaderValueTypes.has(typeof value);
}

export class HowLongToBeatRefreshService {
  private readonly repository: GameRepository;
  private readonly client: HowLongToBeatClient;

  constructor(pool: pg.Pool, fetchHowLongToBeat?: FetchHowLongToBeat, db?: Kysely<Database>) {
    const database = db ?? createKyselyFromPool(pool);
    this.repository = new GameRepository(database);
    this.client = new HowLongToBeatClient(fetchHowLongToBeat);
  }

  async refreshHowLongToBeatData(signal?: AbortSignal): Promise<number> {
    return (await this.refreshHowLongToBeatDataDetailed(signal)).updated;
  }

  async refreshHowLongToBeatDataDetailed(
    signal?: AbortSignal,
    onProgress?: HowLongToBeatRefreshProgressHandler
  ): Promise<HowLongToBeatRefreshResult> {
    const games = await this.repository.list();
    const alternateTitles = await this.alternateTitlesByGameId();
    const progress: HowLongToBeatRefreshProgress = {
      status: "starting",
      total: games.length,
      processed: 0,
      updated: 0,
      skipped: 0,
      errors: 0
    };
    await emitProgress(onProgress, progress);

    for (const game of games) {
      if (signal?.aborted) {
        break;
      }
      await this.markSearching(progress, game, onProgress);
      const outcome = await this.refreshGame(game, alternateTitles[game.id] ?? [], progress, signal);
      if (outcome === abortedHowLongToBeatRefresh) {
        break;
      }
      await emitProgress(onProgress, progress);
    }

    this.markCompleted(progress);
    await emitProgress(onProgress, progress);
    return {
      total: progress.total,
      updated: progress.updated,
      skipped: progress.skipped,
      errors: progress.errors
    };
  }

  private async alternateTitlesByGameId(): Promise<Record<number, string[]>> {
    const rows = await this.repository.listAlternateTitles();
    return rows.reduce<Record<number, string[]>>((acc, row) => {
      acc[row.game_id] ??= [];
      acc[row.game_id]!.push(row.title);
      return acc;
    }, {});
  }

  private async markSearching(
    progress: HowLongToBeatRefreshProgress,
    game: GameDto,
    onProgress?: HowLongToBeatRefreshProgressHandler
  ): Promise<void> {
    progress.status = "searching";
    progress.currentGameId = game.id;
    progress.currentGameTitle = game.title;
    delete progress.error;
    await emitProgress(onProgress, progress);
  }

  private async refreshGame(
    game: GameDto,
    alternateTitles: string[],
    progress: HowLongToBeatRefreshProgress,
    signal?: AbortSignal
  ): Promise<"processed" | typeof abortedHowLongToBeatRefresh> {
    try {
      const match = await this.findMatch(game.title, alternateTitles, signal);
      if (signal?.aborted) {
        return abortedHowLongToBeatRefresh;
      }
      if (!match) {
        this.markSkipped(progress);
        return "processed";
      }
      const changed = await this.repository.upsertHowLongToBeatEntry({
        gameId: game.id,
        howLongToBeatId: match.id,
        mainStorySeconds: match.mainStorySeconds,
        mainExtraSeconds: match.mainExtraSeconds,
        completionistSeconds: match.completionistSeconds
      });
      if (changed) {
        this.markUpdated(progress);
      } else {
        this.markSkipped(progress);
      }
    } catch (error) {
      if (signal?.aborted) {
        return abortedHowLongToBeatRefresh;
      }
      this.markError(progress, error);
    }
    return "processed";
  }

  private async findMatch(title: string, alternateTitles: string[], signal?: AbortSignal): Promise<HowLongToBeatGame | null> {
    const titles = uniqueTitles([title, ...alternateTitles]);
    for (const candidateTitle of titles) {
      const results = await this.client.search(candidateTitle, signal);
      const match = selectBestHowLongToBeatResult(candidateTitle, results);
      if (match) {
        return match;
      }
    }
    return null;
  }

  private markUpdated(progress: HowLongToBeatRefreshProgress): void {
    progress.processed++;
    progress.updated++;
    progress.status = "updated";
  }

  private markSkipped(progress: HowLongToBeatRefreshProgress): void {
    progress.processed++;
    progress.skipped++;
    progress.status = "skipped";
  }

  private markError(progress: HowLongToBeatRefreshProgress, error: unknown): void {
    progress.processed++;
    progress.errors++;
    progress.status = "error";
    progress.error = error instanceof Error ? error.message : String(error);
  }

  private markCompleted(progress: HowLongToBeatRefreshProgress): void {
    progress.status = "completed";
    delete progress.currentGameId;
    delete progress.currentGameTitle;
    delete progress.error;
  }
}

export function selectBestHowLongToBeatResult(title: string, results: HowLongToBeatGame[]): HowLongToBeatGame | null {
  if (!results.length) {
    return null;
  }

  const normalizedTitle = normalizeTitle(title);
  const exact = results.find((result) => normalizeTitle(result.title) === normalizedTitle);
  if (exact) {
    return exact;
  }

  const sortedBySimilarity = results
    .filter((result) => result.similarity !== null)
    .sort((left, right) => (right.similarity ?? 0) - (left.similarity ?? 0));
  if (sortedBySimilarity[0] && (sortedBySimilarity[0].similarity ?? 0) >= 0.65) {
    return sortedBySimilarity[0];
  }

  return results[0] ?? null;
}

export function parseHowLongToBeatResults(body: unknown): HowLongToBeatGame[] {
  return resultRows(body).map(parseHowLongToBeatGame).filter((game): game is HowLongToBeatGame => game !== null);
}

async function emitProgress(
  onProgress: HowLongToBeatRefreshProgressHandler | undefined,
  progress: HowLongToBeatRefreshProgress
): Promise<void> {
  await onProgress?.({ ...progress });
}

function requestHeaders(auth?: HowLongToBeatAuth): HeadersInit {
  return {
    accept: "application/json, text/plain, */*",
    "content-type": "application/json",
    origin: howLongToBeatOrigin,
    referer: `${howLongToBeatOrigin}/`,
    "user-agent":
      "Mozilla/5.0 (X11; Linux x86_64; rv:138.0) Gecko/20100101 Firefox/138.0",
    ...auth?.headers
  };
}

function searchPayload(title: string) {
  return {
    searchType: "games",
    searchTerms: title.trim().split(/\s+/).filter(Boolean),
    searchPage: 1,
    size: 20,
    searchOptions: {
      games: {
        platform: "",
        sortCategory: "popular",
        rangeTime: { min: null, max: null },
        gameplay: { perspective: "", flow: "", genre: "", difficulty: "" },
        modifier: "hide_dlc"
      }
    },
    useCache: true
  };
}

function resultRows(body: unknown): unknown[] {
  if (Array.isArray(body)) {
    return body;
  }
  if (!isRecord(body)) {
    return [];
  }

  for (const key of ["data", "results", "games"]) {
    const value = body[key];
    if (Array.isArray(value)) {
      return value;
    }
    if (isRecord(value)) {
      for (const nestedKey of ["data", "results", "games"]) {
        const nestedValue = value[nestedKey];
        if (Array.isArray(nestedValue)) {
          return nestedValue;
        }
      }
    }
  }

  return [];
}

function parseHowLongToBeatGame(row: unknown): HowLongToBeatGame | null {
  if (!isRecord(row)) {
    return null;
  }

  const id = integerField(row, ["game_id", "gameId", "id"]);
  const title = stringField(row, ["game_name", "gameName", "name", "title"]);
  if (id === null || !title) {
    return null;
  }

  return {
    id,
    title,
    mainStorySeconds: secondsField(row, ["comp_main", "main_story_seconds", "mainStorySeconds"]),
    mainExtraSeconds: secondsField(row, ["comp_plus", "main_extra_seconds", "mainExtraSeconds"]),
    completionistSeconds: secondsField(row, ["comp_100", "completionist_seconds", "completionistSeconds"]),
    similarity: numberField(row, ["similarity"])
  };
}

function uniqueTitles(titles: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const title of titles) {
    const trimmed = title.trim();
    const normalized = normalizeTitle(trimmed);
    if (!trimmed || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    unique.push(trimmed);
  }
  return unique;
}

function integerField(row: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "number" && Number.isInteger(value)) {
      return value;
    }
    if (typeof value === "string" && /^\d+$/.test(value.trim())) {
      return Number.parseInt(value, 10);
    }
  }
  return null;
}

function stringField(row: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function secondsField(row: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = positiveNumber(row[key]);
    if (value !== null) {
      return Math.round(value);
    }
  }
  return null;
}

function numberField(row: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = positiveNumber(row[key]);
    if (value !== null) {
      return value;
    }
  }
  return null;
}

function positiveNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!/^\d+(?:\.\d+)?$/.test(trimmed)) {
      return null;
    }
    const parsed = Number.parseFloat(trimmed);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
