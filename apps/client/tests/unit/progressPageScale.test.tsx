import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GameProgressDto } from "@ps2-challenge/shared";
import { Progress } from "../../src/pages/Progress.js";

const LARGE_PROGRESS_COUNT = 3000;

class MockWebSocket {
  addEventListener = vi.fn();
  close = vi.fn();
}

beforeEach(() => {
  vi.stubGlobal("WebSocket", MockWebSocket);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Progress page at production scale", () => {
  it("renders only a small window of rows and stays fast to search across thousands of progress entries", async () => {
    mockFetch({
      "GET /api/auth/user": { isAuthenticated: false },
      "GET /api/games/progress": largeProgressRows(LARGE_PROGRESS_COUNT),
      "GET /api/games/page-data": { games: [], ownedTypes: {}, exclusionReasons: {}, completionStatus: {}, alternateTitles: {} }
    });

    render(<Progress />);

    await screen.findByText(new RegExp(`Showing ${LARGE_PROGRESS_COUNT} of ${LARGE_PROGRESS_COUNT} games`));

    const initialRowCount = screen.getAllByRole("row").length - 1;
    expect(initialRowCount).toBeGreaterThan(0);
    expect(initialRowCount).toBeLessThan(LARGE_PROGRESS_COUNT / 10);

    const start = performance.now();
    fireEvent.change(screen.getByPlaceholderText("Search by title, criteria, or review..."), { target: { value: "Game 42" } });
    const expectedMatches = matchingProgressCount("Game 42", LARGE_PROGRESS_COUNT);
    await waitFor(() => expect(screen.getByText(/^Showing \d+ of/)).toHaveTextContent(`Showing ${expectedMatches} of ${LARGE_PROGRESS_COUNT} games`));
    const elapsedMs = performance.now() - start;

    expect(elapsedMs).toBeLessThan(500);
    const filteredRowCount = screen.getAllByRole("row").length - 1;
    expect(filteredRowCount).toBeLessThan(LARGE_PROGRESS_COUNT / 10);
  });
});

function matchingProgressCount(term: string, total: number) {
  let count = 0;
  for (let id = 1; id <= total; id++) {
    if (`Game ${id}`.includes(term)) count++;
  }
  return count;
}

function largeProgressRows(count: number): GameProgressDto[] {
  const rows: GameProgressDto[] = [];
  for (let id = 1; id <= count; id++) {
    rows.push({
      progressId: id,
      gameId: id,
      gameTitle: `Game ${id}`,
      imageUrl: null,
      dateStarted: "2025-01-01",
      dateFinished: id % 3 === 0 ? "2025-01-10" : null,
      completionTime: null,
      beatenCriteria: "Credits",
      review: null,
      platform: "Physical"
    });
  }
  return rows;
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
