import { describe, expect, it } from "vitest";
import {
  createGameSchema,
  excludeGameRequestSchema,
  setDeathsRequestSchema,
  updateExclusionRequestSchema,
  updateProgressRequestSchema
} from "../../src/schemas/games.js";

describe("game schemas", () => {
  it("matches C# game validation requirements", () => {
    const result = createGameSchema.safeParse({
      title: "",
      developer: "",
      publisher: "p".repeat(101),
      regionFirstReleasedIn: "",
      releasedInEuPalOrNa: false
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toEqual([
      "Title is required",
      "Developer is required",
      "Publisher cannot exceed 100 characters",
      "Region first released in is required"
    ]);
  });

  it("requires an exclusion reason on the legacy exclude endpoint", () => {
    const result = excludeGameRequestSchema.safeParse({ title: "Game", reason: "" });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toEqual(["Reason is required"]);
  });

  it("accepts isExcluded while tolerating the temporary TS exclude alias", () => {
    expect(updateExclusionRequestSchema.parse({ isExcluded: true, reason: "Testing" })).toEqual({
      isExcluded: true,
      reason: "Testing"
    });
    expect(updateExclusionRequestSchema.parse({ exclude: false })).toEqual({
      isExcluded: false,
      reason: undefined
    });
  });

  it("leaves progress death fields optional so existing callers keep their counters", () => {
    expect(updateProgressRequestSchema.parse({ title: "Game", dateStarted: "2024-01-01", platform: "Physical" })).not.toHaveProperty("deaths");
    expect(updateProgressRequestSchema.parse({ title: "Game", dateStarted: "2024-01-01", platform: "Physical", deaths: 3, deathLabel: "Crashes" })).toEqual(
      expect.objectContaining({ deaths: 3, deathLabel: "Crashes" })
    );
  });

  it("rejects negative, fractional, and oversized death counter values", () => {
    const progress = updateProgressRequestSchema.safeParse({
      title: "Game",
      dateStarted: "2024-01-01",
      platform: "Physical",
      deaths: -1,
      deathLabel: "x".repeat(51)
    });
    expect(progress.error?.issues.map((issue) => issue.message)).toEqual(["Deaths cannot be negative", "Death label cannot exceed 50 characters"]);

    expect(setDeathsRequestSchema.safeParse({ deaths: 1.5 }).error?.issues.map((issue) => issue.message)).toEqual(["Deaths must be a whole number"]);
    expect(setDeathsRequestSchema.parse({ deaths: 0 })).toEqual({ deaths: 0 });
  });
});
