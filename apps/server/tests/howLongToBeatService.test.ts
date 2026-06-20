import { afterEach, describe, expect, it, vi } from "vitest";
import { GameRepository } from "../src/repositories/gameRepository.js";
import {
  HowLongToBeatClient,
  HowLongToBeatRefreshService,
  parseHowLongToBeatResults,
  selectBestHowLongToBeatResult
} from "../src/services/howLongToBeatService.js";

describe("HowLongToBeat metadata", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("parses current HowLongToBeat API result rows into cached seconds", () => {
    expect(
      parseHowLongToBeatResults({
        data: [
          {
            game_id: "123",
            game_name: "Amplitude",
            comp_main: 18_000,
            comp_plus: 27_000,
            comp_100: 43_200,
            similarity: 0.96
          }
        ]
      })
    ).toEqual([
      {
        id: 123,
        title: "Amplitude",
        mainStorySeconds: 18_000,
        mainExtraSeconds: 27_000,
        completionistSeconds: 43_200,
        similarity: 0.96
      }
    ]);
  });

  it("selects exact title matches before similarity-ranked matches", () => {
    const results = [
      game(1, "Wrong Game", 0.99),
      game(2, "Final Fantasy X", 0.7)
    ];

    expect(selectBestHowLongToBeatResult("Final Fantasy X", results)?.id).toBe(2);
    expect(selectBestHowLongToBeatResult("Final Fantasy X-2", [game(3, "Close Enough", 0.8)])?.id).toBe(3);
    expect(selectBestHowLongToBeatResult("Missing", [])).toBeNull();
    expect(selectBestHowLongToBeatResult("Fallback", [game(4, "First Result", 0.4)])?.id).toBe(4);
  });

  it("parses supported response wrappers and ignores malformed rows", () => {
    expect(
      parseHowLongToBeatResults({
        results: {
          games: [
            {
              id: 9,
              title: "  ICO  ",
              mainStorySeconds: "123.6",
              main_extra_seconds: 0,
              completionistSeconds: "invalid",
              similarity: "0.75"
            },
            { id: "not-an-id", title: "Invalid" },
            null
          ]
        }
      })
    ).toEqual([
      {
        id: 9,
        title: "ICO",
        mainStorySeconds: 124,
        mainExtraSeconds: null,
        completionistSeconds: null,
        similarity: 0.75
      }
    ]);
    expect(parseHowLongToBeatResults([{ gameId: "10", gameName: "Okami" }])).toEqual([
      {
        id: 10,
        title: "Okami",
        mainStorySeconds: null,
        mainExtraSeconds: null,
        completionistSeconds: null,
        similarity: null
      }
    ]);
    expect(parseHowLongToBeatResults(null)).toEqual([]);
    expect(parseHowLongToBeatResults({ data: { unknown: [] } })).toEqual([]);
  });

  it("initializes HowLongToBeat bleed auth before searching", async () => {
    const fetchHowLongToBeat = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ token: "auth-token", hpKey: "ign_test", hpVal: "hidden-value" }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [{ game_id: 7, game_name: "Rez", comp_main: 7200 }] }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      );

    await expect(new HowLongToBeatClient(fetchHowLongToBeat).search("Rez")).resolves.toEqual([
      {
        id: 7,
        title: "Rez",
        mainStorySeconds: 7200,
        mainExtraSeconds: null,
        completionistSeconds: null,
        similarity: null
      }
    ]);

    expect(fetchHowLongToBeat).toHaveBeenCalledTimes(2);
    expect(String(fetchHowLongToBeat.mock.calls[0]?.[0])).toMatch(/^https:\/\/howlongtobeat\.com\/api\/bleed\/init\?t=\d+$/);
    expect(String(fetchHowLongToBeat.mock.calls[1]?.[0])).toBe("https://howlongtobeat.com/api/bleed");

    const searchInit = fetchHowLongToBeat.mock.calls[1]?.[1];
    expect(searchInit?.headers).toEqual(
      expect.objectContaining({
        "x-auth-token": "auth-token",
        "x-hp-key": "ign_test",
        "x-hp-val": "hidden-value"
      })
    );
    expect(JSON.parse(String(searchInit?.body))).toEqual(expect.objectContaining({ searchTerms: ["Rez"], ign_test: "hidden-value" }));
  });

  it("paces consecutive HowLongToBeat requests", async () => {
    vi.useFakeTimers();
    const fetchHowLongToBeat = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ token: "auth-token", hpKey: "ign_test", hpVal: "hidden-value" }))
      .mockResolvedValueOnce(jsonResponse({ games: [] }));

    const search = new HowLongToBeatClient(fetchHowLongToBeat, 20).search("Rez");
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchHowLongToBeat).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(19);
    expect(fetchHowLongToBeat).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);

    await expect(search).resolves.toEqual([]);
    expect(fetchHowLongToBeat).toHaveBeenCalledTimes(2);
  });

  it("reports auth initialization failures clearly", async () => {
    const fetchHowLongToBeat = vi.fn().mockResolvedValueOnce(new Response(null, { status: 404 }));

    await expect(new HowLongToBeatClient(fetchHowLongToBeat).search("Rez")).rejects.toThrow(
      "HowLongToBeat auth init returned HTTP 404"
    );
  });

  it("handles empty searches, cached auth, missing results, and search failures", async () => {
    const fetchHowLongToBeat = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ token: "token", hpKey: "key", hpVal: "value" }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 500 }));
    const client = new HowLongToBeatClient(fetchHowLongToBeat);

    await expect(client.search("   ")).resolves.toEqual([]);
    await expect(client.search("Unknown")).resolves.toEqual([]);
    await expect(client.search("Broken")).rejects.toThrow("HowLongToBeat search returned HTTP 500");
    expect(fetchHowLongToBeat).toHaveBeenCalledTimes(3);
  });

  it("re-authorizes once after a forbidden search and forwards abort signals", async () => {
    const controller = new AbortController();
    const fetchHowLongToBeat = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ token: "old", hpKey: "key", hpVal: "old-value" }))
      .mockResolvedValueOnce(new Response(null, { status: 403 }))
      .mockResolvedValueOnce(jsonResponse({ token: "new", hpKey: "key", hpVal: "new-value" }))
      .mockResolvedValueOnce(jsonResponse({ games: [] }));

    await expect(new HowLongToBeatClient(fetchHowLongToBeat).search("Rez", controller.signal)).resolves.toEqual([]);
    expect(fetchHowLongToBeat).toHaveBeenCalledTimes(4);
    expect(fetchHowLongToBeat.mock.calls.every((call) => call[1]?.signal === controller.signal)).toBe(true);
  });

  it("rejects malformed auth initialization payloads", async () => {
    await expect(new HowLongToBeatClient(vi.fn().mockResolvedValue(jsonResponse("invalid"))).search("Rez")).rejects.toThrow(
      "HowLongToBeat auth init returned an invalid payload"
    );
    await expect(
      new HowLongToBeatClient(vi.fn().mockResolvedValue(jsonResponse({ token: "token", hpKey: "key" }))).search("Rez")
    ).rejects.toThrow("HowLongToBeat auth init did not include the expected token values");
  });

  it("refreshes matches, alternate titles, unchanged games, missing games, and errors with progress", async () => {
    vi.spyOn(GameRepository.prototype, "ensureHowLongToBeatSyncStates").mockResolvedValue();
    vi.spyOn(GameRepository.prototype, "list").mockResolvedValue([
      gameDto(1, "Primary"),
      gameDto(2, "Unchanged"),
      gameDto(3, "Missing"),
      gameDto(4, "Broken")
    ]);
    vi.spyOn(GameRepository.prototype, "listAlternateTitles").mockResolvedValue([
      { alternate_title_id: 1, game_id: 1, title: "Alternate", notes: null }
    ]);
    const upsert = vi.spyOn(GameRepository.prototype, "upsertHowLongToBeatEntry").mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const recordNotFound = vi.spyOn(GameRepository.prototype, "recordHowLongToBeatNotFound").mockResolvedValue();
    const recordError = vi.spyOn(GameRepository.prototype, "recordHowLongToBeatError").mockResolvedValue();
    vi.spyOn(HowLongToBeatClient.prototype, "search")
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([game(11, "Alternate", 0.9)])
      .mockResolvedValueOnce([game(12, "Unchanged", 1)])
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error("request failed"));
    const progress: string[] = [];

    const result = await refreshService().refreshHowLongToBeatDataDetailed(undefined, (event) => {
      progress.push(`${event.status}:${event.processed}`);
    });

    expect(result).toEqual({ total: 4, updated: 1, unchanged: 1, notFound: 1, errors: 1 });
    expect(upsert).toHaveBeenCalledTimes(2);
    expect(upsert).toHaveBeenNthCalledWith(
      1,
      {
        gameId: 1,
        howLongToBeatId: 11,
        mainStorySeconds: 3600,
        mainExtraSeconds: null,
        completionistSeconds: null
      },
      { attemptedAt: expect.any(Date), nextAttemptAt: expect.any(Date) }
    );
    expect(recordNotFound).toHaveBeenCalledWith(3, { attemptedAt: expect.any(Date), nextAttemptAt: expect.any(Date) });
    expect(recordError).toHaveBeenCalledWith(4, "request failed");
    expect(progress).toEqual([
      "starting:0",
      "searching:0",
      "updated:1",
      "searching:1",
      "unchanged:2",
      "searching:2",
      "notFound:3",
      "searching:3",
      "error:4",
      "completed:4"
    ]);
  });

  it("returns the updated count and stops cleanly when already aborted", async () => {
    vi.spyOn(GameRepository.prototype, "ensureHowLongToBeatSyncStates").mockResolvedValue();
    vi.spyOn(GameRepository.prototype, "list").mockResolvedValue([gameDto(1, "Rez")]);
    vi.spyOn(GameRepository.prototype, "listAlternateTitles").mockResolvedValue([]);
    const search = vi.spyOn(HowLongToBeatClient.prototype, "search").mockResolvedValue([game(7, "Rez", 1)]);
    vi.spyOn(GameRepository.prototype, "upsertHowLongToBeatEntry").mockResolvedValue(true);
    await expect(refreshService().refreshHowLongToBeatData()).resolves.toBe(1);

    const controller = new AbortController();
    controller.abort();
    await expect(refreshService().refreshHowLongToBeatDataDetailed(controller.signal)).resolves.toEqual({
      total: 1,
      updated: 0,
      unchanged: 0,
      notFound: 0,
      errors: 0
    });
    expect(search).toHaveBeenCalledTimes(1);
  });

  it("processes a due batch and reports the remaining backlog", async () => {
    vi.spyOn(GameRepository.prototype, "listDueHowLongToBeatGames").mockResolvedValue([gameDto(1, "Rez")]);
    vi.spyOn(GameRepository.prototype, "listAlternateTitles").mockResolvedValue([]);
    vi.spyOn(GameRepository.prototype, "countDueHowLongToBeatGames").mockResolvedValue(42);
    vi.spyOn(GameRepository.prototype, "upsertHowLongToBeatEntry").mockResolvedValue(true);
    vi.spyOn(HowLongToBeatClient.prototype, "search").mockResolvedValue([game(7, "Rez", 1)]);

    await expect(refreshService().refreshDueHowLongToBeatDataDetailed(25)).resolves.toEqual({
      total: 1,
      updated: 1,
      unchanged: 0,
      notFound: 0,
      errors: 0,
      remainingDue: 42,
      halted: false
    });
    expect(GameRepository.prototype.listDueHowLongToBeatGames).toHaveBeenCalledWith(25);
  });
});

function game(id: number, title: string, similarity: number) {
  return {
    id,
    title,
    mainStorySeconds: 3600,
    mainExtraSeconds: null,
    completionistSeconds: null,
    similarity
  };
}

function gameDto(id: number, title: string) {
  return {
    id,
    title,
    developer: null,
    publisher: null,
    firstReleased: null,
    regionFirstReleasedIn: null,
    releasedInEuPalOrNa: false,
    imageUrl: null,
    isExcluded: false,
    isOwned: false
  };
}

function refreshService() {
  return new HowLongToBeatRefreshService({} as never, undefined, {} as never, { useAdvisoryLock: false });
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}
