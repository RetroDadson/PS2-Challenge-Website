import type { SubPickedGameDto, SubPickStatsDto } from "@ps2-challenge/shared";
import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { howItWent, SubPickStats } from "../../src/components/SubPickStats.js";
import { mockFetch } from "./subPickFixtures.js";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const progress = {
  progressId: 10,
  gameId: 51,
  gameTitle: "Frequency",
  imageUrl: null,
  dateStarted: "2026-11-07",
  dateFinished: "2026-11-09",
  completionTime: "05:30:00",
  beatenCriteria: "Credits",
  review: null,
  platform: "Physical",
  deaths: 12,
  deathLabel: null
};

const picked: SubPickedGameDto = {
  drawId: 1,
  gameNumber: 10,
  kind: "10s",
  gameId: 51,
  gameTitle: "Frequency",
  twitchDisplayName: "ViewerTwo",
  entries: 1,
  totalEntries: 20,
  odds: 0.05,
  spins: 2,
  progress
};

const stats: SubPickStatsDto = {
  totals: { draws: 2, cancelledDraws: 1, spins: 3, respins: 1, entries: 40, viewers: 9 },
  mostPickedNow: [{ gameId: 50, gameTitle: "Amplitude", entries: 6 }, { gameId: 52, gameTitle: "Boogie", entries: 1 }],
  mostPickedAllTime: [{ gameId: 50, gameTitle: "Amplitude", entries: 9 }],
  longestShot: picked,
  subPickedGames: [{ ...picked, drawId: 2, gameNumber: 20, gameTitle: "Zathura", twitchDisplayName: null, odds: 0.5, progress: null }, picked]
};

describe("sub pick stats", () => {
  it("shows totals, the long shot, the most picked games and how sub-picked games went", async () => {
    mockFetch({ "GET /api/sub-picks/stats": stats });
    render(<SubPickStats />);

    const panel = await screen.findByRole("region", { name: "Stats" });
    expect(within(panel).getByText("Games Picked by Subs").parentElement).toHaveTextContent("2");
    expect(within(panel).getByText("Subs Taking Part").parentElement).toHaveTextContent("9");
    expect(within(panel).getByText(/Biggest long shot/)).toHaveTextContent("Biggest long shot: Frequency won game 10 with a 5.0% chance, picked by ViewerTwo.");
    const now = within(panel).getByRole("heading", { name: "Most Picked Now" }).parentElement!;
    expect(within(now).getAllByRole("listitem").map((item) => item.textContent)).toEqual(["Amplitude6 entries", "Boogie1 entry"]);
    const rows = within(within(panel).getByRole("table")).getAllByRole("row");
    expect(rows[1]).toHaveTextContent("20ZathuraAnonymous50%Not started-");
    expect(rows[2]).toHaveTextContent("10FrequencyViewerTwo5.0%Completed 09/11/2026 in 05:30:00 (Credits)12");
  });

  it("shows empty states and errors", async () => {
    mockFetch({
      "GET /api/sub-picks/stats": { ...stats, longestShot: null, mostPickedNow: [], mostPickedAllTime: [], subPickedGames: [] }
    });
    const { unmount } = render(<SubPickStats />);
    expect(await screen.findByText("No games have been picked by subs yet.")).toBeInTheDocument();
    expect(screen.getByText("Nobody has a pick waiting right now.")).toBeInTheDocument();
    expect(screen.queryByText(/Biggest long shot/)).not.toBeInTheDocument();
    unmount();

    mockFetch({ "GET /api/sub-picks/stats": [500, { message: "Stats broke" }] });
    render(<SubPickStats />);
    expect(await screen.findByText("Stats broke")).toBeInTheDocument();
  });

  it("describes games in progress and finished games without extra details", () => {
    expect(howItWent({ progress: { ...progress, dateFinished: null } })).toBe("In progress since 07/11/2026");
    expect(howItWent({ progress: { ...progress, completionTime: null, beatenCriteria: null } })).toBe("Completed 09/11/2026");
  });
});
