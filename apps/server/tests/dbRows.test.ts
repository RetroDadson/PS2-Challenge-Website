import { describe, expect, it } from "vitest";
import { mapAlternateTitle, mapGame, mapProgress, normalizePgInterval, sortGames } from "../src/utils/dbRows.js";

describe("db row helpers", () => {
  it("normalizes postgres intervals to the existing API duration shape", () => {
    expect(normalizePgInterval(null)).toBeNull();
    expect(normalizePgInterval("  ")).toBe("");
    expect(normalizePgInterval("10:30:45")).toBe("10:30:45");
    expect(normalizePgInterval("04:00")).toBe("04:00");
    expect(normalizePgInterval("04:00:00 elapsed")).toBe("04:00:00");
    expect(normalizePgInterval("4 days 04:00:00")).toBe("100:00:00");
  });

  it("normalizes database date objects to date-only API values", () => {
    expect(
      mapGame({
        game_id: 1,
        title: "Game",
        developer: "Dev",
        publisher: "Pub",
        first_released: new Date(2002, 5, 20),
        region_first_released_in: "JP",
        released_in_eu_or_na: false,
        image_url: null
      }).firstReleased
    ).toBe("2002-06-20");

    expect(
      mapProgress({
        progress_id: 1,
        game_id: 1,
        game_title: "Game",
        image_url: null,
        date_started: new Date(2024, 0, 3),
        date_finished: new Date(2024, 0, 5),
        completion_time: null,
        beaten_criteria: null,
        review: null,
        platform: "Physical"
      })
    ).toMatchObject({ dateStarted: "2024-01-03", dateFinished: "2024-01-05" });
  });

  it("sorts special-character game titles before alphanumeric titles", () => {
    const sorted = sortGames([
      { id: 1, title: "Zone", releasedInEuPalOrNa: false, isExcluded: false, isOwned: false },
      { id: 2, title: ".hack", releasedInEuPalOrNa: false, isExcluded: false, isOwned: false },
      { id: 3, title: "Ace Combat", releasedInEuPalOrNa: false, isExcluded: false, isOwned: false }
    ]);
    expect(sorted.map((game) => game.title)).toEqual([".hack", "Ace Combat", "Zone"]);
  });

  it("maps optional game flags, duration fields, and alternate titles", () => {
    expect(mapGame({
      game_id: 1,
      title: "Game",
      developer: null,
      publisher: null,
      first_released: null,
      region_first_released_in: null,
      released_in_eu_or_na: true,
      image_url: null,
      is_excluded: true,
      is_owned: true,
      howlongtobeat_id: 10,
      howlongtobeat_main_story_seconds: 100,
      howlongtobeat_main_extra_seconds: 200,
      howlongtobeat_completionist_seconds: 300
    })).toMatchObject({
      releasedInEuPalOrNa: true,
      isExcluded: true,
      isOwned: true,
      howLongToBeatId: 10,
      howLongToBeatMainStorySeconds: 100,
      howLongToBeatMainExtraSeconds: 200,
      howLongToBeatCompletionistSeconds: 300
    });
    expect(mapAlternateTitle({ alternate_title_id: 2, game_id: 1, title: "Alternate", notes: null })).toEqual({
      alternateTitleId: 2,
      gameId: 1,
      title: "Alternate",
      notes: null
    });
  });
});
