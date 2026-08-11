import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GameDto, GamesPageDataDto } from "@ps2-challenge/shared";
import { Games } from "../../src/pages/Games.js";

const LARGE_GAME_COUNT = 3000;

class MockWebSocket {
  addEventListener = vi.fn();
  close = vi.fn();
}

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("WebSocket", MockWebSocket);
});

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("Games page at production scale", () => {
  it("renders only a small window of rows and stays fast to search across thousands of games", async () => {
    mockFetch({
      "GET /api/auth/user": { isAuthenticated: false },
      "GET /api/games/page-data": largeGamesPageData(LARGE_GAME_COUNT)
    });

    render(<Games />);

    const initialVisibleCount = matchingGameCount("", LARGE_GAME_COUNT);
    await screen.findByText(new RegExp(`Showing ${initialVisibleCount} of ${LARGE_GAME_COUNT} games`));

    const initialRowCount = screen.getAllByRole("row").length - 1;
    expect(initialRowCount).toBeGreaterThan(0);
    expect(initialRowCount).toBeLessThan(LARGE_GAME_COUNT / 10);

    const start = performance.now();
    fireEvent.change(screen.getByPlaceholderText("Search games by title, developer, or publisher..."), { target: { value: "Game 42" } });
    const expectedMatches = matchingGameCount("Game 42", LARGE_GAME_COUNT);
    await waitFor(() => expect(screen.getByText(/^Showing \d+ of/)).toHaveTextContent(`Showing ${expectedMatches} of ${LARGE_GAME_COUNT} games`));
    const elapsedMs = performance.now() - start;

    expect(elapsedMs).toBeLessThan(500);
    const filteredRowCount = screen.getAllByRole("row").length - 1;
    expect(filteredRowCount).toBeLessThan(LARGE_GAME_COUNT / 10);
  });
});

function matchingGameCount(term: string, total: number) {
  let count = 0;
  for (let id = 1; id <= total; id++) {
    const isExcluded = id % 20 === 0;
    if (!isExcluded && `Game ${id}`.includes(term)) count++;
  }
  return count;
}

const REGIONS = ["EU", "NA", "JP"] as const;

function largeGamesPageData(count: number): GamesPageDataDto {
  const games: GameDto[] = [];
  for (let id = 1; id <= count; id++) {
    games.push({
      id,
      title: `Game ${id}`,
      developer: `Developer ${id % 50}`,
      publisher: `Publisher ${id % 30}`,
      firstReleased: "2002-01-01",
      regionFirstReleasedIn: REGIONS[id % REGIONS.length],
      releasedInEuPalOrNa: true,
      imageUrl: null,
      isExcluded: id % 20 === 0,
      isOwned: id % 4 === 0
    });
  }
  return {
    games,
    ownedTypes: {},
    exclusionReasons: {},
    completionStatus: {},
    alternateTitles: {}
  };
}

function mockFetch(routes: Record<string, unknown>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const rawUrl = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const path = rawUrl.startsWith("http") ? new URL(rawUrl).pathname : rawUrl;
      const method = (init?.method ?? "GET").toUpperCase();
      const route = routes[`${method} ${path}`];
      if (route === undefined) {
        return new Response(JSON.stringify({ message: "Not Found" }), { status: 404 });
      }
      return new Response(JSON.stringify(route), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    })
  );
}
