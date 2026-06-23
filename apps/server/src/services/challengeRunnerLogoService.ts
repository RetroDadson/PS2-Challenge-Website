import type { ChallengeRunnerInput } from "@ps2-challenge/shared";
import type { AppConfig } from "../config.js";

const twitchTokenUrl = "https://id.twitch.tv/oauth2/token";
const twitchUsersUrl = "https://api.twitch.tv/helix/users";
const youtubeChannelsUrl = "https://www.googleapis.com/youtube/v3/channels";

type ChallengeRunnerLogoServiceOptions = {
  fetchImpl?: typeof fetch;
  now?: () => number;
};

type TwitchTokenResponse = {
  access_token?: string;
  expires_in?: number;
};

type TwitchUsersResponse = {
  data?: Array<{ profile_image_url?: string }>;
};

type YouTubeChannelsResponse = {
  items?: Array<{
    snippet?: {
      thumbnails?: Record<string, { url?: string }>;
    };
  }>;
};

type CachedToken = {
  value: string;
  expiresAt: number;
};

export class ChallengeRunnerLogoLookupError extends Error {
  constructor(message: string, readonly statusCode: 400 | 502 | 503) {
    super(message);
    this.name = "ChallengeRunnerLogoLookupError";
  }
}

export class ChallengeRunnerLogoService {
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private twitchToken?: CachedToken;

  constructor(
    private readonly config: Pick<AppConfig, "twitchClientId" | "twitchClientSecret" | "youtubeApiKey">,
    options: ChallengeRunnerLogoServiceOptions = {}
  ) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? Date.now;
  }

  async resolveLogo(input: ChallengeRunnerInput): Promise<string> {
    if (input.twitchUrl) {
      return this.resolveTwitchLogo(input.twitchUrl);
    }
    if (input.youtubeUrl) {
      return this.resolveYouTubeLogo(input.youtubeUrl);
    }
    throw new ChallengeRunnerLogoLookupError("A Twitch or YouTube URL is required to load a logo", 400);
  }

  private async resolveTwitchLogo(channelUrl: string): Promise<string> {
    const login = channelPathSegment(channelUrl);
    if (!login) {
      throw new ChallengeRunnerLogoLookupError("The Twitch URL does not identify a channel", 400);
    }
    if (!this.config.twitchClientId || !this.config.twitchClientSecret) {
      throw new ChallengeRunnerLogoLookupError("Twitch credentials are not configured", 503);
    }

    const accessToken = await this.getTwitchToken();
    const url = new URL(twitchUsersUrl);
    url.searchParams.set("login", login);
    const response = await this.fetchImpl(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Client-ID": this.config.twitchClientId
      }
    });
    if (!response.ok) {
      throw new ChallengeRunnerLogoLookupError(`Twitch channel lookup failed with status ${response.status}`, 502);
    }
    const body = (await response.json()) as TwitchUsersResponse;
    const logoUrl = body.data?.[0]?.profile_image_url;
    if (!logoUrl) {
      throw new ChallengeRunnerLogoLookupError("The Twitch channel could not be found", 400);
    }
    return logoUrl;
  }

  private async getTwitchToken(): Promise<string> {
    const now = this.now();
    if (this.twitchToken && this.twitchToken.expiresAt > now + 30_000) {
      return this.twitchToken.value;
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
      throw new ChallengeRunnerLogoLookupError(`Twitch authentication failed with status ${response.status}`, 502);
    }
    const body = (await response.json()) as TwitchTokenResponse;
    if (!body.access_token) {
      throw new ChallengeRunnerLogoLookupError("Twitch authentication did not return an access token", 502);
    }
    this.twitchToken = {
      value: body.access_token,
      expiresAt: now + Math.max(0, (body.expires_in ?? 0) - 60) * 1000
    };
    return body.access_token;
  }

  private async resolveYouTubeLogo(channelUrl: string): Promise<string> {
    if (!this.config.youtubeApiKey) {
      throw new ChallengeRunnerLogoLookupError("YOUTUBE_API_KEY is required to load YouTube channel logos", 503);
    }
    const channelQuery = youtubeChannelQuery(channelUrl);
    if (!channelQuery) {
      throw new ChallengeRunnerLogoLookupError("Use a YouTube @handle, /channel/, or /user/ URL", 400);
    }

    const url = new URL(youtubeChannelsUrl);
    url.searchParams.set("part", "snippet");
    url.searchParams.set(channelQuery.parameter, channelQuery.value);
    url.searchParams.set("key", this.config.youtubeApiKey);
    const response = await this.fetchImpl(url);
    if (!response.ok) {
      throw new ChallengeRunnerLogoLookupError(`YouTube channel lookup failed with status ${response.status}`, 502);
    }
    const body = (await response.json()) as YouTubeChannelsResponse;
    const thumbnails = body.items?.[0]?.snippet?.thumbnails;
    const logoUrl = thumbnails?.high?.url ?? thumbnails?.medium?.url ?? thumbnails?.default?.url;
    if (!logoUrl) {
      throw new ChallengeRunnerLogoLookupError("The YouTube channel could not be found", 400);
    }
    return logoUrl;
  }
}

function channelPathSegment(channelUrl: string): string | null {
  return new URL(channelUrl).pathname.split("/").find((segment) => segment.length > 0)?.toLocaleLowerCase("en-GB") ?? null;
}

function youtubeChannelQuery(channelUrl: string): { parameter: "id" | "forHandle" | "forUsername"; value: string } | null {
  const segments = new URL(channelUrl).pathname.split("/").filter(Boolean);
  const first = segments[0];
  if (first?.startsWith("@") && first.length > 1) {
    return { parameter: "forHandle", value: first.slice(1) };
  }
  if (first === "channel" && segments[1]) {
    return { parameter: "id", value: segments[1] };
  }
  if (first === "user" && segments[1]) {
    return { parameter: "forUsername", value: segments[1] };
  }
  return null;
}
