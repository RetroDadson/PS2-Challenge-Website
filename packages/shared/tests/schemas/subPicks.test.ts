import { describe, expect, it } from "vitest";
import {
  createSubGrantRequestSchema,
  setSubEntryPickRequestSchema,
  subDrawSchedule,
  subGrantEntryCount,
  subTierEntryValue,
  twitchUserLookupRequestSchema,
  updateSubPickSettingsRequestSchema
} from "../../src/schemas/subPicks.js";

const settings = { tier1Entries: 1, tier2Entries: 2, tier3Entries: 5 };

describe("sub pick helpers", () => {
  it("maps tiers to entry values with Prime counted as Tier 1", () => {
    expect(subTierEntryValue("prime", settings)).toBe(1);
    expect(subTierEntryValue("1000", settings)).toBe(1);
    expect(subTierEntryValue("2000", settings)).toBe(2);
    expect(subTierEntryValue("3000", settings)).toBe(5);
  });

  it("multiplies gifted subs by the gift count only for gifts", () => {
    expect(subGrantEntryCount({ tier: "3000", grantType: "gift", giftCount: 4 }, settings)).toBe(20);
    expect(subGrantEntryCount({ tier: "1000", grantType: "gift" }, settings)).toBe(1);
    expect(subGrantEntryCount({ tier: "2000", grantType: "resub", giftCount: 10 }, settings)).toBe(2);
  });

  it("schedules 10s and 100s draws from the next game number", () => {
    expect(subDrawSchedule(1)).toEqual({
      nextGameNumber: 1,
      nextDrawGameNumber: 10,
      nextDrawKind: "10s",
      gamesUntilNextDraw: 9,
      nextHundredDrawGameNumber: 100,
      gamesUntilNextHundredDraw: 99
    });
    expect(subDrawSchedule(10)).toMatchObject({ nextDrawGameNumber: 10, gamesUntilNextDraw: 0, nextDrawKind: "10s" });
    expect(subDrawSchedule(91)).toMatchObject({ nextDrawGameNumber: 100, nextDrawKind: "100s", gamesUntilNextHundredDraw: 9 });
    expect(subDrawSchedule(101)).toMatchObject({ nextDrawGameNumber: 110, nextHundredDrawGameNumber: 200 });
  });
});

describe("sub pick request schemas", () => {
  it("accepts manual grants with numeric Twitch IDs and valid logins", () => {
    expect(
      createSubGrantRequestSchema.parse({ twitchUserId: "1001", twitchLogin: "viewer_one", twitchDisplayName: "Viewer One", tier: "prime", grantType: "new" })
    ).toMatchObject({ tier: "prime" });
    expect(createSubGrantRequestSchema.safeParse({ twitchUserId: "abc", twitchLogin: "viewer", twitchDisplayName: "V", tier: "1000", grantType: "new" }).success).toBe(false);
    expect(createSubGrantRequestSchema.safeParse({ twitchUserId: "1", twitchLogin: "viewer", twitchDisplayName: "V", tier: "4000", grantType: "new" }).success).toBe(false);
    expect(createSubGrantRequestSchema.safeParse({ twitchUserId: "1", twitchLogin: "viewer", twitchDisplayName: "V", tier: "1000", grantType: "new", extra: 1 }).success).toBe(false);
  });

  it("validates lookups, picks and settings", () => {
    expect(twitchUserLookupRequestSchema.safeParse({ login: "retro_dadson" }).success).toBe(true);
    expect(twitchUserLookupRequestSchema.safeParse({ login: "two words" }).success).toBe(false);
    expect(setSubEntryPickRequestSchema.parse({ gameId: null })).toEqual({ gameId: null });
    expect(setSubEntryPickRequestSchema.safeParse({ gameId: 0 }).success).toBe(false);
    expect(updateSubPickSettingsRequestSchema.safeParse({ spinDurationSeconds: 121 }).success).toBe(false);
    expect(updateSubPickSettingsRequestSchema.safeParse({ overlayMessage: " " }).success).toBe(false);
    expect(updateSubPickSettingsRequestSchema.parse({ tier3Entries: 10 })).toEqual({ tier3Entries: 10 });
  });
});
