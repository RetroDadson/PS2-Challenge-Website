import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../../src/api.js";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("client API requests", () => {
  it("does not send a JSON content type for bodyless requests", async () => {
    let request: RequestInit | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        request = init;
        return new Response(JSON.stringify({ message: "Deleted" }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      })
    );

    await api.deleteSerialNumber(8, 11520);

    expect(request?.body).toBeUndefined();
    expect(new Headers(request?.headers).has("content-type")).toBe(false);
  });

  it("sends a JSON content type when a JSON body is present", async () => {
    let request: RequestInit | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        request = init;
        return new Response(JSON.stringify({ message: "Updated" }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      })
    );

    await api.updateExclusion(8, true, "Duplicate");

    expect(request?.body).toBe(JSON.stringify({ isExcluded: true, reason: "Duplicate" }));
    expect(new Headers(request?.headers).get("content-type")).toBe("application/json");
  });

  it("encodes query strings and handles empty success responses", async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        urls.push(String(input));
        return new Response(null, { status: 204 });
      })
    );

    await expect(api.games("Final Fantasy X")).resolves.toBeUndefined();

    expect(urls).toEqual(["/api/games?title=Final%20Fantasy%20X"]);
  });

  it("keeps the endpoint wrapper map wired to the expected REST paths", async () => {
    const calls: Array<{ method: string; path: string; body: unknown }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const rawUrl = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        calls.push({
          method: (init?.method ?? "GET").toUpperCase(),
          path: rawUrl.startsWith("http") ? new URL(rawUrl).pathname : rawUrl,
          body: init?.body ? JSON.parse(String(init.body)) : null
        });
        return new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } });
      })
    );

    await api.user();
    await api.regenerateApiKey();
    await api.game(8);
    await api.createGame({ title: "Game" });
    await api.updateGame(8, { title: "Updated" });
    await api.deleteGame(8);
    await api.ownershipTypes();
    await api.updateOwnership(8, true, "Base");
    await api.progress();
    await api.updateProgress({ title: "Game" });
    await api.ownedTypes();
    await api.serialNumbers(8);
    await api.addSerialNumber({ title: "Game", serialNumber: "SLUS-12345" });
    await api.alternateTitles(8);
    await api.addAlternateTitle(8, { title: "Alt" });
    await api.deleteAlternateTitle(8, 2);
    await api.votesHistory();
    await api.currentVotes();
    await api.setCurrentVotes([{ gameId: 1, gameTitle: "Game", voteCount: 1, gameNumber: 1 }]);
    await api.removeCurrentVote("Game / One");
    await api.archiveVotes("Done", { 1: 1 });
    await api.fillRandomVotes(2);
    await api.updateVoteByNumber(1, 12);
    await api.adminUsers();
    await api.roles();
    await api.updateRole(9, 1);
    await api.refreshCovers();

    expect(calls).toEqual(
      expect.arrayContaining([
        { method: "GET", path: "/api/user", body: null },
        { method: "POST", path: "/api/user/api-key", body: {} },
        { method: "GET", path: "/api/games/8", body: null },
        { method: "PUT", path: "/api/games/8/ownership", body: { ownPhysicalCopy: true, typeOwned: "Base" } },
        { method: "DELETE", path: "/api/votes/current/Game%20%2F%20One", body: null },
        { method: "POST", path: "/api/votes/archive", body: { notes: "Done", manualPositions: { 1: 1 } } },
        { method: "PUT", path: "/api/admin/users/9/role", body: { roleId: 1 } },
        { method: "POST", path: "/api/admin/update-cover-images", body: {} }
      ])
    );
  });

  it("uses JSON error details, text status, and fallback status messages", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response(JSON.stringify({ message: "Nope" }), { status: 400, statusText: "Bad Request" }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ error: "Conflict" }), { status: 409, statusText: "Conflict" }))
        .mockResolvedValueOnce(new Response("not-json", { status: 401, statusText: "" }))
    );

    await expect(api.authUser()).rejects.toThrow("Nope");
    await expect(api.authUser()).rejects.toThrow("Conflict");
    await expect(api.authUser()).rejects.toThrow("Unauthorized");
  });

  it("streams cover refresh progress and returns the completion payload", async () => {
    const progress: unknown[] = [];
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            [
              JSON.stringify({ type: "progress", status: "checking", processed: 1, total: 2, updated: 0, skipped: 0, errors: 0 }),
              JSON.stringify({ type: "complete", total: 2, updated: 1, skipped: 1, errors: 0, message: "Done" }),
              ""
            ].join("\n")
          )
        );
        controller.close();
      }
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(stream, { status: 200 })));

    const result = await api.refreshCoversWithProgress((event) => progress.push(event));

    expect(progress).toEqual([{ type: "progress", status: "checking", processed: 1, total: 2, updated: 0, skipped: 0, errors: 0 }]);
    expect(result).toEqual({ type: "complete", total: 2, updated: 1, skipped: 1, errors: 0, message: "Done" });
  });

  it("falls back to the non-streaming cover refresh endpoint when no body is available", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response(null, { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ total: 3, updated: 2, skipped: 1, errors: 0 }), { status: 200 }))
    );
    const progress: unknown[] = [];

    await expect(api.refreshCoversWithProgress((event) => progress.push(event))).resolves.toEqual({
      total: 3,
      updated: 2,
      skipped: 1,
      errors: 0
    });
    expect(progress).toEqual([{ total: 3, updated: 2, skipped: 1, errors: 0, processed: 3, status: "completed" }]);
  });

  it("throws when streamed cover refresh reports an error or never completes", async () => {
    const encoder = new TextEncoder();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(
            new ReadableStream({
              start(controller) {
                controller.enqueue(encoder.encode(`${JSON.stringify({ type: "error", message: "Cover failure" })}\n`));
                controller.close();
              }
            }),
            { status: 200 }
          )
        )
        .mockResolvedValueOnce(
          new Response(
            new ReadableStream({
              start(controller) {
                controller.enqueue(encoder.encode(`${JSON.stringify({ type: "progress", status: "checking", processed: 1, total: 1, updated: 0, skipped: 0, errors: 0 })}\n`));
                controller.close();
              }
            }),
            { status: 200 }
          )
        )
    );

    await expect(api.refreshCoversWithProgress(() => undefined)).rejects.toThrow("Cover failure");
    await expect(api.refreshCoversWithProgress(() => undefined)).rejects.toThrow("Cover image update did not complete");
  });
});
