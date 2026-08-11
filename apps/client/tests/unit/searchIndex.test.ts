import { describe, expect, it } from "vitest";
import { buildSearchIndex, matchesSearchIndex } from "../../src/searchIndex.js";

type Item = { id: number; name: string; note?: string | null };

describe("searchIndex", () => {
  const items: Item[] = [
    { id: 1, name: "Beta", note: null },
    { id: 2, name: "Alpha", note: "Other Name" }
  ];
  const index = buildSearchIndex(items, (item) => item.id, (item) => [item.name, item.note]);

  it("matches indexed fields regardless of the source item's original casing", () => {
    expect(matchesSearchIndex(index, 1, "beta")).toBe(true);
    expect(matchesSearchIndex(index, 2, "other")).toBe(true);
  });

  it("expects the caller to lowercase the search term (matches Games.tsx/Progress.tsx/Votes.tsx usage)", () => {
    expect(matchesSearchIndex(index, 1, "BETA")).toBe(false);
  });

  it("returns false for a non-matching search term", () => {
    expect(matchesSearchIndex(index, 1, "missing")).toBe(false);
  });

  it("returns false for a key not present in the index", () => {
    expect(matchesSearchIndex(index, 999, "beta")).toBe(false);
  });

  it("ignores null/undefined fields when building the index", () => {
    expect(matchesSearchIndex(index, 1, "null")).toBe(false);
  });
});
