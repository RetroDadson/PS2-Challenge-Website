import { gameTableColumnIds } from "@ps2-challenge/shared";
import { beforeEach, describe, expect, it } from "vitest";
import {
  defaultGameTablePreferences,
  GAME_TABLE_COLUMNS,
  readLocalGameTablePreferences,
  reorderGameTableColumn,
  setGameTableColumnVisibility,
  visibleGameTableColumns
} from "../../src/gameTablePreferences.js";

describe("game table preferences", () => {
  beforeEach(() => localStorage.clear());

  it("uses every available column when local storage is absent or invalid", () => {
    const expectedOrder = GAME_TABLE_COLUMNS.map((column) => column.id);

    expect(expectedOrder).toEqual(gameTableColumnIds);
    expect(readLocalGameTablePreferences()).toEqual({ order: expectedOrder, hidden: [] });
    localStorage.setItem("gameTableColumns", "not-json");
    expect(readLocalGameTablePreferences()).toEqual({ order: expectedOrder, hidden: [] });
  });

  it("removes stale values and adds columns missing from older local storage", () => {
    localStorage.setItem("gameTableColumns", JSON.stringify({
      order: ["cover", "title", "removedColumn"],
      hidden: ["cover", "publisher", "removedColumn"]
    }));

    const preferences = readLocalGameTablePreferences();

    expect(preferences.order.slice(0, 2)).toEqual(["cover", "title"]);
    expect(preferences.order).toHaveLength(GAME_TABLE_COLUMNS.length);
    expect(new Set(preferences.order)).toEqual(new Set(GAME_TABLE_COLUMNS.map((column) => column.id)));
    expect(preferences.hidden).toEqual(["publisher"]);
  });

  it("keeps required columns visible while optional columns can be hidden and reordered", () => {
    let preferences = defaultGameTablePreferences();

    const defaultOrder = preferences.order;
    preferences = setGameTableColumnVisibility(preferences, "cover", false);
    preferences = setGameTableColumnVisibility(preferences, "publisher", false);

    expect(preferences.hidden).toEqual(["publisher"]);
    expect(preferences.order).toEqual(defaultOrder);
    expect(visibleGameTableColumns(preferences).map((column) => column.id)).toContain("cover");
    expect(visibleGameTableColumns(preferences).map((column) => column.id)).not.toContain("publisher");

    preferences = reorderGameTableColumn(preferences, "status", "howLongToBeat");
    expect(preferences.order.slice(0, 3)).toEqual(["cover", "title", "status"]);
    expect(reorderGameTableColumn(preferences, "cover", "status")).toBe(preferences);
    expect(reorderGameTableColumn(preferences, "status", "title")).toBe(preferences);
  });
});
