import type { CurrentVoteDto, GameDto, GameProgressDto, VoteRoundDto } from "@ps2-challenge/shared";
import { describe, expect, it } from "vitest";
import { gamesPageHelpers } from "../../src/pages/Games.js";
import { statisticsPageHelpers } from "../../src/pages/Statistics.js";
import { votesPageHelpers } from "../../src/pages/Votes.js";

describe("statistics page helpers", () => {
  it("parses and formats duration boundary values", () => {
    expect(statisticsPageHelpers.parseDurationSeconds()).toBeNull();
    expect(statisticsPageHelpers.parseDurationSeconds("2")).toBe(7200);
    expect(statisticsPageHelpers.parseDurationSeconds("01:02:03")).toBe(3723);
    expect(statisticsPageHelpers.parseDurationSeconds("1.02:03:04")).toBe(93_784);

    expect([
      null,
      0,
      60,
      3600,
      3660
    ].map(statisticsPageHelpers.formatAverageDuration)).toEqual(["N/A", "0m", "1m", "1h", "1h 1m"]);
    expect([0, 60, 3600, 3660].map(statisticsPageHelpers.formatDurationLong)).toEqual(["0m", "1m", "1h", "1h 1m"]);
  });

  it("formats remaining time and streaming estimates", () => {
    expect(statisticsPageHelpers.calculateEstimatedStreamingWeeks(0, null)).toBe(0);
    expect(statisticsPageHelpers.calculateEstimatedStreamingWeeks(null, 1)).toBeNull();
    expect(statisticsPageHelpers.calculateEstimatedStreamingWeeks(1, null)).toBeNull();
    expect(statisticsPageHelpers.calculateEstimatedStreamingWeeks(1, 0)).toBeNull();
    expect(statisticsPageHelpers.calculateEstimatedStreamingWeeks(10, 2)).toBe(5);

    expect([
      null,
      0,
      1,
      60,
      3600,
      90_061
    ].map(statisticsPageHelpers.formatEstimatedTimeRemaining)).toEqual(["N/A", "Complete!", "1s", "1m", "1h", "1d 1h 1m 1s"]);
    expect([
      null,
      0,
      1,
      1.25,
      10.4,
      52,
      53,
      54,
      104
    ].map(statisticsPageHelpers.formatStreamingTimeRemaining)).toEqual([
      "N/A",
      "Complete!",
      "1 week",
      "1.3 weeks",
      "10 weeks",
      "1 year",
      "1 year 1 week",
      "1 year 2 weeks",
      "2 years"
    ]);
  });

  it("builds yearly, chart, ownership, and aggregate statistics", () => {
    const progress = [
      progressEntry(1, "2023-01-01", "2024-01-01", "01:30:00"),
      progressEntry(2, "not-a-date", "also-bad", null),
      progressEntry(3, "2023-02-01", null, null)
    ];
    expect(statisticsPageHelpers.calculateYearlyStatistics(progress, 4)).toEqual([
      { year: 2024, gamesStarted: 0, gamesCompleted: 1, completionPercentage: 25 },
      { year: 2023, gamesStarted: 2, gamesCompleted: 0, completionPercentage: 0 }
    ]);
    expect(statisticsPageHelpers.calculateYearlyStatistics(progress, 0)[0]?.completionPercentage).toBe(0);

    expect([1, 6, 11, 20, 44, 51, 110].map(statisticsPageHelpers.niceDurationCeiling)).toEqual([5, 10, 12, 24, 50, 60, 200]);
    expect(statisticsPageHelpers.buildDurationTicks(10)).toEqual([0, 2, 4, 6, 8, 10]);
    expect(statisticsPageHelpers.formatTickHours(2)).toBe("2h");
    expect(statisticsPageHelpers.formatTickHours(2.25)).toBe("2.3h");
    expect(statisticsPageHelpers.buildDurationChart([], 200, 1).areaPath).toBe("");
    expect(statisticsPageHelpers.buildDurationChart([
      { progressId: 1, label: "Game #1", gameTitle: "One", completionDate: "2024-01-01", durationSeconds: 3600, durationHours: 1 }
    ], 400, 2).points[0]?.showLabel).toBe(true);

    expect(statisticsPageHelpers.buildOwnershipSlices({})).toEqual([]);
    const slices = statisticsPageHelpers.buildOwnershipSlices({ 1: " CIB ", 2: "", 3: "CIB", 4: "Loose" });
    expect(slices.map((slice) => [slice.label, slice.value])).toEqual([["CIB", 2], ["Loose", 1], ["Not Specified", 1]]);
    expect(statisticsPageHelpers.sectorPath(0, 90, 10)).toContain(" 0 1 ");
    expect(statisticsPageHelpers.sectorPath(0, 270, 10)).toContain(" 1 1 ");
    expect(statisticsPageHelpers.angleToPoint(0, 10)).toEqual({ x: 10, y: 0 });

    const stats = statisticsPageHelpers.calculateStatistics([
      game(1, { isOwned: true }),
      game(2, { isExcluded: true, isOwned: true })
    ], [progress[0]!], { 1: "CIB" }, {
      channelLogin: "retrodadandsons",
      rangeStart: "2024-01-01",
      rangeEnd: "2024-01-08",
      rangeWeeks: 1,
      totalStreamSeconds: 1800,
      averageWeeklyStreamSeconds: 1800,
      vodCount: 1
    });
    expect(stats).toMatchObject({
      gamesInChallengeCount: 1,
      gamesCompletedCount: 1,
      gamesRemainingCount: 0,
      percentageComplete: 100,
      gamesCollectedInChallenge: 1,
      gamesCollectedButExcluded: 1,
      estimatedStreamingWeeks: 0
    });
    expect(statisticsPageHelpers.calculateStatistics([], [], {}, null).percentageComplete).toBe(0);
  });
});

describe("votes page helpers", () => {
  const rounds = [
    voteRound(2, "Zulu", 1, "Beta", 3, "Gamma", 2, null),
    voteRound(1, "Alpha", 0, "Delta", 0, "Echo", 0, "Quiet")
  ];

  it("filters, sorts, and marks vote history", () => {
    expect(votesPageHelpers.sortMarker("VoteRound", "TopVotes", true)).toBe("");
    expect(votesPageHelpers.sortMarker("VoteRound", "VoteRound", true)).toBe(" ▲");
    expect(votesPageHelpers.sortMarker("VoteRound", "VoteRound", false)).toBe(" ▼");
    expect(votesPageHelpers.filterVoteHistory(rounds, "", false)).toHaveLength(2);
    expect(votesPageHelpers.filterVoteHistory(rounds, "quiet", false)).toEqual([rounds[1]]);
    expect(votesPageHelpers.filterVoteHistory(rounds, "2", false)).toEqual([rounds[0]]);
    expect(votesPageHelpers.filterVoteHistory(rounds, "", true)).toEqual([rounds[0]]);

    for (const column of ["VoteRound", "TopGameTitle", "TopVotes", "SecondGameTitle", "SecondVotes", "LastGameTitle", "LastVotes"] as const) {
      expect(votesPageHelpers.sortVoteHistory(rounds, column, true)).toHaveLength(2);
      expect(votesPageHelpers.sortVoteHistory(rounds, column, false)).toEqual([...votesPageHelpers.sortVoteHistory(rounds, column, true)].reverse());
    }

    expect(votesPageHelpers.isTopTied(voteRound(1, "A", 2, "B", 2, "C", 1))).toBe(true);
    expect(votesPageHelpers.isTopTied(voteRound(1, "A", 2, "B", 2, "C", 1, null, 1))).toBe(false);
    expect(votesPageHelpers.isSecondTied(voteRound(1, "A", 2, "B", 2, "C", 1))).toBe(true);
    expect(votesPageHelpers.isSecondTied(voteRound(1, "A", 3, "B", 2, "C", 2))).toBe(true);
    expect(votesPageHelpers.isLastTied(voteRound(1, "A", 3, "B", 2, "C", 2))).toBe(true);
  });

  it("finds game slots and builds pie slices", () => {
    const games = [game(1, { title: "One" }), game(2, { title: "Two" })];
    expect(votesPageHelpers.nextAvailableGameNumber([currentVote(1, 1)])).toBe(2);
    expect(votesPageHelpers.nextAvailableGameNumber([currentVote(1, 1), currentVote(2, 2), currentVote(3, 3)])).toBe(1);
    expect(votesPageHelpers.findGameForVote(currentVote(1, 1, "Missing"), new Map([[1, games[0]!]]), games)).toBe(games[0]);
    expect(votesPageHelpers.findGameForVote(currentVote(9, 1, "two"), new Map(), games)).toBe(games[1]);
    expect(votesPageHelpers.findGameForVote(currentVote(9, 1, "none"), new Map(), games)).toBeUndefined();

    expect(votesPageHelpers.buildPieSlices([])[0]).toMatchObject({ label: "No votes", percent: 100 });
    expect(votesPageHelpers.buildPieSlices([currentVote(1, 1, "One", 4)])[0]?.path).toBe(votesPageHelpers.fullCirclePath(70));
    const slices = votesPageHelpers.buildPieSlices([
      currentVote(1, 1, "One", 3),
      currentVote(2, 2, "Two", 1),
      currentVote(3, 3, "Three", 0)
    ]);
    expect(slices.map((slice) => slice.percent)).toEqual([75, 25]);
    expect(votesPageHelpers.sectorPath(0, 270, 10)).toContain(" 1 1 ");
    expect(votesPageHelpers.sectorPath(0, 90, 10)).toContain(" 0 1 ");
    expect(votesPageHelpers.formatPathNumber(1)).toBe("1");
    expect(votesPageHelpers.formatPathNumber(1.23456)).toBe("1.235");
  });
});

describe("games page helpers", () => {
  const games = [
    game(1, { title: "Beta", developer: null, isOwned: true, howLongToBeatMainStorySeconds: null }),
    game(2, { title: "Alpha", developer: "Dev", isExcluded: true, howLongToBeatMainStorySeconds: 3600 })
  ];

  it("handles row, search, status, and time variants", () => {
    expect(gamesPageHelpers.gameRowClass(games[1]!)).toBe("excluded-row");
    expect(gamesPageHelpers.gameRowClass(games[0]!)).toBe("owned-row");
    expect(gamesPageHelpers.gameRowClass(game(3))).toBeUndefined();
    expect(gamesPageHelpers.gameMatchesSearch(games[0]!, "beta", {})).toBe(true);
    expect(gamesPageHelpers.gameMatchesSearch(games[0]!, "other", { 1: [{ title: "Other Name" }] })).toBe(true);
    expect(gamesPageHelpers.gameMatchesSearch(games[0]!, "missing", {})).toBe(false);
    expect(gamesPageHelpers.getCompletionStatus({}, 1)).toBe("Not Started");
    expect(["Completed", "In Progress", "Other"].map(gamesPageHelpers.statusClass)).toEqual(["status-completed", "status-inprogress", "status-notstarted"]);
    expect([undefined, 0, -1, 59, 3599, 3600, 3660].map(gamesPageHelpers.formatHowLongToBeatSeconds)).toEqual(["Unknown", "Unknown", "Unknown", "1m", "1h", "1h", "1h 1m"]);
    expect(gamesPageHelpers.howLongToBeatTitle(game(1))).toContain("Unknown");
  });

  it("sorts every game column and all nullable-number combinations", () => {
    expect(gamesPageHelpers.sortMarker("Title", "Developer", true)).toBe("");
    expect(gamesPageHelpers.sortMarker("Title", "Title", true)).toBe(" ▲");
    expect(gamesPageHelpers.sortMarker("Title", "Title", false)).toBe(" ▼");
    for (const column of ["Title", "HowLongToBeat", "Developer", "Publisher", "FirstReleased", "RegionFirstReleasedIn", "IsExcluded", "IsOwned", "CompletionStatus"] as const) {
      expect(gamesPageHelpers.sortGames(games, column, true, { 1: "Completed" })).toHaveLength(2);
      expect(gamesPageHelpers.sortGames(games, column, false, { 1: "Completed" })).toEqual([...gamesPageHelpers.sortGames(games, column, true, { 1: "Completed" })].reverse());
    }
    expect(gamesPageHelpers.compareNullableNumber(null, undefined)).toBe(0);
    expect(gamesPageHelpers.compareNullableNumber(null, 1)).toBe(1);
    expect(gamesPageHelpers.compareNullableNumber(1, null)).toBe(-1);
    expect(gamesPageHelpers.compareNullableNumber(1, 2)).toBe(-1);
  });
});

function game(id: number, overrides: Partial<GameDto> = {}): GameDto {
  return {
    id,
    title: `Game ${id}`,
    releasedInEuPalOrNa: false,
    isExcluded: false,
    isOwned: false,
    ...overrides
  };
}

function progressEntry(progressId: number, dateStarted: string, dateFinished: string | null, completionTime: string | null): GameProgressDto {
  return { progressId, gameId: progressId, gameTitle: `Game ${progressId}`, dateStarted, dateFinished, completionTime, platform: "PS2" };
}

function voteRound(voteRoundNumber: number, topGameTitle: string, topVotes: number, secondGameTitle: string, secondVotes: number, lastGameTitle: string, lastVotes: number, notes: string | null = null, topPosition?: number): VoteRoundDto {
  return { voteRound: voteRoundNumber, topGameTitle, topVotes, topPosition, secondGameTitle, secondVotes, lastGameTitle, lastVotes, notes };
}

function currentVote(gameId: number, gameNumber: number, gameTitle = `Game ${gameId}`, voteCount = 0): CurrentVoteDto {
  return { gameId, gameNumber, gameTitle, voteCount };
}
