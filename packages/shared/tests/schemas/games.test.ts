import { describe, expect, it } from "vitest";
import { createGameSchema, excludeGameRequestSchema, updateExclusionRequestSchema } from "../../src/schemas/games.js";

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
});
