import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProgressOverlay, VoteCoversOverlay, VotesOverlay } from "../../src/pages/Overlays.js";

type MockWebSocketEvent = {
  data?: string;
};

class MockWebSocket {
  static readonly instances: MockWebSocket[] = [];
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 3;

  readonly listeners = new Map<string, Array<(event: MockWebSocketEvent) => void>>();
  readyState = MockWebSocket.CONNECTING;

  addEventListener = vi.fn((eventName: string, listener: (event: MockWebSocketEvent) => void) => {
    const listeners = this.listeners.get(eventName) ?? [];
    listeners.push(listener);
    this.listeners.set(eventName, listeners);

    if (eventName === "open" && this.autoOpen) {
      Promise.resolve().then(() => {
        this.readyState = MockWebSocket.OPEN;
        listener({});
      });
    }
  });

  send = vi.fn(() => {
    // Mock send method for ping messages
  });

  close = vi.fn(() => {
    this.readyState = MockWebSocket.CLOSED;
  });

  constructor(readonly url: string, private readonly autoOpen = true) {
    MockWebSocket.instances.push(this);
  }

  emitMessage(data = JSON.stringify({ type: "VotesUpdated" })) {
    this.listeners.get("message")?.forEach((listener) => listener({ data }));
  }

  emitClose() {
    this.readyState = MockWebSocket.CLOSED;
    this.listeners.get("close")?.forEach((listener) => listener({}));
  }

  emitError() {
    this.listeners.get("error")?.forEach((listener) => listener({}));
  }
}

beforeEach(() => {
  MockWebSocket.instances.length = 0;
  vi.stubGlobal("WebSocket", MockWebSocket);
});

afterEach(() => {
  vi.restoreAllMocks();
  try {
    vi.useRealTimers();
  } catch {
    // Timers may not be enabled
  }
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
        let url: string;
        if (typeof input === "string") {
          url = input;
        } else if (input instanceof URL) {
          url = input.pathname;
        } else {
          url = input.url;
        }
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

  it("sends periodic pings to keep the WebSocket connection alive", async () => {
    vi.useFakeTimers();
    const fetchSpy = mockFetch({
      "/api/votes/current": [
        { gameId: 1, gameTitle: "First Game", voteCount: 10, gameNumber: 1 }
      ]
    });

    render(<VotesOverlay />);

    await flushReact();
    const votesSocket = MockWebSocket.instances.find((socket) => socket.url.endsWith("/votesHub"));
    expect(votesSocket).toBeDefined();

    expect(votesSocket?.send).not.toHaveBeenCalled();
    fetchSpy.mockClear();

    act(() => {
      vi.advanceTimersByTime(25000);
      votesSocket?.emitMessage(JSON.stringify({ type: "Pong" }));
    });

    expect(votesSocket?.send).toHaveBeenCalledWith("Ping");
    expect(votesSocket?.send).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(25000);
    });

    expect(votesSocket?.send).toHaveBeenCalledTimes(2);
  });

  it("automatically reconnects when the WebSocket connection closes", async () => {
    vi.useFakeTimers();
    mockFetch({
      "/api/votes/current": [
        { gameId: 1, gameTitle: "First Game", voteCount: 10, gameNumber: 1 }
      ]
    });

    render(<VotesOverlay />);

    await flushReact();
    expect(MockWebSocket.instances).toHaveLength(1);
    const firstSocket = MockWebSocket.instances[0];

    // Simulate connection close
    act(() => {
      firstSocket?.emitClose();
    });

    // Advance time past the reconnect delay (1 second)
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    await flushReact();

    // Should have created a new socket
    expect(MockWebSocket.instances.length).toBeGreaterThan(1);
  });

  it("does not create duplicate reconnects when error and close fire for the same socket", async () => {
    vi.useFakeTimers();
    mockFetch({
      "/api/votes/current": [
        { gameId: 1, gameTitle: "First Game", voteCount: 10, gameNumber: 1 }
      ]
    });

    render(<VotesOverlay />);

    await flushReact();
    expect(MockWebSocket.instances).toHaveLength(1);
    const firstSocket = MockWebSocket.instances[0];

    act(() => {
      firstSocket?.emitError();
      firstSocket?.emitClose();
      vi.advanceTimersByTime(1000);
    });

    await flushReact();

    expect(MockWebSocket.instances).toHaveLength(2);
  });

  it("does not reconnect after an overlay unmounts", async () => {
    vi.useFakeTimers();
    mockFetch({
      "/api/votes/current": [
        { gameId: 1, gameTitle: "First Game", voteCount: 10, gameNumber: 1 }
      ]
    });

    const { unmount } = render(<VotesOverlay />);

    await flushReact();
    expect(MockWebSocket.instances).toHaveLength(1);
    const firstSocket = MockWebSocket.instances[0];

    unmount();

    act(() => {
      firstSocket?.emitClose();
      vi.advanceTimersByTime(60_000);
    });

    expect(MockWebSocket.instances).toHaveLength(1);
  });

  it("polls while WebSocket reconnects keep failing", async () => {
    vi.useFakeTimers();

    const WebSocketMock = vi.fn(function WebSocketMock() {
      const socket = new MockWebSocket("ws://test", false);
      Promise.resolve().then(() => socket.emitError());
      return socket;
    });
    Object.assign(WebSocketMock, {
      CONNECTING: MockWebSocket.CONNECTING,
      OPEN: MockWebSocket.OPEN,
      CLOSED: MockWebSocket.CLOSED
    });
    vi.stubGlobal("WebSocket", WebSocketMock);

    const fetchSpy = vi.fn(async () => {
      return new Response(JSON.stringify([
        { gameId: 1, gameTitle: "First Game", voteCount: 10, gameNumber: 1 }
      ]), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    });

    vi.stubGlobal("fetch", fetchSpy);

    render(<VotesOverlay />);

    await flushReact();
    fetchSpy.mockClear();

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    await flushReact();

    expect(fetchSpy).toHaveBeenCalledWith("/api/votes/current", expect.anything());
    expect(WebSocketMock.mock.calls.length).toBeGreaterThan(1);
  });

  it("falls back to polling when a WebSocket attempt hangs before opening", async () => {
    vi.useFakeTimers();

    const WebSocketMock = vi.fn(function WebSocketMock() {
      return new MockWebSocket("ws://test", false);
    });
    Object.assign(WebSocketMock, {
      CONNECTING: MockWebSocket.CONNECTING,
      OPEN: MockWebSocket.OPEN,
      CLOSED: MockWebSocket.CLOSED
    });
    vi.stubGlobal("WebSocket", WebSocketMock);

    const fetchSpy = mockFetch({
      "/api/votes/current": [
        { gameId: 1, gameTitle: "First Game", voteCount: 10, gameNumber: 1 }
      ]
    });

    render(<VotesOverlay />);

    await flushReact();
    fetchSpy.mockClear();

    act(() => {
      vi.advanceTimersByTime(10000);
      vi.advanceTimersByTime(5000);
    });

    await flushReact();

    expect(fetchSpy).toHaveBeenCalledWith("/api/votes/current", expect.anything());
  });
});

function mockFetch(routes: Record<string, unknown>) {
  const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
    let url: string;
    if (typeof input === "string") {
      url = input;
    } else if (input instanceof URL) {
      url = input.pathname;
    } else {
      url = input.url;
    }
    const path = url.startsWith("http") ? new URL(url).pathname : url;
    if (!(path in routes)) {
      return new Response(JSON.stringify({ message: "Not Found" }), { status: 404 });
    }
    return new Response(JSON.stringify(routes[path]), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  });
  vi.stubGlobal("fetch", fetchSpy);
  return fetchSpy;
}

async function flushReact() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}
