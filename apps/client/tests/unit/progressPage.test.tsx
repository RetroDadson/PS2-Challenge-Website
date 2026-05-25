import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Progress } from "../../src/pages/Progress.js";

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

describe("Progress page", () => {
  it("filters, sorts, counts, and renders cover status like the C# progress page", async () => {
    mockFetch({
      "GET /api/auth/user": { isAuthenticated: false },
      "GET /api/games/progress": progressRows(),
      "GET /api/games/page-data": pageDataRows()
    });

    render(<Progress />);

    expect(await screen.findByText("Showing 2 of 2 games | Completed: 1 | In Progress: 1")).toBeInTheDocument();
    const cover = screen.getByAltText("Game One cover");
    expect(cover).toHaveAttribute("src", "/covers/game-one.jpg");
    fireEvent.mouseEnter(cover, { clientX: 50, clientY: 70 });
    expect(document.querySelector(".cover-hover-preview")).toHaveAttribute("src", "/covers/game-one.jpg");
    fireEvent.mouseLeave(cover);
    expect(document.querySelector(".cover-hover-preview")).not.toBeInTheDocument();
    expect(screen.getByText("Game One")).toHaveAttribute("title", "Game Uno\nJapanese Game One");
    expect(screen.getByText("No Cover")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Add New Game/i })).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Search by title, criteria, or review..."), { target: { value: "hidden gem" } });
    expect(screen.getByText("Game Two")).toBeInTheDocument();
    expect(screen.queryByText("Game One")).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Search by title, criteria, or review..."), { target: { value: "" } });
    fireEvent.click(screen.getByLabelText("Show In Progress Only"));
    expect(screen.getByText("Game Two")).toBeInTheDocument();
    expect(screen.queryByText("Game One")).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Show In Progress Only"));
    fireEvent.click(screen.getByRole("button", { name: /Title/i }));
    const rows = screen.getAllByRole("row").slice(1);
    expect(within(rows[0]!).getByText("Game One")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("Game Two")).toBeInTheDocument();
  });

  it("keeps in-progress rows after completed rows when sorting by finished date and time", async () => {
    mockFetch({
      "GET /api/auth/user": { isAuthenticated: false },
      "GET /api/games/progress": progressRows(),
      "GET /api/games/page-data": pageDataRows()
    });

    render(<Progress />);

    expect(await screen.findByText("Showing 2 of 2 games | Completed: 1 | In Progress: 1")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Finished/i }));
    let rows = screen.getAllByRole("row").slice(1);
    expect(within(rows[0]!).getByText("Game One")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("Game Two")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Finished/i }));
    rows = screen.getAllByRole("row").slice(1);
    expect(within(rows[0]!).getByText("Game One")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("Game Two")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Time/i }));
    rows = screen.getAllByRole("row").slice(1);
    expect(within(rows[0]!).getByText("Game One")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("Game Two")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Time/i }));
    rows = screen.getAllByRole("row").slice(1);
    expect(within(rows[0]!).getByText("Game One")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("Game Two")).toBeInTheDocument();
  });

  it("lets admins edit existing progress with split completion time fields", async () => {
    const calls = mockFetch({
      "GET /api/auth/user": { isAuthenticated: true, username: "AdminUser", role: "Admin" },
      "GET /api/games/progress": progressRows(),
      "GET /api/games/page-data": pageDataRows(),
      "POST /api/games/progress": { progressId: 101, gameId: 1, message: "Progress for 'Game One' has been updated" }
    });

    render(<Progress />);

    expect(await screen.findByRole("button", { name: /Add New Game/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit Game One" }));

    expect(await screen.findByRole("heading", { name: "Edit Game Progress" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Finished (optional)"), { target: { value: "2025-01-20" } });
    fireEvent.change(screen.getByLabelText("hours"), { target: { value: "13" } });
    fireEvent.change(screen.getByLabelText("minutes"), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText("seconds"), { target: { value: "9" } });
    fireEvent.change(screen.getByLabelText("Review"), { target: { value: "Still excellent" } });
    fireEvent.click(screen.getByRole("button", { name: "Update" }));

    await waitFor(() =>
      expect(calls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            method: "POST",
            path: "/api/games/progress",
            body: expect.objectContaining({
              title: "Game One",
              dateStarted: "2025-01-01",
              dateFinished: "2025-01-20",
              completionTime: "13:05:09",
              review: "Still excellent",
              platform: "Physical"
            })
          })
        ])
      )
    );
  });
});

function progressRows() {
  return [
    {
      progressId: 101,
      gameId: 1,
      gameTitle: "Game One",
      imageUrl: "/covers/game-one.jpg",
      dateStarted: "2025-01-01",
      dateFinished: "2025-01-10",
      completionTime: "12:30:00",
      beatenCriteria: "Credits",
      review: "Great fun",
      platform: "Physical"
    },
    {
      progressId: 102,
      gameId: 2,
      gameTitle: "Game Two",
      imageUrl: null,
      dateStarted: "2025-02-01",
      dateFinished: null,
      completionTime: null,
      beatenCriteria: "Any%",
      review: "Hidden gem",
      platform: "Emulated"
    }
  ];
}

function gameRows() {
  return [
    { id: 1, title: "Game One", isExcluded: false, isOwned: true },
    { id: 2, title: "Game Two", isExcluded: false, isOwned: true }
  ];
}

function pageDataRows() {
  return {
    games: gameRows(),
    ownedTypes: {},
    exclusionReasons: {},
    completionStatus: {},
    alternateTitles: {
      1: [
        { alternateTitleId: 1, gameId: 1, title: "Game Uno", notes: null },
        { alternateTitleId: 2, gameId: 1, title: "Japanese Game One", notes: null }
      ]
    }
  };
}

type FetchCall = {
  method: string;
  path: string;
  body: unknown;
};

function mockFetch(routes: Record<string, unknown>) {
  const calls: FetchCall[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const rawUrl = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const path = rawUrl.startsWith("http") ? new URL(rawUrl).pathname : rawUrl;
      const method = (init?.method ?? "GET").toUpperCase();
      calls.push({
        method,
        path,
        body: init?.body ? JSON.parse(String(init.body)) : null
      });
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
  return calls;
}
