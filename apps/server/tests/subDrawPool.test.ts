import { describe, expect, it } from "vitest";
import { drawKindFor, liveSliceOrder } from "../src/services/subDrawPool.js";
import { oddsFor } from "../src/services/subDrawService.js";
import { shuffle } from "../src/utils/shuffle.js";

describe("sub draw pool helpers", () => {
  it("knows which game numbers have a draw", () => {
    expect(drawKindFor(9)).toBeNull();
    expect(drawKindFor(10)).toBe("10s");
    expect(drawKindFor(90)).toBe("10s");
    expect(drawKindFor(100)).toBe("100s");
    expect(drawKindFor(200)).toBe("100s");
  });

  it("keeps the stored order, drops entries that left the pool and slots new ones in the same place every time", () => {
    expect(liveSliceOrder([3, 1, 2], [1, 2, 3], 7)).toEqual([3, 1, 2]);
    expect(liveSliceOrder([3, 1, 2], [1, 3], 7)).toEqual([3, 1]);

    const withNew = liveSliceOrder([3, 1, 2], [1, 2, 3, 9, 4], 7);
    expect(withNew).toHaveLength(5);
    expect(withNew.filter((id) => id <= 3)).toEqual([3, 1, 2]);
    expect(liveSliceOrder([3, 1, 2], [4, 9, 3, 2, 1], 7)).toEqual(withNew);
    expect(liveSliceOrder([], [5, 6], 1)).toHaveLength(2);
  });

  it("works out each game's share of the wheel", () => {
    expect(
      oddsFor([
        { game_id: 2, game_title: "Beta" },
        { game_id: 1, game_title: "Alpha" },
        { game_id: 2, game_title: "Beta" },
        { game_id: 3, game_title: "Aardvark" }
      ])
    ).toEqual([
      { gameId: 2, gameTitle: "Beta", entries: 2, odds: 0.5 },
      { gameId: 3, gameTitle: "Aardvark", entries: 1, odds: 0.25 },
      { gameId: 1, gameTitle: "Alpha", entries: 1, odds: 0.25 }
    ]);
    expect(oddsFor([])).toEqual([]);
  });

  it("shuffles without losing or duplicating items", () => {
    const items = Array.from({ length: 50 }, (_, index) => index);
    const shuffled = shuffle(items);
    expect([...shuffled].sort((left, right) => left - right)).toEqual(items);
    expect(items[0]).toBe(0);
  });
});
