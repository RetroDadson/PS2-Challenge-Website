import type { AppConfig } from "../config.js";
import type { TwitchStreamRepository, TwitchVodRecord } from "../repositories/twitchStreamRepository.js";

const twitchTokenUrl = "https://id.twitch.tv/oauth2/token";
const twitchApiBaseUrl = "https://api.twitch.tv/helix";
const weekMilliseconds = 7 * 24 * 60 * 60 * 1000;
export const twitchStreamStatsRangeWeeks = 8;
export const countedStreamMinimumDurationSeconds = 20 * 60;

export type TwitchStreamStats = {
  channelLogin: string;
  rangeStart: string;
  rangeEnd: string;
  rangeWeeks: number;
  totalStreamSeconds: number;
  averageWeeklyStreamSeconds: number;
  vodCount: number;
};

export type TwitchStreamSyncResult = {
  channelLogin: string;
  checked: number;
  upserted: number;
  skipped: number;
};

type TwitchStreamStatsServiceOptions = {
  fetchImpl?: typeof fetch;
  now?: () => Date;
};

type TwitchToken = {
  accessToken: string;
  expiresAtMs: number;
};

type TwitchTokenResponse = {
  access_token?: string;
  expires_in?: number;
};

type TwitchUsersResponse = {
  data?: Array<{ id?: string }>;
};

type TwitchVideosResponse = {
  data?: TwitchVideo[];
  pagination?: {
    cursor?: string;
  };
};

type TwitchVideo = {
  id?: string;
  title?: string;
  url?: string;
  created_at?: string;
  duration?: string;
};

export class TwitchStreamStatsService {
  private readonly config: Pick<AppConfig, "twitchChannelLogin" | "twitchClientId" | "twitchClientSecret">;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;
  private token?: TwitchToken;

  constructor(
    config: Pick<AppConfig, "twitchChannelLogin" | "twitchClientId" | "twitchClientSecret">,
    private readonly repository: Pick<TwitchStreamRepository, "recentAggregate" | "upsertVods">,
    options: TwitchStreamStatsServiceOptions = {}
  ) {
    this.config = {
      ...config,
      twitchChannelLogin: normalizeChannelLogin(config.twitchChannelLogin)
    };
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? (() => new Date());
  }

  async getRecentStreamStats(): Promise<TwitchStreamStats> {
    const now = this.now();
    const rangeEnd = new Date(now);
    const rangeStart = startOfStreamStatsRange(rangeEnd);
    const aggregate = await this.repository.recentAggregate(this.config.twitchChannelLogin, rangeStart, rangeEnd, countedStreamMinimumDurationSeconds);
    return {
      channelLogin: this.config.twitchChannelLogin,
      rangeStart: rangeStart.toISOString(),
      rangeEnd: rangeEnd.toISOString(),
      rangeWeeks: twitchStreamStatsRangeWeeks,
      totalStreamSeconds: aggregate.totalStreamSeconds,
      averageWeeklyStreamSeconds: aggregate.totalStreamSeconds / twitchStreamStatsRangeWeeks,
      vodCount: aggregate.vodCount
    };
  }

  async syncRecentStreams(): Promise<TwitchStreamSyncResult> {
    const now = this.now();
    const rangeStart = startOfStreamStatsRange(now);
    if (!this.config.twitchClientId || !this.config.twitchClientSecret || !this.config.twitchChannelLogin) {
      return {
        channelLogin: this.config.twitchChannelLogin,
        checked: 0,
        upserted: 0,
        skipped: 0
      };
    }

    const token = await this.getAppAccessToken(now.getTime());
    const userId = await this.getUserId(token);
    if (!userId) {
      return {
        channelLogin: this.config.twitchChannelLogin,
        checked: 0,
        upserted: 0,
        skipped: 0
      };
    }

    const videos = await this.getArchiveVideos(token, userId, rangeStart);
    const vods = videos
      .map((video) => this.mapVideoToRecord(video, rangeStart, now))
      .filter((record): record is TwitchVodRecord => record !== null);
    const upserted = await this.repository.upsertVods(vods);

    return {
      channelLogin: this.config.twitchChannelLogin,
      checked: videos.length,
      upserted,
      skipped: videos.length - vods.length
    };
  }

  private mapVideoToRecord(video: TwitchVideo, rangeStart: Date, fetchedAt: Date): TwitchVodRecord | null {
    if (!video.id || !isInRange(video.created_at, rangeStart, fetchedAt)) {
      return null;
    }

    return {
      vodId: video.id,
      channelLogin: this.config.twitchChannelLogin,
      title: video.title ?? null,
      url: video.url ?? null,
      createdAt: new Date(video.created_at!),
      durationSeconds: parseTwitchDuration(video.duration),
      fetchedAt
    };
  }

  private async getAppAccessToken(nowMs: number): Promise<string> {
    if (this.token && this.token.expiresAtMs > nowMs + 30_000) {
      return this.token.accessToken;
    }

    const response = await this.fetchImpl(twitchTokenUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.config.twitchClientId,
        client_secret: this.config.twitchClientSecret,
        grant_type: "client_credentials"
      })
    });
    if (!response.ok) {
      throw new Error(`Twitch app token request failed: ${response.status}`);
    }

    const body = (await response.json()) as TwitchTokenResponse;
    if (!body.access_token) {
      throw new Error("Twitch app token response did not include an access token");
    }

    const expiresInMs = Math.max(0, (body.expires_in ?? 0) - 60) * 1000;
    this.token = {
      accessToken: body.access_token,
      expiresAtMs: nowMs + expiresInMs
    };
    return body.access_token;
  }

  private async getUserId(accessToken: string): Promise<string | null> {
    const url = new URL(`${twitchApiBaseUrl}/users`);
    url.searchParams.set("login", this.config.twitchChannelLogin);
    const body = await this.twitchGet<TwitchUsersResponse>(url, accessToken);
    return body.data?.[0]?.id ?? null;
  }

  private async getArchiveVideos(accessToken: string, userId: string, rangeStart: Date): Promise<TwitchVideo[]> {
    const videos: TwitchVideo[] = [];
    let cursor: string | undefined;

    for (let page = 0; page < 10; page++) {
      const url = new URL(`${twitchApiBaseUrl}/videos`);
      url.searchParams.set("user_id", userId);
      url.searchParams.set("type", "archive");
      url.searchParams.set("first", "100");
      if (cursor) {
        url.searchParams.set("after", cursor);
      }

      const body = await this.twitchGet<TwitchVideosResponse>(url, accessToken);
      const pageVideos = body.data ?? [];
      videos.push(...pageVideos);

      if (!pageVideos.length || pageVideos.some((video) => isOlderThanRange(video.created_at, rangeStart))) {
        break;
      }

      cursor = body.pagination?.cursor;
      if (!cursor) {
        break;
      }
    }

    return videos;
  }

  private async twitchGet<T>(url: URL, accessToken: string): Promise<T> {
    const response = await this.fetchImpl(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Client-Id": this.config.twitchClientId
      }
    });
    if (!response.ok) {
      throw new Error(`Twitch API request failed: ${response.status}`);
    }
    return (await response.json()) as T;
  }
}

function startOfStreamStatsRange(end: Date): Date {
  return new Date(end.getTime() - twitchStreamStatsRangeWeeks * weekMilliseconds);
}

function isInRange(value: string | undefined, rangeStart: Date, rangeEnd: Date) {
  const time = parseDateTime(value);
  return time !== null && time >= rangeStart.getTime() && time <= rangeEnd.getTime();
}

function isOlderThanRange(value: string | undefined, rangeStart: Date) {
  const time = parseDateTime(value);
  return time !== null && time < rangeStart.getTime();
}

function parseDateTime(value: string | undefined): number | null {
  if (!value) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function parseTwitchDuration(value: string | undefined): number {
  if (!value) {
    return 0;
  }
  const match = /^(?:(\d+)d)?(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(value.trim());
  if (!match) {
    return 0;
  }
  const days = Number.parseInt(match[1] ?? "0", 10);
  const hours = Number.parseInt(match[2] ?? "0", 10);
  const minutes = Number.parseInt(match[3] ?? "0", 10);
  const seconds = Number.parseInt(match[4] ?? "0", 10);
  return ((days * 24 + hours) * 60 + minutes) * 60 + seconds;
}

function normalizeChannelLogin(value: string | undefined) {
  return value?.trim().toLocaleLowerCase("en-GB") || "retrodadson";
}
