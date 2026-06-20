import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Games } from "../../src/pages/Games.js";

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

describe("Games page", () => {
  it("uses C# page-data parity for counts, filters, covers, statuses, and alternate-title search", async () => {
    mockFetch({
      "GET /api/auth/user": { isAuthenticated: false },
      "GET /api/games/page-data": gamesPageData()
    });

    render(<Games />);

    expect(await screen.findByText("Showing 2 of 3 games | Owned: 2 | Excluded: 1 | Completed: 1 | In Progress: 1 | Not Started: 0")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /How Long To Beat Time/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Add New Game/i })).not.toBeInTheDocument();
    const cover = screen.getByAltText("Game One cover");
    expect(cover).toHaveAttribute("src", "/covers/game-one.jpg");
    fireEvent.mouseEnter(cover, { clientX: 40, clientY: 60 });
    expect(document.querySelector(".cover-hover-preview")).toHaveAttribute("src", "/covers/game-one.jpg");
    fireEvent.mouseLeave(cover);
    expect(document.querySelector(".cover-hover-preview")).not.toBeInTheDocument();
    expect(screen.getByText("CIB")).toBeInTheDocument();
    expect(screen.getByText("Completed")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "1h 30m" })).toHaveAttribute("href", "https://howlongtobeat.com/game/12345");
    expect(screen.getByText("01/01/2001")).toBeInTheDocument();
    expect(screen.queryByText("Game Two")).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Search games by title, developer, or publisher..."), { target: { value: "third game" } });
    expect(screen.getByText("Game Three")).toBeInTheDocument();
    expect(screen.getByText("Game Three")).toHaveAttribute("title", "Third Game");
    expect(screen.queryByText("Game One")).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Search games by title, developer, or publisher..."), { target: { value: "" } });
    fireEvent.click(screen.getByLabelText("Show Excluded Games"));
    expect(localStorage.getItem("showExcludedGames")).toBe("true");
    expect(screen.getByText("Game Two")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Publisher/i }));
    const rows = screen.getAllByRole("row").slice(1);
    expect(within(rows[0]!).getByText("Game One")).toBeInTheDocument();
  });

  it("shows add and edit actions only for admins", async () => {
    mockFetch({
      "GET /api/auth/user": { isAuthenticated: true, username: "AdminUser", role: "Admin" },
      "GET /api/games/page-data": gamesPageData()
    });

    render(<Games />);

    expect(await screen.findByRole("button", { name: /Add New Game/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit Game One" })).toBeInTheDocument();
    expect(screen.queryByText("Game Two")).not.toBeInTheDocument();
  });
});

function gamesPageData() {
  return {
    games: [
      {
        id: 1,
        title: "Game One",
        developer: "Alpha",
        publisher: "First Publisher",
        firstReleased: "2001-01-01T00:00:00.000Z",
        regionFirstReleasedIn: "EU",
        imageUrl: "/covers/game-one.jpg",
        isExcluded: false,
        isOwned: true,
        howLongToBeatId: 12345,
        howLongToBeatMainStorySeconds: 5400,
        howLongToBeatMainExtraSeconds: 7200,
        howLongToBeatCompletionistSeconds: 10_800
      },
      {
        id: 2,
        title: "Game Two",
        developer: "Beta",
        publisher: "Second Publisher",
        firstReleased: "2002-02-02",
        regionFirstReleasedIn: "NA",
        imageUrl: null,
        isExcluded: true,
        isOwned: true
      },
      {
        id: 3,
        title: "Game Three",
        developer: "Gamma",
        publisher: "Third Publisher",
        firstReleased: "2003-03-03",
        regionFirstReleasedIn: "JP",
        imageUrl: null,
        isExcluded: false,
        isOwned: false
      }
    ],
    ownedTypes: { 1: "CIB", 2: "Loose" },
    exclusionReasons: { 2: "Not part of the challenge" },
    completionStatus: { 1: "Completed", 3: "In Progress" },
    alternateTitles: {
      3: [{ alternateTitleId: 31, gameId: 3, title: "Third Game", notes: null }]
    }
  };
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
