import { describe, expect, it, vi } from "vitest";
import { TwitchStreamStatsService, countedStreamMinimumDurationSeconds, twitchStreamStatsRangeWeeks } from "../src/services/twitchStreamStatsService.js";

describe("TwitchStreamStatsService", () => {
  it("syncs recent archive VOD durations into storage", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: "app-token", expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: "123" }] }))
      .mockResolvedValueOnce(jsonResponse({
        data: [
          { id: "vod-1", title: "June stream", url: "https://twitch.tv/videos/vod-1", created_at: "2026-06-01T19:00:00Z", duration: "2h" },
          { id: "vod-2", title: "May stream", url: "https://twitch.tv/videos/vod-2", created_at: "2026-05-15T19:00:00Z", duration: "1h30m15s" },
          { id: "vod-old", created_at: "2026-03-30T19:00:00Z", duration: "99h" }
        ],
        pagination: {}
      }));
    const repository = {
      recentAggregate: vi.fn(),
      upsertVods: vi.fn(async (vods: unknown[]) => vods.length)
    };
    const service = new TwitchStreamStatsService(
      { twitchChannelLogin: "retrodadson", twitchClientId: "client-id", twitchClientSecret: "client-secret" },
      repository,
      { fetchImpl: fetchMock as never, now: () => new Date("2026-06-03T12:00:00Z") }
    );

    const result = await service.syncRecentStreams();

    expect(result).toEqual({
      channelLogin: "retrodadson",
      checked: 3,
      upserted: 2,
      skipped: 1
    });
    expect(repository.upsertVods).toHaveBeenCalledWith([
      {
        vodId: "vod-1",
        channelLogin: "retrodadson",
        title: "June stream",
        url: "https://twitch.tv/videos/vod-1",
        createdAt: new Date("2026-06-01T19:00:00Z"),
        durationSeconds: 7_200,
        fetchedAt: new Date("2026-06-03T12:00:00Z")
      },
      {
        vodId: "vod-2",
        channelLogin: "retrodadson",
        title: "May stream",
        url: "https://twitch.tv/videos/vod-2",
        createdAt: new Date("2026-05-15T19:00:00Z"),
        durationSeconds: 5_415,
        fetchedAt: new Date("2026-06-03T12:00:00Z")
      }
    ]);
    expect(fetchMock).toHaveBeenNthCalledWith(2, expect.objectContaining({ href: expect.stringContaining("login=retrodadson") }), expect.any(Object));
    expect(fetchMock).toHaveBeenNthCalledWith(3, expect.objectContaining({ href: expect.stringContaining("type=archive") }), expect.any(Object));
  });

  it("averages persisted VOD time over the last eight weeks while excluding short streams", async () => {
    const repository = {
      recentAggregate: vi.fn(async () => ({ totalStreamSeconds: 12_615, vodCount: 2 })),
      upsertVods: vi.fn()
    };
    const service = new TwitchStreamStatsService(
      { twitchChannelLogin: "RetroDadson", twitchClientId: "client-id", twitchClientSecret: "client-secret" },
      repository,
      { now: () => new Date("2026-06-03T12:00:00Z") }
    );

    const stats = await service.getRecentStreamStats();

    expect(repository.recentAggregate).toHaveBeenCalledWith(
      "retrodadson",
      new Date("2026-04-08T12:00:00Z"),
      new Date("2026-06-03T12:00:00Z"),
      countedStreamMinimumDurationSeconds
    );
    expect(stats).toEqual(expect.objectContaining({
      channelLogin: "retrodadson",
      rangeStart: "2026-04-08T12:00:00.000Z",
      rangeEnd: "2026-06-03T12:00:00.000Z",
      totalStreamSeconds: 12_615,
      vodCount: 2
    }));
    expect(stats.rangeWeeks).toBe(twitchStreamStatsRangeWeeks);
    expect(stats.averageWeeklyStreamSeconds).toBeCloseTo(12_615 / twitchStreamStatsRangeWeeks);
  });

  it("reads the aggregate fresh so scheduled syncs are visible immediately", async () => {
    const repository = {
      recentAggregate: vi
        .fn()
        .mockResolvedValueOnce({ totalStreamSeconds: 0, vodCount: 0 })
        .mockResolvedValueOnce({ totalStreamSeconds: 28_800, vodCount: 4 }),
      upsertVods: vi.fn()
    };
    const service = new TwitchStreamStatsService(
      { twitchChannelLogin: "retrodadson", twitchClientId: "client-id", twitchClientSecret: "client-secret" },
      repository,
      { now: () => new Date("2026-06-03T12:00:00Z") }
    );

    expect((await service.getRecentStreamStats()).totalStreamSeconds).toBe(0);
    expect((await service.getRecentStreamStats()).totalStreamSeconds).toBe(28_800);
    expect(repository.recentAggregate).toHaveBeenCalledTimes(2);
  });

  it("skips Twitch API calls when credentials are not configured", async () => {
    const repository = {
      recentAggregate: vi.fn(),
      upsertVods: vi.fn()
    };
    const service = new TwitchStreamStatsService(
      { twitchChannelLogin: "retrodadson", twitchClientId: "", twitchClientSecret: "" },
      repository,
      { now: () => new Date("2026-06-03T12:00:00Z") }
    );

    const result = await service.syncRecentStreams();

    expect(result).toEqual({ channelLogin: "retrodadson", checked: 0, upserted: 0, skipped: 0 });
    expect(repository.upsertVods).not.toHaveBeenCalled();
  });
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}
