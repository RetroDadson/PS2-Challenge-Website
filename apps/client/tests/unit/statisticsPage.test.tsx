import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Statistics } from "../../src/pages/Statistics.js";

class MockWebSocket {
  static readonly OPEN = 1;
  static readonly instances: MockWebSocket[] = [];
  readonly listeners = new Map<string, Array<(event: { data?: string }) => void>>();
  readyState = MockWebSocket.OPEN;

  constructor(readonly url: string) {
    MockWebSocket.instances.push(this);
  }

  addEventListener(eventName: string, listener: (event: { data?: string }) => void) {
    this.listeners.set(eventName, [...(this.listeners.get(eventName) ?? []), listener]);
  }

  send = vi.fn();
  close = vi.fn();

  emitMessage(data: string) {
    this.listeners.get("message")?.forEach((listener) => listener({ data }));
  }
}

beforeEach(() => {
  MockWebSocket.instances.length = 0;
  vi.stubGlobal("WebSocket", MockWebSocket);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Statistics page", () => {
  it("calculates challenge, yearly, collection, and ownership statistics like the C# page", async () => {
    mockFetch({
      "GET /api/games": [
        { id: 1, title: "Game One", isExcluded: false, isOwned: true },
        { id: 2, title: "Game Two", isExcluded: true, isOwned: true },
        { id: 3, title: "Game Three", isExcluded: false, isOwned: false },
        { id: 4, title: "Game Four", isExcluded: false, isOwned: true }
      ],
      "GET /api/games/progress": [
        {
          progressId: 1,
          gameId: 1,
          gameTitle: "Game One",
          dateStarted: "2024-03-01",
          dateFinished: "2024-03-05",
          completionTime: "10:30:00",
          platform: "Physical",
          deaths: 5
        },
        {
          progressId: 2,
          gameId: 3,
          gameTitle: "Game Three",
          dateStarted: "2025-01-01",
          dateFinished: "2025-01-03",
          completionTime: "05:30:00",
          platform: "Emulated",
          deaths: 0
        },
        {
          progressId: 3,
          gameId: 4,
          gameTitle: "Game Four",
          dateStarted: "2025-04-01",
          dateFinished: null,
          completionTime: null,
          platform: "Physical",
          deaths: 9,
          deathLabel: "Fails"
        }
      ],
      "GET /api/games/owned-types": {
        1: "CIB",
        2: "Loose",
        4: "CIB"
      },
      "GET /api/twitch/stream-stats": {
        channelLogin: "retrodadson",
        rangeStart: "2026-04-08T00:00:00.000Z",
        rangeEnd: "2026-06-03T00:00:00.000Z",
        rangeWeeks: 8,
        totalStreamSeconds: 125_424,
        averageWeeklyStreamSeconds: 14_400,
        vodCount: 12
      }
    });

    render(<Statistics />);

    expect(await screen.findByRole("heading", { name: "Challenge Status" })).toBeInTheDocument();
    expect(statValue("Games Completed")).toBe("2");
    expect(statValue("Games in Challenge")).toBe("3");
    expect(statValue("Games Remaining")).toBe("1");
    expect(statValue("Challenge Complete")).toBe("66.67%");
    expect(statValue("Average Game Duration")).toBe("8h");
    expect(statValue("Estimated Game Time Remaining")).toBe("8h");
    await waitFor(() => expect(statValue("Average Weekly Stream Time")).toBe("4h"));
    expect(statValue("Estimated Streaming Time Remaining")).toBe("2 weeks");

    const durationChart = screen.getByRole("heading", { name: "Game Duration (hours)" }).closest(".duration-chart-card") as HTMLElement;
    expect(durationChart).toBeInTheDocument();
    expect(within(durationChart).getByText("Game Duration (hours)")).toBeInTheDocument();
    expect(within(durationChart).getByText("Game Completion Number")).toBeInTheDocument();
    expect(within(durationChart).getByRole("button", { name: "Zoom in" })).toBeInTheDocument();
    expect(within(durationChart).getByRole("button", { name: "Zoom out" })).toBeInTheDocument();
    expect(within(durationChart).getByRole("button", { name: "Reset Zoom" })).toBeInTheDocument();
    const firstPoint = within(durationChart).getByLabelText("Game #1 Game One duration 10h 30m completed 2024-03-05");
    expect(firstPoint).toBeInTheDocument();
    expect(within(durationChart).getByLabelText("Game #2 Game Three duration 5h 30m completed 2025-01-03")).toBeInTheDocument();
    expect(within(durationChart).queryByRole("list", { name: "Game duration data" })).not.toBeInTheDocument();
    fireEvent.mouseEnter(firstPoint);
    expect(within(durationChart).getByRole("tooltip")).toHaveTextContent("Game One");
    expect(within(durationChart).getByRole("tooltip")).toHaveTextContent("10h 30m");
    expect(within(durationChart).getByRole("tooltip")).toHaveTextContent("2024-03-05");

    expect(statValue("Games Collected in Challenge")).toBe("2");
    expect(statValue("Collected but Excluded")).toBe("1");
    expect(statValue("Total Games Owned")).toBe("3");
    expect(statValue("Challenge Collection Rate")).toBe("66.67%");
    expect(statValue("Total Collection Rate")).toBe("75.00%");

    const collectionSection = screen.getByRole("region", { name: "Collection Statistics" });
    expect(within(collectionSection).getByText("Challenge Collection Progress")).toBeInTheDocument();
    expect(within(collectionSection).getByText("2 / 3 games")).toBeInTheDocument();
    expect(within(collectionSection).getByText("66.7%")).toBeInTheDocument();
    expect(within(collectionSection).getByText("Total Collection Progress")).toBeInTheDocument();
    expect(within(collectionSection).getByText("3 / 4 games")).toBeInTheDocument();
    expect(within(collectionSection).getByText("75.0%")).toBeInTheDocument();

    const yearlySection = screen.getByRole("heading", { name: "Game Completion by Year" }).closest(".panel") as HTMLElement;
    expect(yearlySection).toBeInTheDocument();
    expect(within(yearlySection).getByRole("row", { name: /2025 2 1 33.33%/i })).toBeInTheDocument();
    expect(within(yearlySection).getByRole("row", { name: /2024 1 1 33.33%/i })).toBeInTheDocument();
    expect(within(yearlySection).getByRole("row", { name: /Total 3 2 66.67%/i })).toBeInTheDocument();
    expect(within(yearlySection).getByRole("columnheader", { name: "Deaths / Fails" })).toBeInTheDocument();
    expect(within(yearlySection).getByRole("row", { name: "2025 2 1 33.33% 0" })).toBeInTheDocument();
    expect(within(yearlySection).getByRole("row", { name: "2024 1 1 33.33% 5" })).toBeInTheDocument();
    expect(within(yearlySection).getByRole("row", { name: "Total 3 2 66.67% 5" })).toBeInTheDocument();

    expect(statValue("Total Deaths / Fails")).toBe("14");
    expect(statValue("Average per Completed Game")).toBe("2.5");
    expect(statValue("Most Deaths / Fails")).toBe("Game Four (9)");
    const deathsChart = screen.getByRole("figure", { name: "Top 2 Games by Deaths / Fails" });
    const deathRows = within(deathsChart).getAllByRole("listitem");
    expect(deathRows.map((row) => row.textContent)).toEqual(["Game Four9 Fails", "Game One5 Deaths"]);
    expect(deathRows[0]).toHaveAttribute("title", "Game Four: 9 Fails");

    const ownershipSection = screen.getByRole("heading", { name: "Ownership Type Distribution" }).closest(".ownership-breakdown") as HTMLElement;
    expect(ownershipSection).toBeInTheDocument();
    expect(within(ownershipSection).getByText("CIB")).toBeInTheDocument();
    expect(within(ownershipSection).getByText("2 (66.7%)")).toBeInTheDocument();
    expect(within(ownershipSection).getByText("Loose")).toBeInTheDocument();
    expect(within(ownershipSection).getByText("1 (33.3%)")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "More Statistics Coming Soon" })).toBeInTheDocument();
  });

  it("shows empty death statistics when nothing has been recorded", async () => {
    mockFetch({
      "GET /api/games": [{ id: 1, title: "Clean Game", isExcluded: false, isOwned: false }],
      "GET /api/games/progress": [
        { progressId: 1, gameId: 1, gameTitle: "Clean Game", dateStarted: "2025-01-01", dateFinished: null, platform: "Physical", deaths: 0 }
      ],
      "GET /api/games/owned-types": {},
      "GET /api/twitch/stream-stats": null
    });

    render(<Statistics />);

    expect(await screen.findByRole("heading", { name: "Death Counter" })).toBeInTheDocument();
    expect(statValue("Total Deaths / Fails")).toBe("0");
    expect(statValue("Average per Completed Game")).toBe("-");
    expect(statValue("Most Deaths / Fails")).toBe("-");
    expect(screen.getByText("No deaths or fails recorded yet.")).toBeInTheDocument();
    expect(screen.queryByRole("figure")).not.toBeInTheDocument();
  });

  it("formats long streaming time estimates as years and weeks", async () => {
    mockFetch({
      "GET /api/games": [
        { id: 1, title: "Long Game", isExcluded: false, isOwned: true },
        { id: 2, title: "Longer Game", isExcluded: false, isOwned: false }
      ],
      "GET /api/games/progress": [
        {
          progressId: 1,
          gameId: 1,
          gameTitle: "Long Game",
          dateStarted: "2025-01-01",
          dateFinished: "2025-01-10",
          completionTime: "105:00:00",
          platform: "Physical",
          deaths: 0
        }
      ],
      "GET /api/games/owned-types": {
        1: "CIB"
      },
      "GET /api/twitch/stream-stats": {
        channelLogin: "retrodadson",
        rangeStart: "2026-04-08T00:00:00.000Z",
        rangeEnd: "2026-06-03T00:00:00.000Z",
        rangeWeeks: 8,
        totalStreamSeconds: 28_800,
        averageWeeklyStreamSeconds: 3_600,
        vodCount: 8
      }
    });

    render(<Statistics />);

    expect(await screen.findByRole("heading", { name: "Challenge Status" })).toBeInTheDocument();
    await waitFor(() => expect(statValue("Estimated Streaming Time Remaining")).toBe("2 years 1 week"));
  });

  it("refreshes death statistics live when the games hub reports an update", async () => {
    const progressEntry = { progressId: 1, gameId: 1, gameTitle: "Live Game", dateStarted: "2025-01-01", dateFinished: null, platform: "Physical", deaths: 5, deathLabel: "Crashes" };
    const routes: Record<string, unknown> = {
      "GET /api/games": [{ id: 1, title: "Live Game", isExcluded: false, isOwned: true }],
      "GET /api/games/progress": [progressEntry],
      "GET /api/games/owned-types": { 1: "CIB" },
      "GET /api/twitch/stream-stats": null
    };
    mockFetch(routes);

    render(<Statistics />);

    expect(await screen.findByRole("heading", { name: "Death Counter" })).toBeInTheDocument();
    expect(statValue("Total Deaths / Fails")).toBe("5");
    expect(screen.getByRole("figure", { name: "Top 1 Game by Deaths / Fails" })).toHaveTextContent("5 Crashes");
    const gamesHub = MockWebSocket.instances.find((socket) => socket.url.endsWith("/gamesHub"));
    expect(gamesHub).toBeDefined();

    routes["GET /api/games/progress"] = [{ ...progressEntry, deaths: 6 }];
    routes["GET /api/twitch/stream-stats"] = {
      channelLogin: "retrodadson",
      rangeStart: "2026-04-08T00:00:00.000Z",
      rangeEnd: "2026-06-03T00:00:00.000Z",
      rangeWeeks: 8,
      totalStreamSeconds: 28_800,
      averageWeeklyStreamSeconds: 3_600,
      vodCount: 8
    };
    await act(async () => {
      gamesHub!.emitMessage(JSON.stringify({ type: "GamesUpdated" }));
    });

    await waitFor(() => expect(statValue("Total Deaths / Fails")).toBe("6"));
    await waitFor(() => expect(statValue("Average Weekly Stream Time")).toBe("1h"));
    expect(screen.getByRole("figure", { name: "Top 1 Game by Deaths / Fails" })).toHaveTextContent("6 Crashes");
    expect(screen.getByRole("heading", { name: "Challenge Status" })).toBeInTheDocument();
  });
});

function statValue(label: string) {
  const card = screen.getAllByRole("article").find((article) => within(article).queryByText(label));
  if (!card) throw new Error(`Could not find stat card for ${label}`);
  return within(card).getByTestId("stat-value").textContent;
}

function mockFetch(routes: Record<string, unknown>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const rawUrl = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const path = rawUrl.startsWith("http") ? new URL(rawUrl).pathname : rawUrl;
      const route = routes[`GET ${path}`];
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
