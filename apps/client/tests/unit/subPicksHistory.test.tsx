import type { SubDrawHistoryDto, SubDrawHistoryEntryDto } from "@ps2-challenge/shared";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { entryFate, SubPicksHistory } from "../../src/pages/SubPicksHistory.js";
import { mockFetch } from "./subPickFixtures.js";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const winner = { entryId: 2, gameId: 51, gameTitle: "Frequency", twitchDisplayName: "ViewerTwo", entries: 1, odds: 1 / 3 };
const rejected = { entryId: 1, gameId: 50, gameTitle: "Amplitude", twitchDisplayName: "ViewerOne", entries: 2, odds: 2 / 3 };

function entry(overrides: Partial<SubDrawHistoryEntryDto>): SubDrawHistoryEntryDto {
  return {
    entryId: 1,
    gameId: 50,
    gameTitle: "Amplitude",
    twitchDisplayName: "ViewerOne",
    outcome: "moved_to_100s",
    playedGameNumber: null,
    currentStatus: "in_100s_pool",
    currentPlayedGameNumber: null,
    ...overrides
  };
}

const accepted: SubDrawHistoryDto = {
  id: 4,
  kind: "10s",
  gameNumber: 60,
  status: "accepted",
  createdAt: "2026-11-07T19:00:00.000Z",
  finishedAt: "2026-11-07T19:05:00.000Z",
  winner,
  odds: [
    { gameId: 50, gameTitle: "Amplitude", entries: 2, odds: 2 / 3 },
    { gameId: 51, gameTitle: "Frequency", entries: 1, odds: 1 / 3 }
  ],
  entries: [
    entry({ entryId: 1 }),
    entry({ entryId: 2, gameId: 51, gameTitle: "Frequency", twitchDisplayName: "ViewerTwo", outcome: "won", playedGameNumber: 60, currentStatus: "won", currentPlayedGameNumber: 60 }),
    entry({ entryId: 3, twitchDisplayName: null })
  ],
  spins: [
    { spinNumber: 1, startedAt: "2026-11-07T19:01:00.000Z", decision: "respun", result: rejected },
    { spinNumber: 2, startedAt: "2026-11-07T19:03:00.000Z", decision: "accepted", result: winner }
  ]
};

const cancelled: SubDrawHistoryDto = { ...accepted, id: 3, gameNumber: 50, status: "cancelled", winner: null, odds: [], entries: [], spins: [] };

function renderPage() {
  return render(<MemoryRouter><SubPicksHistory /></MemoryRouter>);
}

describe("sub pick draw history", () => {
  it("shows each finished draw with its winner, spins and entries", async () => {
    mockFetch({ "GET /api/sub-picks/history": [accepted, cancelled] });
    renderPage();

    const draw = await screen.findByRole("article", { name: "Game 60" });
    expect(within(draw).getByText("10s draw")).toBeInTheDocument();
    expect(within(draw).getByText("7 November 2026")).toBeInTheDocument();
    expect(within(draw).getByText("Frequency", { selector: "strong" }).parentElement).toHaveTextContent(
      "Frequency picked by ViewerTwo · 1 of 3 entries (33% chance)"
    );
    expect(within(draw).getByText("3 entries · 2 games · 2 spins")).toBeInTheDocument();

    fireEvent.click(within(draw).getByText("Spins and entries"));
    const spins = within(within(draw).getByRole("table", { name: "Spins" })).getAllByRole("row");
    expect(spins[1]).toHaveTextContent("1");
    expect(spins[1]).toHaveTextContent("Amplitude (ViewerOne)67%Respun");
    expect(spins[2]).toHaveTextContent("Frequency (ViewerTwo)33%Accepted");
    const entries = within(within(draw).getByRole("table", { name: "Entries" })).getAllByRole("row");
    expect(entries[1]).toHaveTextContent("ViewerOneAmplitudeMoved to the 100s pool");
    expect(entries[2]).toHaveTextContent("ViewerTwoFrequencyWon game 60");
    expect(entries[2]).toHaveClass("is-winner");
    expect(entries[3]).toHaveTextContent("AnonymousAmplitude");

    const cancelledDraw = screen.getByRole("article", { name: "Game 50" });
    expect(within(cancelledDraw).getByText("Cancelled with no winner.")).toBeInTheDocument();
    expect(within(cancelledDraw).getByText("0 entries · 0 games · 0 spins")).toBeInTheDocument();
    expect(within(cancelledDraw).queryByText("Spins and entries")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to Sub Picks" })).toHaveAttribute("href", "/sub-picks");
  });

  it("shows empty and error states", async () => {
    mockFetch({ "GET /api/sub-picks/history": [] });
    const { unmount } = renderPage();
    expect(await screen.findByText("No draws have finished yet.")).toBeInTheDocument();
    unmount();

    mockFetch({ "GET /api/sub-picks/history": [500, { message: "History broke" }] });
    renderPage();
    expect(await screen.findByText("History broke")).toBeInTheDocument();
  });

  it("explains what happened to every kind of entry", () => {
    const draw = { gameNumber: 60, status: "accepted" as const };
    expect(entryFate(entry({ outcome: "won", playedGameNumber: null }), draw)).toBe("Won game 60");
    expect(entryFate(entry({ outcome: "removed_played", playedGameNumber: 60 }), draw)).toBe("Same game won, so it was played at game 60");
    expect(entryFate(entry({ outcome: "removed_played", playedGameNumber: null }), draw)).toBe("Same game won, so it was played at game 60");
    expect(entryFate(entry({ outcome: "lost" }), draw)).toBe("Lost in the 100s draw");
    expect(entryFate(entry({ currentStatus: "won", currentPlayedGameNumber: 100 }), draw)).toBe("Moved to the 100s pool, then won game 100");
    expect(entryFate(entry({ currentStatus: "lost" }), draw)).toBe("Moved to the 100s pool, then lost in the 100s draw");
    expect(entryFate(entry({ currentStatus: "removed_played", currentPlayedGameNumber: 73 }), draw)).toBe(
      "Moved to the 100s pool, then its game was played at game 73"
    );
    expect(entryFate(entry({ currentStatus: "voided" }), draw)).toBe("Moved to the 100s pool, then removed");
    expect(entryFate(entry({ outcome: null }), { gameNumber: 60, status: "cancelled" })).toBe("Draw cancelled, entry went back to waiting");
    expect(entryFate(entry({ outcome: null }), draw)).toBe("No result");
  });
});
