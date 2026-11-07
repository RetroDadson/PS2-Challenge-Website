import type { MySubPicksDto, SubEntryDto, SubPicksSummaryDto } from "@ps2-challenge/shared";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SubPicks } from "../../src/pages/SubPicks.js";
import { SubPicksMine } from "../../src/pages/SubPicksMine.js";
import { entryStatusClass, entryStatusLabel, formatOdds } from "../../src/subPickLabels.js";
import { entry, mockFetch } from "./subPickFixtures.js";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("SubPicks page", () => {
  it("shows the draw schedule, tier values and both pools", async () => {
    mockFetch({ "GET /api/sub-picks/summary": summary(), "GET /api/auth/user": { isAuthenticated: false } });
    renderPage(<SubPicks />);

    expect(await screen.findByRole("heading", { name: "Sub Picks" })).toBeInTheDocument();
    expect(screen.getByText(/Tier 1 and Prime: 1 entry\. Tier 2: 2 entries\. Tier 3: 5 entries\./)).toBeInTheDocument();
    expect(screen.getByText("Game 8")).toBeInTheDocument();
    expect(screen.getByText("Next 10s draw: Game 10")).toBeInTheDocument();
    expect(screen.getByText("2 games to go")).toBeInTheDocument();
    const pool = screen.getByRole("region", { name: "Next Draw Pool (Game 10)" });
    expect(within(pool).getByRole("row", { name: "Frequency 3 75%" })).toBeInTheDocument();
    expect(within(pool).getByRole("row", { name: "Amplitude 1 25%" })).toBeInTheDocument();
    expect(screen.getByText("Nothing in the 100s pool yet.")).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "Login to Pick" })).toHaveAttribute("href", "/api/auth/login?returnUrl=%2Fsub-picks%2Fmine");
  });

  it("explains a due 100s draw and links signed-in viewers to their entries", async () => {
    mockFetch({
      "GET /api/sub-picks/summary": summary({
        schedule: { nextGameNumber: 100, nextDrawGameNumber: 100, nextDrawKind: "100s", gamesUntilNextDraw: 0, nextHundredDrawGameNumber: 100, gamesUntilNextHundredDraw: 0 },
        nextDrawPool: { totalEntries: 0, games: [] }
      }),
      "GET /api/auth/user": { isAuthenticated: true, username: "ViewerOne" }
    });
    renderPage(<SubPicks />);

    expect(await screen.findAllByText("Next 100s draw: Game 100", { selector: ".stat-label" })).toHaveLength(2);
    expect(screen.getAllByText("Next game")).toHaveLength(2);
    expect(screen.getByText(/This is a 100s draw/)).toBeInTheDocument();
    expect(screen.getByText(/If the pool is empty when the draw comes up/)).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "My Entries" })).toHaveAttribute("href", "/sub-picks/mine");
  });

  it("shows load errors", async () => {
    mockFetch({ "GET /api/sub-picks/summary": [500, { message: "Database unavailable" }], "GET /api/auth/user": { isAuthenticated: false } });
    renderPage(<SubPicks />);
    expect(await screen.findByText("Database unavailable")).toBeInTheDocument();
  });
});

const signedIn = { isAuthenticated: true, username: "ViewerOne", twitchId: "1001" };

describe("SubPicksMine page", () => {
  it("asks anonymous viewers to log in", async () => {
    const calls = mockFetch({ "GET /api/auth/user": { isAuthenticated: false }, "GET /api/sub-picks/eligible-games": [] });
    renderPage(<SubPicksMine />);
    expect(await screen.findByRole("heading", { name: "Not Logged In" })).toBeInTheDocument();
    expect(calls.some((call) => call.key === "GET /api/sub-picks/me")).toBe(false);
    expect(screen.getByRole("link", { name: "Login with Twitch" })).toHaveAttribute("href", "/api/auth/login?returnUrl=%2Fsub-picks%2Fmine");
  });

  it("lists entries with stats and lets viewers pick, change and clear games", async () => {
    let mine = mySubPicks([entry({ id: 1 }), entry({ id: 2, gameId: 3, gameTitle: "Frequency", pool: "next_draw" }), entry({ id: 3, gameId: 2, gameTitle: "Burnout 3", status: "in_100s_pool", pool: "100s_pool", canChangePick: false })]);
    const calls = mockFetch({
      "GET /api/auth/user": signedIn,
      "GET /api/sub-picks/me": () => mine,
      "GET /api/sub-picks/eligible-games": [
        { id: 1, title: "Amplitude", imageUrl: null },
        { id: 3, title: "Frequency", imageUrl: null }
      ],
      "PUT /api/sub-picks/me/entries/1/pick": (body: { gameId: number }) => {
        mine = mySubPicks([entry({ id: 1, gameId: body.gameId, gameTitle: "Amplitude", pool: "next_draw" }), ...mine.entries.slice(1)]);
        return mine.entries[0];
      },
      "PUT /api/sub-picks/me/entries/2/pick": () => entry({ id: 2 })
    });
    renderPage(<SubPicksMine />);

    expect(await screen.findByText("Entries Earned")).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(screen.getByText("Draws Entered").parentElement).toHaveTextContent("3");
    expect(screen.getByText("Needs a pick")).toBeInTheDocument();
    expect(screen.getByText("In the 100s pool")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Change game for entry 3" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Pick game for entry 1" }));
    fireEvent.change(screen.getByLabelText("Search games"), { target: { value: "ampl" } });
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual(["Amplitude"]);
    fireEvent.change(screen.getByLabelText("Game"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Pick" }));
    expect(await screen.findByText("Entry 1 is now on Amplitude")).toBeInTheDocument();
    expect(calls).toContainEqual({ key: "PUT /api/sub-picks/me/entries/1/pick", body: { gameId: 1 } });

    fireEvent.click(screen.getByRole("button", { name: "Change game for entry 2" }));
    fireEvent.click(screen.getByRole("button", { name: "Clear Pick" }));
    expect(await screen.findByText("Cleared the pick on entry 2")).toBeInTheDocument();
  });

  it("shows pick errors and lets the viewer cancel", async () => {
    mockFetch({
      "GET /api/auth/user": signedIn,
      "GET /api/sub-picks/me": mySubPicks([entry({ id: 1 })]),
      "GET /api/sub-picks/eligible-games": [{ id: 1, title: "Amplitude", imageUrl: null }],
      "PUT /api/sub-picks/me/entries/1/pick": [409, { message: "This entry has already been in a draw" }]
    });
    renderPage(<SubPicksMine />);

    fireEvent.click(await screen.findByRole("button", { name: "Pick game for entry 1" }));
    fireEvent.change(screen.getByLabelText("Search games"), { target: { value: "zzz" } });
    expect(screen.getByText("No games match that search.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Search games"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Game"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Pick" }));
    expect(await screen.findByText("This entry has already been in a draw")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByLabelText("Search games")).not.toBeInTheDocument());
  });

  it("shows an empty state and eligible game errors", async () => {
    mockFetch({ "GET /api/auth/user": signedIn, "GET /api/sub-picks/me": mySubPicks([]), "GET /api/sub-picks/eligible-games": [500, { message: "Games failed" }] });
    renderPage(<SubPicksMine />);
    expect(await screen.findByText(/No entries yet/)).toBeInTheDocument();
  });

  it("shows the eligible games error inside the picker", async () => {
    mockFetch({ "GET /api/auth/user": signedIn, "GET /api/sub-picks/me": mySubPicks([entry({ id: 1 })]), "GET /api/sub-picks/eligible-games": [500, { message: "Games failed" }] });
    renderPage(<SubPicksMine />);
    fireEvent.click(await screen.findByRole("button", { name: "Pick game for entry 1" }));
    expect(await screen.findByText("Games failed")).toBeInTheDocument();
  });

  it("shows other load errors and treats an expired session as logged out", async () => {
    mockFetch({ "GET /api/auth/user": signedIn, "GET /api/sub-picks/me": [500, { message: "Broken" }], "GET /api/sub-picks/eligible-games": [] });
    const { unmount } = renderPage(<SubPicksMine />);
    expect(await screen.findByText("Broken")).toBeInTheDocument();
    unmount();

    mockFetch({ "GET /api/auth/user": signedIn, "GET /api/sub-picks/me": [401, {}], "GET /api/sub-picks/eligible-games": [] });
    renderPage(<SubPicksMine />);
    expect(await screen.findByRole("heading", { name: "Not Logged In" })).toBeInTheDocument();
  });
});

describe("sub pick labels", () => {
  it("describes every entry state", () => {
    expect(entryStatusLabel({ status: "won", pool: "finished", playedGameNumber: null })).toBe("Won");
    expect(entryStatusLabel({ status: "lost", pool: "finished", playedGameNumber: null })).toBe("Lost in a 100s draw");
    expect(entryStatusLabel({ status: "voided", pool: "finished", playedGameNumber: null })).toBe("Removed");
    expect(entryStatusLabel({ status: "removed_played", pool: "finished", playedGameNumber: 40 })).toBe("Played at game 40");
    expect(entryStatusLabel({ status: "in_100s_pool", pool: "finished", playedGameNumber: null })).toBe("Game already played");
    expect(entryStatusLabel({ status: "undrawn", pool: "needs_new_pick", playedGameNumber: null })).toBe("Needs a new pick");
    expect(entryStatusLabel({ status: "undrawn", pool: "next_draw", playedGameNumber: null })).toBe("In the next draw");
    expect(entryStatusClass({ status: "won", pool: "finished" })).toBe("status-completed");
    expect(entryStatusClass({ status: "undrawn", pool: "needs_new_pick" })).toBe("status-inprogress");
    expect(entryStatusClass({ status: "in_100s_pool", pool: "100s_pool" })).toBe("included-badge");
    expect(entryStatusClass({ status: "lost", pool: "finished" })).toBe("status-notstarted");
    expect(formatOdds(0.5)).toBe("50%");
    expect(formatOdds(0.042)).toBe("4.2%");
    expect(formatOdds(0)).toBe("0%");
  });
});

function renderPage(page: React.ReactElement) {
  return render(<MemoryRouter>{page}</MemoryRouter>);
}

function summary(overrides: Partial<SubPicksSummaryDto> = {}): SubPicksSummaryDto {
  return {
    schedule: { nextGameNumber: 8, nextDrawGameNumber: 10, nextDrawKind: "10s", gamesUntilNextDraw: 2, nextHundredDrawGameNumber: 100, gamesUntilNextHundredDraw: 92 },
    nextDrawPool: {
      totalEntries: 4,
      games: [
        { gameId: 3, gameTitle: "Frequency", imageUrl: null, entries: 3, odds: 0.75 },
        { gameId: 1, gameTitle: "Amplitude", imageUrl: null, entries: 1, odds: 0.25 }
      ]
    },
    tensPool: { totalEntries: 4, games: [] },
    hundredsPool: { totalEntries: 0, games: [] },
    overlayMessage: "Sub to add a game to the wheel.",
    tierEntries: { tier1: 1, tier2: 2, tier3: 5 },
    ...overrides
  };
}

function mySubPicks(entries: SubEntryDto[]): MySubPicksDto {
  return { entries, stats: { entriesEarned: entries.length, picksMade: entries.filter((item) => item.gameId).length, wins: 0, drawsEntered: 3, nextDrawOdds: 0.5 } };
}
