import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Votes } from "../../src/pages/Votes.js";

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

describe("Votes page", () => {
  it("matches the C# current-vote dashboard with covers, suggestions, pie legend, and fill-to-three", async () => {
    const calls = mockFetch({
      "GET /api/auth/user": { isAuthenticated: true, username: "AdminUser", role: "Admin" },
      "GET /api/votes/history": [
        {
          voteRound: 2,
          topGameTitle: "Game One",
          topVotes: 10,
          secondGameTitle: "Game Two",
          secondVotes: 10,
          lastGameTitle: "Game Three",
          lastVotes: 0,
          notes: ""
        },
        {
          voteRound: 1,
          topGameTitle: "Quiet Game",
          topVotes: 0,
          secondGameTitle: "Still Quiet",
          secondVotes: 0,
          lastGameTitle: "Silent Game",
          lastVotes: 0,
          notes: "No votes"
        }
      ],
      "GET /api/votes/current": [
        { gameId: 1, gameTitle: "Game One", voteCount: 10, gameNumber: 1 },
        { gameId: 3, gameTitle: "Game Three", voteCount: 5, gameNumber: 3 }
      ],
      "GET /api/games": [
        { id: 1, title: "Game One", imageUrl: "/covers/game-one.jpg", isExcluded: false, isOwned: true },
        { id: 2, title: "Game Two", imageUrl: "/covers/game-two.jpg", isExcluded: false, isOwned: true },
        { id: 3, title: "Game Three", imageUrl: null, isExcluded: false, isOwned: true }
      ],
      "POST /api/votes/current": { inserted: 1, updated: 0 },
      "POST /api/votes/current/fill-random": { message: "Successfully added 1 random game(s) to current votes", addedGames: [] }
    });

    render(<Votes />);

    const cover = await screen.findByAltText("Game One cover");
    expect(cover).toHaveAttribute("src", "/covers/game-one.jpg");
    fireEvent.mouseEnter(cover, { clientX: 60, clientY: 80 });
    expect(document.querySelector(".cover-hover-preview")).toHaveAttribute("src", "/covers/game-one.jpg");
    fireEvent.mouseLeave(cover);
    expect(document.querySelector(".cover-hover-preview")).not.toBeInTheDocument();
    expect(screen.getAllByText("Game Three").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Game One").length).toBeGreaterThan(0);
    expect(screen.getByText("Game One: 10 (66.7%)")).toBeInTheDocument();
    expect(screen.getByText("Game Three: 5 (33.3%)")).toBeInTheDocument();
    expect(screen.getByText("Showing 2 of 2 rounds")).toBeInTheDocument();
    expect(screen.getAllByText("Game One", { selector: ".game-title" }).length).toBeGreaterThan(0);
    expect(screen.getAllByText("(Tied)").length).toBeGreaterThan(0);

    fireEvent.change(screen.getByPlaceholderText("Game title"), { target: { value: "two" } });
    fireEvent.click(await screen.findByRole("button", { name: "Game Two" }));
    fireEvent.change(screen.getByLabelText("Vote count"), { target: { value: "7" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() =>
      expect(calls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            method: "POST",
            path: "/api/votes/current",
            body: [{ gameId: 0, gameTitle: "Game Two", voteCount: 7, gameNumber: 2 }]
          })
        ])
      )
    );

    fireEvent.click(screen.getByLabelText("Show only rounds with votes"));
    expect(screen.getByText("Showing 1 of 2 rounds")).toBeInTheDocument();
    expect(screen.queryByText("Quiet Game")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Fill with Random Games" }));
    await waitFor(() =>
      expect(calls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            method: "POST",
            path: "/api/votes/current/fill-random",
            body: { count: 1 }
          })
        ])
      )
    );
  });

  it("archives tied current votes through the modal with notes and manual positions", async () => {
    const calls = mockFetch({
      "GET /api/auth/user": { isAuthenticated: true, username: "AdminUser", role: "Admin" },
      "GET /api/votes/history": [],
      "GET /api/votes/current": [
        { gameId: 1, gameTitle: "Game One", voteCount: 10, gameNumber: 1 },
        { gameId: 2, gameTitle: "Game Two", voteCount: 10, gameNumber: 2 },
        { gameId: 3, gameTitle: "Game Three", voteCount: 1, gameNumber: 3 }
      ],
      "GET /api/games": [],
      "POST /api/votes/archive": { message: "Current votes archived successfully", round: 1, archivedCount: 3 }
    });

    render(<Votes />);

    expect((await screen.findAllByText(/Game One/)).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Archive to History" }));

    expect(await screen.findByRole("heading", { name: "Archive Current Votes to History" })).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Archive Current Votes to History" })).toBeInTheDocument();
    expect(screen.getByText("Tied Votes Detected")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Position for Game One"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Position for Game Two"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Notes"), { target: { value: "Tie breaker" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Archive" }).at(-1)!);

    await waitFor(() =>
      expect(calls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            method: "POST",
            path: "/api/votes/archive",
            body: {
              notes: "Tie breaker",
              manualPositions: {
                1: 2,
                2: 1
              }
            }
          })
        ])
      )
    );
  });

  it("updates vote numbers and pie chart immediately without showing the loading state", async () => {
    const calls: FetchCall[] = [];
    let currentVotes = [
      { gameId: 1, gameTitle: "Game One", voteCount: 10, gameNumber: 1 },
      { gameId: 3, gameTitle: "Game Three", voteCount: 5, gameNumber: 3 }
    ];

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const rawUrl = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        const path = rawUrl.startsWith("http") ? new URL(rawUrl).pathname : rawUrl;
        const method = (init?.method ?? "GET").toUpperCase();
        const body = init?.body ? JSON.parse(String(init.body)) : null;
        calls.push({ method, path, body });

        if (method === "GET" && path === "/api/auth/user") {
          return jsonResponse({ isAuthenticated: true, username: "AdminUser", role: "Admin" });
        }
        if (method === "GET" && path === "/api/votes/history") {
          return jsonResponse([]);
        }
        if (method === "GET" && path === "/api/votes/current") {
          return jsonResponse(currentVotes);
        }
        if (method === "GET" && path === "/api/games") {
          return jsonResponse([
            { id: 1, title: "Game One", imageUrl: "/covers/game-one.jpg", isExcluded: false, isOwned: true },
            { id: 3, title: "Game Three", imageUrl: null, isExcluded: false, isOwned: true }
          ]);
        }
        if (method === "PUT" && path === "/api/votes/current/by-game-number") {
          const update = body as { gameNumber: number; voteCount: number };
          currentVotes = currentVotes.map((vote) => (vote.gameNumber === update.gameNumber ? { ...vote, voteCount: update.voteCount } : vote));
          return jsonResponse({ message: "Vote count updated successfully", gameNumber: update.gameNumber, voteCount: update.voteCount });
        }
        return jsonResponse({ message: "Not Found" }, 404);
      })
    );

    render(<Votes />);

    expect(await screen.findByText("Game One: 10 (66.7%)")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Votes for Game One"), { target: { value: "12" } });

    expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Votes for Game One")).toHaveValue(12);
    expect(screen.getByText("Game One: 12 (70.6%)")).toBeInTheDocument();
    expect(screen.getByText("Game Three: 5 (29.4%)")).toBeInTheDocument();

    await waitFor(() =>
      expect(calls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            method: "PUT",
            path: "/api/votes/current/by-game-number",
            body: { gameNumber: 1, voteCount: 12 }
          })
        ])
      )
    );
  });
});

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

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}
