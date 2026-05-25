import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProgressOverlay, VoteCoversOverlay, VotesOverlay } from "../../src/pages/Overlays.js";

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  readonly listeners = new Map<string, Array<() => void>>();
  addEventListener = vi.fn((eventName: string, listener: () => void) => {
    const listeners = this.listeners.get(eventName) ?? [];
    listeners.push(listener);
    this.listeners.set(eventName, listeners);
  });
  close = vi.fn();

  constructor(readonly url: string) {
    MockWebSocket.instances.push(this);
  }

  emitMessage() {
    this.listeners.get("message")?.forEach((listener) => listener());
  }
}

beforeEach(() => {
  MockWebSocket.instances = [];
  vi.stubGlobal("WebSocket", MockWebSocket);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("stream overlays", () => {
  it("renders current votes in game-number order with the legacy labels", async () => {
    mockFetch({
      "/api/votes/current": [
        { gameId: 2, gameTitle: "Second Game", voteCount: 5, gameNumber: 2 },
        { gameId: 1, gameTitle: "First Game", voteCount: 10, gameNumber: 1 }
      ]
    });

    render(<VotesOverlay />);

    expect(await screen.findByText("First Game")).toBeInTheDocument();
    expect(screen.getByText("Game 1: 10")).toBeInTheDocument();
    expect(screen.getByText("Second Game")).toBeInTheDocument();
    expect(screen.getByText("Game 2: 5")).toBeInTheDocument();
  });

  it("keeps the current vote overlay visible while realtime updates refresh in the background", async () => {
    let currentVotes = [{ gameId: 1, gameTitle: "First Game", voteCount: 10, gameNumber: 1 }];
    let currentRequests = 0;
    let releaseSecondRequest: (() => void) | null = null;

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
        const path = url.startsWith("http") ? new URL(url).pathname : url;
        if (path !== "/api/votes/current") {
          return new Response(JSON.stringify({ message: "Not Found" }), { status: 404 });
        }
        currentRequests++;
        if (currentRequests === 2) {
          await new Promise<void>((resolve) => {
            releaseSecondRequest = resolve;
          });
        }
        return new Response(JSON.stringify(currentVotes), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      })
    );

    render(<VotesOverlay />);

    expect(await screen.findByText("Game 1: 10")).toBeInTheDocument();
    currentVotes = [{ gameId: 1, gameTitle: "First Game", voteCount: 15, gameNumber: 1 }];

    act(() => {
      MockWebSocket.instances.find((socket) => socket.url.endsWith("/votesHub"))?.emitMessage();
    });

    expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
    expect(screen.getByText("Game 1: 10")).toBeInTheDocument();

    await act(async () => {
      releaseSecondRequest?.();
      await Promise.resolve();
    });

    expect(await screen.findByText("Game 1: 15")).toBeInTheDocument();
  });

  it("renders the old empty votes state", async () => {
    mockFetch({ "/api/votes/current": [] });

    render(<VotesOverlay />);

    expect(await screen.findByText("No current votes")).toBeInTheDocument();
  });

  it("calculates progress overlay counts using non-excluded games as the denominator", async () => {
    mockFetch({
      "/api/games": [
        { id: 1, title: "Done", isExcluded: false },
        { id: 2, title: "Todo", isExcluded: false },
        { id: 3, title: "Excluded", isExcluded: true }
      ],
      "/api/games/progress": [
        { progressId: 1, gameId: 1, gameTitle: "Done", dateStarted: "2024-01-01", dateFinished: "2024-01-02", platform: "Physical" }
      ]
    });

    render(<ProgressOverlay />);

    expect(await screen.findByText("Games Completed")).toBeInTheDocument();
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
    expect(screen.getByText("50.00%")).toBeInTheDocument();
  });

  it("cycles vote cover images every two seconds", async () => {
    vi.useFakeTimers();
    mockFetch({
      "/api/votes/current": [
        { gameId: 1, gameTitle: "First Game", voteCount: 10, gameNumber: 1 },
        { gameId: 2, gameTitle: "Second Game", voteCount: 5, gameNumber: 2 }
      ],
      "/api/games": [
        { id: 1, title: "First Game", imageUrl: "https://example.com/first.jpg" },
        { id: 2, title: "Second Game", imageUrl: "https://example.com/second.jpg" }
      ]
    });

    render(<VoteCoversOverlay />);

    await flushReact();
    expect(screen.getAllByRole("img")).toHaveLength(2);
    const [first, second] = screen.getAllByRole("img");
    expect(first).toHaveClass("active");
    expect(second).not.toHaveClass("active");

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(second).toHaveClass("active");
  });
});

function mockFetch(routes: Record<string, unknown>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
      const path = url.startsWith("http") ? new URL(url).pathname : url;
      if (!(path in routes)) {
        return new Response(JSON.stringify({ message: "Not Found" }), { status: 404 });
      }
      return new Response(JSON.stringify(routes[path]), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    })
  );
}

async function flushReact() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}
