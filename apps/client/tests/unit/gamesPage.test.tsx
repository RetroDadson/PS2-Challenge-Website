import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultGameTablePreferences } from "../../src/gameTablePreferences.js";
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
      "GET /api/games/page-data": gamesPageData(),
      "GET /api/user/preferences/game-table-columns": { preferences: defaultGameTablePreferences() }
    });

    render(<Games />);

    expect(await screen.findByRole("button", { name: /Add New Game/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit Game One" })).toBeInTheDocument();
    expect(screen.queryByText("Game Two")).not.toBeInTheDocument();
  });

  it("hides and reorders columns and remembers anonymous choices in local storage", async () => {
    mockFetch({
      "GET /api/auth/user": { isAuthenticated: false },
      "GET /api/games/page-data": gamesPageData()
    });

    const firstRender = render(<Games />);
    await screen.findByText("Game One");
    fireEvent.click(screen.getByRole("button", { name: "Customise Columns" }));

    expect(screen.getByLabelText("Cover (always shown)")).toBeChecked();
    expect(screen.getByLabelText("Cover (always shown)")).toBeDisabled();
    expect(screen.getByLabelText("Title (always shown)")).toBeDisabled();
    expect(screen.getByLabelText("Cover column pinned")).toHaveAttribute("draggable", "false");
    expect(screen.getByLabelText("Title column pinned")).toHaveAttribute("draggable", "false");
    expect(screen.queryByRole("button", { name: /Move .* (up|down)/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Publisher"));
    const dataTransfer = { effectAllowed: "", dropEffect: "", setData: vi.fn() };
    const statusDragHandle = screen.getByRole("button", { name: "Drag Status column" });
    fireEvent.dragStart(statusDragHandle, { dataTransfer });
    fireEvent.dragEnter(screen.getByLabelText("Drag How Long To Beat Time column"), { dataTransfer });
    const dialog = screen.getByRole("dialog", { name: "Customise Game Columns" });
    expect(within(dialog).getAllByRole("button", { name: /^Drag / })[0]).toHaveAccessibleName("Drag Status column");
    fireEvent.dragOver(screen.getByLabelText("Drag How Long To Beat Time column"), { dataTransfer });
    fireEvent.drop(screen.getByLabelText("Drag How Long To Beat Time column"), { dataTransfer });

    expect(screen.getByRole("columnheader", { name: /Publisher/i })).toBeInTheDocument();
    expect(screen.getByText("First Publisher")).toBeInTheDocument();
    expect(firstThreeColumnNames()).toEqual(["Cover", "Title", "How Long To Beat Time"]);
    expect(localStorage.getItem("gameTableColumns")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("columnheader", { name: /Publisher/i })).not.toBeInTheDocument();
    expect(screen.queryByText("First Publisher")).not.toBeInTheDocument();
    expect(firstThreeColumnNames()).toEqual(["Cover", "Title", "Status"]);
    expect(JSON.parse(localStorage.getItem("gameTableColumns") ?? "null")).toMatchObject({ hidden: ["publisher"] });
    firstRender.unmount();
    render(<Games />);
    await screen.findByText("Game One");

    expect(screen.queryByRole("columnheader", { name: /Publisher/i })).not.toBeInTheDocument();
    expect(firstThreeColumnNames()).toEqual(["Cover", "Title", "Status"]);
    fireEvent.click(screen.getByRole("button", { name: "Customise Columns" }));
    expect(screen.getByLabelText("Publisher")).not.toBeChecked();
  });

  it("discards cancelled drafts and resets sorting when the sorted column is hidden", async () => {
    mockFetch({
      "GET /api/auth/user": { isAuthenticated: false },
      "GET /api/games/page-data": gamesPageData()
    });

    render(<Games />);
    await screen.findByText("Game One");
    fireEvent.click(screen.getByRole("button", { name: /Publisher/i }));
    expect(screen.getByRole("button", { name: "Publisher ▲" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Customise Columns" }));
    fireEvent.click(screen.getByLabelText("Publisher"));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.getByRole("columnheader", { name: /Publisher/i })).toBeInTheDocument();
    expect(localStorage.getItem("gameTableColumns")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Customise Columns" }));
    fireEvent.click(screen.getByLabelText("Publisher"));
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("columnheader", { name: /Publisher/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Title ▲" })).toBeInTheDocument();
  });

  it("loads and saves authenticated choices through the user API", async () => {
    const savedPreferences = {
      order: ["cover", "title", "status", "howLongToBeat", "developer", "publisher", "releaseDate", "region", "excluded", "owned"],
      hidden: ["publisher"]
    };
    const requests = mockFetch({
      "GET /api/auth/user": { isAuthenticated: true, username: "User", role: "User" },
      "GET /api/games/page-data": gamesPageData(),
      "GET /api/user/preferences/game-table-columns": { preferences: savedPreferences },
      "PUT /api/user/preferences/game-table-columns": { preferences: savedPreferences }
    });

    render(<Games />);

    await screen.findByText("Game One");
    expect(firstThreeColumnNames()).toEqual(["Cover", "Title", "Status"]);
    expect(screen.queryByRole("columnheader", { name: /Publisher/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Customise Columns" }));
    fireEvent.click(screen.getByLabelText("Developer"));
    expect(requests.some((request) => request.method === "PUT")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Done" }));

    await waitFor(() => expect(requests.some((request) => request.method === "PUT")).toBe(true));
    const update = requests.find((request) => request.method === "PUT");
    expect(update?.body).toMatchObject({ hidden: ["developer", "publisher"] });
    expect(localStorage.getItem("gameTableColumns")).toBeNull();
  });

  it("seeds missing authenticated preferences from local storage", async () => {
    const localPreferences = {
      order: ["cover", "title", "status", "howLongToBeat", "developer", "publisher", "releaseDate", "region", "excluded", "owned"],
      hidden: ["publisher"]
    };
    localStorage.setItem("gameTableColumns", JSON.stringify(localPreferences));
    const requests = mockFetch({
      "GET /api/auth/user": { isAuthenticated: true, username: "User", role: "User" },
      "GET /api/games/page-data": gamesPageData(),
      "GET /api/user/preferences/game-table-columns": { preferences: null },
      "PUT /api/user/preferences/game-table-columns": { preferences: localPreferences }
    });

    render(<Games />);

    await screen.findByText("Game One");
    expect(firstThreeColumnNames()).toEqual(["Cover", "Title", "Status"]);
    await waitFor(() => expect(requests.some((request) => request.method === "PUT")).toBe(true));
    expect(requests.find((request) => request.method === "PUT")?.body).toEqual(localPreferences);
  });
});

function firstThreeColumnNames() {
  return screen.getAllByRole("columnheader").slice(0, 3).map((header) => header.textContent?.replace(/[ ▲▼]+$/, ""));
}

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
  const requests: Array<{ method: string; path: string; body: unknown }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const rawUrl = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const path = rawUrl.startsWith("http") ? new URL(rawUrl).pathname : rawUrl;
      const method = (init?.method ?? "GET").toUpperCase();
      const body = init?.body ? JSON.parse(String(init.body)) as unknown : null;
      requests.push({ method, path, body });
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
  return requests;
}
