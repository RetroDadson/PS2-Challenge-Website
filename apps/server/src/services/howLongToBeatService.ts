import { setTimeout as wait } from "node:timers/promises";
import type { GameDto } from "@ps2-challenge/shared";
import { normalizeTitle } from "@ps2-challenge/shared";
import type { Kysely } from "kysely";
import type pg from "pg";
import { createKyselyFromPool, type Database } from "../db/kysely.js";
import { GameRepository } from "../repositories/gameRepository.js";
import { errorMessage } from "../utils/errors.js";

type FetchHowLongToBeat = (input: string, init?: RequestInit) => Promise<Response>;
const howLongToBeatOrigin = "https://howlongtobeat.com";
const howLongToBeatSearchEndpoint = `${howLongToBeatOrigin}/api/bleed`;
const abortedHowLongToBeatRefresh = Symbol("abortedHowLongToBeatRefresh");
const haltedHowLongToBeatRefresh = Symbol("haltedHowLongToBeatRefresh");
const howLongToBeatRefreshLockKey = 710_621_846;
const defaultMatchedRefreshIntervalMs = 30 * 24 * 60 * 60 * 1000;
const defaultNotFoundRetryIntervalMs = 30 * 24 * 60 * 60 * 1000;
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
  status: "starting" | "searching" | "updated" | "unchanged" | "notFound" | "error" | "completed";
  total: number;
  processed: number;
  updated: number;
  unchanged: number;
  notFound: number;
  errors: number;
  currentGameId?: number;
  currentGameTitle?: string;
  error?: string;
};

export type HowLongToBeatRefreshResult = {
  total: number;
  updated: number;
  unchanged: number;
  notFound: number;
  errors: number;
};

export type HowLongToBeatDueRefreshResult = HowLongToBeatRefreshResult & {
  remainingDue: number;
  halted: boolean;
};

export type HowLongToBeatRefreshOptions = {
  requestDelayMs?: number;
  useAdvisoryLock?: boolean;
  matchedRefreshIntervalMs?: number;
  notFoundRetryIntervalMs?: number;
};

export type HowLongToBeatRefreshProgressHandler = (progress: HowLongToBeatRefreshProgress) => void | Promise<void>;

export class HowLongToBeatClient {
  private auth: HowLongToBeatAuth | null = null;
  private nextRequestAt = 0;

  constructor(
    private readonly fetchHowLongToBeat: FetchHowLongToBeat = globalThis.fetch.bind(globalThis),
    private readonly requestDelayMs = 0
  ) {}

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
      throw new HowLongToBeatRequestError(
        `HowLongToBeat search returned HTTP ${response.status}`,
        response.status === 403 || response.status === 429 || response.status >= 500
      );
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
    const response = await this.request(`${howLongToBeatSearchEndpoint}/init?t=${Date.now()}`, init, signal);
    if (!response.ok) {
      throw new HowLongToBeatRequestError(`HowLongToBeat auth init returned HTTP ${response.status}`, true);
    }

    const body: unknown = await response.json();
    if (!isRecord(body)) {
      throw new HowLongToBeatRequestError("HowLongToBeat auth init returned an invalid payload", true);
    }

    const token = stringField(body, ["token"]);
    const hpKey = stringField(body, ["hpKey"]);
    const hpVal = stringField(body, ["hpVal"]);
    if (!token || !hpKey || !hpVal) {
      throw new HowLongToBeatRequestError("HowLongToBeat auth init did not include the expected token values", true);
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
    return this.request(howLongToBeatSearchEndpoint, init, signal);
  }

  private async request(input: string, init: RequestInit, signal?: AbortSignal): Promise<Response> {
    const delayMs = Math.max(0, this.nextRequestAt - Date.now());
    if (delayMs > 0) {
      await wait(delayMs, undefined, { signal });
    }
    this.nextRequestAt = Date.now() + Math.max(0, this.requestDelayMs);
    return this.fetchHowLongToBeat(input, init);
  }
}

class HowLongToBeatRequestError extends Error {
  constructor(
    message: string,
    readonly haltBatch: boolean
  ) {
    super(message);
    this.name = "HowLongToBeatRequestError";
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
  private readonly options: Required<HowLongToBeatRefreshOptions>;

  constructor(
    private readonly pool: pg.Pool,
    fetchHowLongToBeat?: FetchHowLongToBeat,
    db?: Kysely<Database>,
    options: HowLongToBeatRefreshOptions = {}
  ) {
    const database = db ?? createKyselyFromPool(pool);
    this.options = {
      requestDelayMs: options.requestDelayMs ?? 0,
      useAdvisoryLock: options.useAdvisoryLock ?? true,
      matchedRefreshIntervalMs: options.matchedRefreshIntervalMs ?? defaultMatchedRefreshIntervalMs,
      notFoundRetryIntervalMs: options.notFoundRetryIntervalMs ?? defaultNotFoundRetryIntervalMs
    };
    this.repository = new GameRepository(database);
    this.client = new HowLongToBeatClient(fetchHowLongToBeat, this.options.requestDelayMs);
  }

  async refreshHowLongToBeatData(signal?: AbortSignal): Promise<number> {
    return (await this.refreshHowLongToBeatDataDetailed(signal)).updated;
  }

  async refreshHowLongToBeatDataDetailed(
    signal?: AbortSignal,
    onProgress?: HowLongToBeatRefreshProgressHandler
  ): Promise<HowLongToBeatRefreshResult> {
    return this.withRefreshLock(async () => {
      await this.repository.ensureHowLongToBeatSyncStates();
      const games = await this.repository.list();
      return (await this.refreshGames(games, signal, onProgress)).result;
    });
  }

  async refreshDueHowLongToBeatDataDetailed(
    batchSize = 100,
    signal?: AbortSignal,
    onProgress?: HowLongToBeatRefreshProgressHandler
  ): Promise<HowLongToBeatDueRefreshResult> {
    return this.withRefreshLock(async () => {
      const games = await this.repository.listDueHowLongToBeatGames(batchSize);
      const refresh = await this.refreshGames(games, signal, onProgress);
      return {
        ...refresh.result,
        remainingDue: await this.repository.countDueHowLongToBeatGames(),
        halted: refresh.halted
      };
    });
  }

  private async refreshGames(
    games: GameDto[],
    signal?: AbortSignal,
    onProgress?: HowLongToBeatRefreshProgressHandler
  ): Promise<{ result: HowLongToBeatRefreshResult; halted: boolean }> {
    const alternateTitles = await this.alternateTitlesByGameId();
    const progress: HowLongToBeatRefreshProgress = {
      status: "starting",
      total: games.length,
      processed: 0,
      updated: 0,
      unchanged: 0,
      notFound: 0,
      errors: 0
    };
    await emitProgress(onProgress, progress);

    let halted = false;
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
      if (outcome === haltedHowLongToBeatRefresh) {
        halted = true;
        break;
      }
    }

    this.markCompleted(progress);
    await emitProgress(onProgress, progress);
    return {
      result: {
        total: progress.total,
        updated: progress.updated,
        unchanged: progress.unchanged,
        notFound: progress.notFound,
        errors: progress.errors
      },
      halted
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
  ): Promise<"processed" | typeof abortedHowLongToBeatRefresh | typeof haltedHowLongToBeatRefresh> {
    try {
      const match = await this.findMatch(game.title, alternateTitles, signal);
      if (signal?.aborted) {
        return abortedHowLongToBeatRefresh;
      }
      if (!match) {
        await this.repository.recordHowLongToBeatNotFound(game.id, this.nextSyncTiming(this.options.notFoundRetryIntervalMs));
        this.markNotFound(progress);
        return "processed";
      }
      const changed = await this.repository.upsertHowLongToBeatEntry(
        {
          gameId: game.id,
          howLongToBeatId: match.id,
          mainStorySeconds: match.mainStorySeconds,
          mainExtraSeconds: match.mainExtraSeconds,
          completionistSeconds: match.completionistSeconds
        },
        this.nextSyncTiming(this.options.matchedRefreshIntervalMs)
      );
      if (changed) {
        this.markUpdated(progress);
      } else {
        this.markUnchanged(progress);
      }
    } catch (error) {
      if (signal?.aborted) {
        return abortedHowLongToBeatRefresh;
      }
      await this.repository.recordHowLongToBeatError(game.id, errorMessage(error));
      this.markError(progress, error);
      if (error instanceof HowLongToBeatRequestError && error.haltBatch) {
        return haltedHowLongToBeatRefresh;
      }
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

  private markUnchanged(progress: HowLongToBeatRefreshProgress): void {
    progress.processed++;
    progress.unchanged++;
    progress.status = "unchanged";
  }

  private markNotFound(progress: HowLongToBeatRefreshProgress): void {
    progress.processed++;
    progress.notFound++;
    progress.status = "notFound";
  }

  private markError(progress: HowLongToBeatRefreshProgress, error: unknown): void {
    progress.processed++;
    progress.errors++;
    progress.status = "error";
    progress.error = errorMessage(error);
  }

  private markCompleted(progress: HowLongToBeatRefreshProgress): void {
    progress.status = "completed";
    delete progress.currentGameId;
    delete progress.currentGameTitle;
    delete progress.error;
  }

  private nextSyncTiming(intervalMs: number): { attemptedAt: Date; nextAttemptAt: Date } {
    const attemptedAt = new Date();
    return { attemptedAt, nextAttemptAt: new Date(attemptedAt.getTime() + intervalMs) };
  }

  private async withRefreshLock<T>(refresh: () => Promise<T>): Promise<T> {
    if (!this.options.useAdvisoryLock) {
      return refresh();
    }

    const connection = await this.pool.connect();
    let acquired = false;
    try {
      const lock = await connection.query<{ acquired: boolean }>("SELECT pg_try_advisory_lock($1) AS acquired", [howLongToBeatRefreshLockKey]);
      acquired = lock.rows[0]?.acquired === true;
      if (!acquired) {
        throw new Error("A HowLongToBeat refresh is already running");
      }
      return await refresh();
    } finally {
      if (acquired) {
        await connection.query("SELECT pg_advisory_unlock($1)", [howLongToBeatRefreshLockKey]);
      }
      connection.release();
    }
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
