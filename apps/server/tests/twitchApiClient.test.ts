import { describe, expect, it, vi } from "vitest";
import { TwitchApiClient } from "../src/services/twitchApiClient.js";

const config = { twitchClientId: "client-id", twitchClientSecret: "client-secret" };

describe("TwitchApiClient", () => {
  it("looks up a user by lowercased login and reuses the cached app token", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: "app-token", expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: "1001", login: "viewerone", display_name: "ViewerOne", profile_image_url: "https://img/1.png" }] }))
      .mockResolvedValueOnce(jsonResponse({ data: [] }));
    const client = new TwitchApiClient(config, { fetchImpl: fetchMock as never, now: () => new Date("2026-11-07T12:00:00Z") });

    expect(client.isConfigured).toBe(true);
    await expect(client.getUserByLogin(" ViewerOne ")).resolves.toEqual({
      twitchUserId: "1001",
      login: "viewerone",
      displayName: "ViewerOne",
      profileImageUrl: "https://img/1.png"
    });
    await expect(client.getUserByLogin("nobody")).resolves.toBeNull();

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1]![0].href).toBe("https://api.twitch.tv/helix/users?login=viewerone");
    expect(fetchMock.mock.calls[1]![1].headers).toEqual({ Authorization: "Bearer app-token", "Client-Id": "client-id" });
  });

  it("falls back to the login when Twitch omits optional fields", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: "app-token", expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: "1001" }] }));
    const client = new TwitchApiClient(config, { fetchImpl: fetchMock as never });

    await expect(client.getUserByLogin("viewerone")).resolves.toEqual({
      twitchUserId: "1001",
      login: "viewerone",
      displayName: "viewerone",
      profileImageUrl: null
    });
  });

  it("refreshes expired tokens and reports Twitch failures", async () => {
    let now = new Date("2026-11-07T12:00:00Z");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: "first", expires_in: 120 }))
      .mockResolvedValueOnce(jsonResponse({ access_token: "second", expires_in: 3600 }))
      .mockResolvedValueOnce(new Response("", { status: 500 }));
    const client = new TwitchApiClient(config, { fetchImpl: fetchMock as never, now: () => now });

    await expect(client.getAppAccessToken()).resolves.toBe("first");
    now = new Date("2026-11-07T12:01:00Z");
    await expect(client.getAppAccessToken()).resolves.toBe("second");
    await expect(client.get(new URL("https://api.twitch.tv/helix/users"))).rejects.toThrow("Twitch API request failed: 500");
  });

  it("rejects failed or empty token responses", async () => {
    const failing = new TwitchApiClient(config, { fetchImpl: vi.fn().mockResolvedValue(new Response("", { status: 401 })) as never });
    await expect(failing.getAppAccessToken()).rejects.toThrow("Twitch app token request failed: 401");

    const empty = new TwitchApiClient(config, { fetchImpl: vi.fn().mockResolvedValue(jsonResponse({})) as never });
    await expect(empty.getAppAccessToken()).rejects.toThrow("did not include an access token");

    expect(new TwitchApiClient({ twitchClientId: "", twitchClientSecret: "" }).isConfigured).toBe(false);
  });
});

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}
