import { describe, expect, it } from "vitest";
import { normalizeTitle, titleContains, titlesMatch } from "../../src/utils/titleMatching.js";

describe("title matching", () => {
  it("normalizes punctuation and spacing like the C# helper", () => {
    expect(normalizeTitle("Grand Theft Auto: San Andreas")).toBe("grand theft auto san andreas");
    expect(normalizeTitle("  SSX   Tricky!! ")).toBe("ssx tricky");
    expect(normalizeTitle(null)).toBe("");
  });

  it("matches exact and normalized titles", () => {
    expect(titlesMatch("Ratchet & Clank", "ratchet clank")).toBe(true);
    expect(titlesMatch("Ico", "ICO")).toBe(true);
    expect(titlesMatch("Kingdom Hearts", "Final Fantasy X")).toBe(false);
    expect(titlesMatch("", "Kingdom Hearts")).toBe(false);
  });

  it("handles partial contains checks case-insensitively", () => {
    expect(titleContains("Metal Gear Solid 2", "gear")).toBe(true);
    expect(titleContains("Metal Gear Solid 2", "")).toBe(true);
    expect(titleContains("Metal Gear Solid 2", "tekken")).toBe(false);
    expect(titleContains(null, "tekken")).toBe(false);
  });
});
