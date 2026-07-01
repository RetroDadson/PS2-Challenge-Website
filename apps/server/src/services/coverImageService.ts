import type { Kysely } from "kysely";
import type pg from "pg";
import type { GameDto } from "@ps2-challenge/shared";
import { createKyselyFromPool, type Database } from "../db/kysely.js";
import { errorMessage } from "../utils/errors.js";
import { GameService } from "./gameService.js";

const coverRepositoryPath = "https://raw.githubusercontent.com/xlenore/ps2-covers/main/covers/default";
const coverRepositoryUrl = new URL(coverRepositoryPath);
const coverRepositoryPathPrefix = `${coverRepositoryUrl.pathname.replace(/\/$/, "")}/`;

export type CoverUrlStatus = "exists" | "missing" | "unknown";
type FetchCover = (input: string, init?: RequestInit) => Promise<Response>;
const abortedCoverRefresh = Symbol("abortedCoverRefresh");

export type CoverImageRefreshProgress = {
  status: "starting" | "checking" | "updated" | "skipped" | "error" | "completed";
  total: number;
  processed: number;
  updated: number;
  skipped: number;
  errors: number;
  currentGameId?: number;
  currentGameTitle?: string;
  error?: string;
};

export type CoverImageRefreshResult = {
  total: number;
  updated: number;
  skipped: number;
  errors: number;
};

export type CoverImageRefreshProgressHandler = (progress: CoverImageRefreshProgress) => void | Promise<void>;

export class GameCoverService {
  private readonly db: Kysely<Database>;

  constructor(
    pool: pg.Pool,
    private readonly fetchCover: FetchCover = globalThis.fetch.bind(globalThis),
    db?: Kysely<Database>
  ) {
    this.db = db ?? createKyselyFromPool(pool);
  }

  async getCoverUrl(gameId: number): Promise<string | null> {
    const rows = await this.db
      .selectFrom("game_serial_numbers")
      .select(["serial_number", "region"])
      .where("game_id", "=", gameId)
      .execute();
    const sortedRows = [...rows].sort((left, right) => regionPriority(left.region) - regionPriority(right.region));
    const serial = sortedRows[0]?.serial_number;
    return serial ? `${coverRepositoryPath}/${serial.trim().toUpperCase()}.jpg` : null;
  }

  async getCoverUrls(gameIds: number[]): Promise<Record<number, string>> {
    const entries = await Promise.all(gameIds.map(async (id) => [id, await this.getCoverUrl(id)] as const));
    return Object.fromEntries(entries.filter((entry): entry is readonly [number, string] => !!entry[1]));
  }

  async checkCoverUrl(url: string, signal?: AbortSignal): Promise<CoverUrlStatus> {
    if (!isAllowedCoverRepositoryUrl(url)) {
      return "unknown";
    }
    try {
      const headResponse = await this.fetchCover(url, requestInit("HEAD", signal)); // NOSONAR - URL is allow-listed by isAllowedCoverRepositoryUrl before the request.
      if (shouldRetryWithRangedGet(headResponse)) {
        return this.checkCoverUrlWithRangedGet(url, signal);
      }
      return coverStatusFromResponse(headResponse);
    } catch {
      return "unknown";
    }
  }

  private async checkCoverUrlWithRangedGet(url: string, signal?: AbortSignal): Promise<CoverUrlStatus> {
    try {
      const response = await this.fetchCover(url, requestInit("GET", signal, { Range: "bytes=0-0" })); // NOSONAR - URL is allow-listed by isAllowedCoverRepositoryUrl before the request.
      try {
        await response.body?.cancel();
      } catch {
        // The existence check is already decided from the response headers.
      }
      return coverStatusFromResponse(response);
    } catch {
      return "unknown";
    }
  }
}

export class CoverImageRefreshService {
  private readonly gameService: GameService;
  private readonly coverService: GameCoverService;

  constructor(pool: pg.Pool, fetchCover?: FetchCover, db?: Kysely<Database>) {
    this.gameService = new GameService(pool, db);
    this.coverService = new GameCoverService(pool, fetchCover, db);
  }

  async refreshCoverImages(signal?: AbortSignal): Promise<number> {
    return (await this.refreshCoverImagesDetailed(signal)).updated;
  }

  async refreshCoverImagesDetailed(signal?: AbortSignal, onProgress?: CoverImageRefreshProgressHandler): Promise<CoverImageRefreshResult> {
    const games = await this.gameService.list();
    const progress: CoverImageRefreshProgress = {
      status: "starting",
      total: games.length,
      processed: 0,
      updated: 0,
      skipped: 0,
      errors: 0
    };
    await emitProgress(onProgress, progress);

    const urls = await this.coverService.getCoverUrls(games.map((game) => game.id));
    for (const game of games) {
      if (signal?.aborted) {
        break;
      }
      await this.markChecking(progress, game, onProgress);

      const outcome = await this.refreshGameCover(game, urls[game.id] ?? null, progress, signal);
      if (outcome === abortedCoverRefresh) {
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

  private async markChecking(
    progress: CoverImageRefreshProgress,
    game: GameDto,
    onProgress?: CoverImageRefreshProgressHandler
  ): Promise<void> {
    progress.status = "checking";
    progress.currentGameId = game.id;
    progress.currentGameTitle = game.title;
    delete progress.error;
    await emitProgress(onProgress, progress);
  }

  private async refreshGameCover(
    game: GameDto,
    candidateUrl: string | null,
    progress: CoverImageRefreshProgress,
    signal?: AbortSignal
  ): Promise<"processed" | typeof abortedCoverRefresh> {
    try {
      const nextUrl = await this.resolveCoverUrl(game, candidateUrl, signal);
      if (nextUrl === abortedCoverRefresh) {
        return abortedCoverRefresh;
      }
      await this.applyCoverRefresh(game, nextUrl, progress);
    } catch (error) {
      this.markRefreshError(progress, error);
    }
    return "processed";
  }

  private async resolveCoverUrl(
    game: GameDto,
    candidateUrl: string | null,
    signal?: AbortSignal
  ): Promise<string | null | typeof abortedCoverRefresh> {
    if (!candidateUrl) {
      return null;
    }

    const coverStatus = await this.coverService.checkCoverUrl(candidateUrl, signal);
    if (signal?.aborted) {
      return abortedCoverRefresh;
    }
    if (coverStatus === "missing") {
      return null;
    }
    return coverStatus === "unknown" ? game.imageUrl ?? null : candidateUrl;
  }

  private async applyCoverRefresh(game: GameDto, nextUrl: string | null, progress: CoverImageRefreshProgress): Promise<void> {
    progress.processed++;
    if (game.imageUrl !== nextUrl) {
      await this.gameService.updateGameCoverUrl(game.id, nextUrl);
      progress.updated++;
      progress.status = "updated";
      return;
    }

    progress.skipped++;
    progress.status = "skipped";
  }

  private markRefreshError(progress: CoverImageRefreshProgress, error: unknown): void {
    progress.processed++;
    progress.errors++;
    progress.status = "error";
    progress.error = errorMessage(error);
  }

  private markCompleted(progress: CoverImageRefreshProgress): void {
    progress.status = "completed";
    delete progress.currentGameId;
    delete progress.currentGameTitle;
    delete progress.error;
  }
}

async function emitProgress(onProgress: CoverImageRefreshProgressHandler | undefined, progress: CoverImageRefreshProgress): Promise<void> {
  await onProgress?.({ ...progress });
}

function requestInit(method: "GET" | "HEAD", signal?: AbortSignal, headers?: HeadersInit): RequestInit {
  const init: RequestInit = { method };
  if (signal) {
    init.signal = signal;
  }
  if (headers) {
    init.headers = headers;
  }
  return init;
}

function isAllowedCoverRepositoryUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.origin === coverRepositoryUrl.origin && parsed.pathname.startsWith(coverRepositoryPathPrefix);
  } catch {
    return false;
  }
}

function shouldRetryWithRangedGet(response: Response): boolean {
  return response.status === 405 || response.status === 501;
}

function coverStatusFromResponse(response: Response): CoverUrlStatus {
  if (response.ok) {
    return "exists";
  }
  if (response.status === 404) {
    return "missing";
  }
  return "unknown";
}

function regionPriority(region: string | null): number {
  if (region?.startsWith("NTSC-U")) {
    return 0;
  }
  if (region?.startsWith("PAL")) {
    return 1;
  }
  if (region?.startsWith("NTSC-J")) {
    return 2;
  }
  return 3;
}
