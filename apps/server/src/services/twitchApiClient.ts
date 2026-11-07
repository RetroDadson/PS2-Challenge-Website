import type { TwitchUserLookupDto } from "@ps2-challenge/shared";
import type { AppConfig } from "../config.js";

const twitchTokenUrl = "https://id.twitch.tv/oauth2/token";
export const twitchApiBaseUrl = "https://api.twitch.tv/helix";

type TwitchApiClientOptions = {
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
  data?: Array<{ id?: string; login?: string; display_name?: string; profile_image_url?: string }>;
};

export type TwitchUserLookup = Pick<TwitchApiClient, "getUserByLogin">;

export class TwitchApiClient {
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;
  private token?: TwitchToken;

  constructor(
    private readonly config: Pick<AppConfig, "twitchClientId" | "twitchClientSecret">,
    options: TwitchApiClientOptions = {}
  ) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? (() => new Date());
  }

  get isConfigured(): boolean {
    return Boolean(this.config.twitchClientId && this.config.twitchClientSecret);
  }

  async getUserByLogin(login: string): Promise<TwitchUserLookupDto | null> {
    const url = new URL(`${twitchApiBaseUrl}/users`);
    url.searchParams.set("login", login.trim().toLocaleLowerCase("en-GB"));
    const body = await this.get<TwitchUsersResponse>(url);
    const user = body.data?.[0];
    if (!user?.id) {
      return null;
    }
    return {
      twitchUserId: user.id,
      login: user.login ?? login,
      displayName: user.display_name ?? user.login ?? login,
      profileImageUrl: user.profile_image_url ?? null
    };
  }

  async get<T>(url: URL): Promise<T> {
    const accessToken = await this.getAppAccessToken();
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

  async getAppAccessToken(): Promise<string> {
    const nowMs = this.now().getTime();
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
}
