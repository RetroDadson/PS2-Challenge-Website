import { describe, expect, it, vi } from "vitest";
import { ChallengeRunnerLogoLookupError, ChallengeRunnerLogoService } from "../src/services/challengeRunnerLogoService.js";

describe("ChallengeRunnerLogoService", () => {
  it("uses the Twitch profile image when both channel URLs are present", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ access_token: "app-token", expires_in: 3600 }))
      .mockResolvedValueOnce(json({ data: [{ profile_image_url: "https://static-cdn.jtvnw.net/runner.png" }] }))
      .mockResolvedValueOnce(json({ data: [{ profile_image_url: "https://static-cdn.jtvnw.net/runner.png" }] }));
    const service = createService(fetchMock);

    const logoUrl = await service.resolveLogo({
      name: "Runner",
      description: "Challenge",
      twitchUrl: "https://www.twitch.tv/RunnerOne",
      youtubeUrl: "https://www.youtube.com/@runnerone"
    });

    expect(logoUrl).toBe("https://static-cdn.jtvnw.net/runner.png");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("login=runnerone");
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("googleapis.com"))).toBe(false);

    await service.resolveLogo({
      name: "Runner",
      description: "Challenge",
      twitchUrl: "https://www.twitch.tv/RunnerOne",
      youtubeUrl: null
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("uses a YouTube channel thumbnail when no Twitch URL is present", async () => {
    const fetchMock = vi.fn(async () => json({
      items: [{ snippet: { thumbnails: { default: { url: "https://yt.example/default.png" }, high: { url: "https://yt.example/high.png" } } } }]
    }));
    const service = createService(fetchMock);

    const logoUrl = await service.resolveLogo({
      name: "Runner",
      description: "Challenge",
      twitchUrl: null,
      youtubeUrl: "https://www.youtube.com/@RunnerOne/videos"
    });

    expect(logoUrl).toBe("https://yt.example/high.png");
    const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestUrl.searchParams.get("forHandle")).toBe("RunnerOne");
    expect(requestUrl.searchParams.get("part")).toBe("snippet");
    expect(requestUrl.searchParams.get("key")).toBe("youtube-key");
  });

  it.each([
    ["https://www.youtube.com/channel/UC123", "id", "UC123"],
    ["https://www.youtube.com/user/LegacyRunner", "forUsername", "LegacyRunner"]
  ])("supports YouTube channel URL %s", async (youtubeUrl, parameter, value) => {
    const fetchMock = vi.fn(async () => json({ items: [{ snippet: { thumbnails: { medium: { url: "https://yt.example/logo.png" } } } }] }));
    const service = createService(fetchMock);

    await service.resolveLogo({ name: "Runner", description: "Challenge", twitchUrl: null, youtubeUrl });

    expect(new URL(String(fetchMock.mock.calls[0]?.[0])).searchParams.get(parameter)).toBe(value);
  });

  it("returns actionable errors for missing configuration, channels, and upstream failures", async () => {
    const noYouTubeKey = new ChallengeRunnerLogoService({ twitchClientId: "client", twitchClientSecret: "secret", youtubeApiKey: "" });
    await expect(noYouTubeKey.resolveLogo({
      name: "Runner",
      description: "Challenge",
      twitchUrl: null,
      youtubeUrl: "https://www.youtube.com/@runner"
    })).rejects.toMatchObject({ statusCode: 503 });

    const noTwitchCredentials = new ChallengeRunnerLogoService({ twitchClientId: "", twitchClientSecret: "", youtubeApiKey: "youtube-key" });
    await expect(noTwitchCredentials.resolveLogo({
      name: "Runner",
      description: "Challenge",
      twitchUrl: "https://www.twitch.tv/runner",
      youtubeUrl: null
    })).rejects.toMatchObject({ statusCode: 503 });

    const invalidYouTube = createService(vi.fn());
    await expect(invalidYouTube.resolveLogo({
      name: "Runner",
      description: "Challenge",
      twitchUrl: null,
      youtubeUrl: "https://www.youtube.com/c/Runner"
    })).rejects.toMatchObject({ statusCode: 400 });

    const upstreamFailure = createService(vi.fn(async () => new Response(null, { status: 429 })));
    await expect(upstreamFailure.resolveLogo({
      name: "Runner",
      description: "Challenge",
      twitchUrl: null,
      youtubeUrl: "https://www.youtube.com/@runner"
    })).rejects.toEqual(new ChallengeRunnerLogoLookupError("YouTube channel lookup failed with status 429", 502));

    const twitchAuthenticationFailure = createService(vi.fn(async () => new Response(null, { status: 401 })));
    await expect(twitchAuthenticationFailure.resolveLogo({
      name: "Runner",
      description: "Challenge",
      twitchUrl: "https://www.twitch.tv/runner",
      youtubeUrl: null
    })).rejects.toMatchObject({ statusCode: 502, message: "Twitch authentication failed with status 401" });

    const missingTwitchToken = createService(vi.fn(async () => json({})));
    await expect(missingTwitchToken.resolveLogo({
      name: "Runner",
      description: "Challenge",
      twitchUrl: "https://www.twitch.tv/runner",
      youtubeUrl: null
    })).rejects.toMatchObject({ statusCode: 502, message: "Twitch authentication did not return an access token" });

    const missingTwitchProfile = createService(vi.fn()
      .mockResolvedValueOnce(json({ access_token: "token", expires_in: 3600 }))
      .mockResolvedValueOnce(json({ data: [] })));
    await expect(missingTwitchProfile.resolveLogo({
      name: "Runner",
      description: "Challenge",
      twitchUrl: "https://www.twitch.tv/runner",
      youtubeUrl: null
    })).rejects.toMatchObject({ statusCode: 400, message: "The Twitch channel could not be found" });

    const missingYouTubeThumbnail = createService(vi.fn(async () => json({ items: [] })));
    await expect(missingYouTubeThumbnail.resolveLogo({
      name: "Runner",
      description: "Challenge",
      twitchUrl: null,
      youtubeUrl: "https://www.youtube.com/@runner"
    })).rejects.toMatchObject({ statusCode: 400, message: "The YouTube channel could not be found" });
  });
});

function createService(fetchImpl: ReturnType<typeof vi.fn>) {
  return new ChallengeRunnerLogoService(
    { twitchClientId: "client-id", twitchClientSecret: "client-secret", youtubeApiKey: "youtube-key" },
    { fetchImpl: fetchImpl as typeof fetch, now: () => 1_000 }
  );
}

function json(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}
