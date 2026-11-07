import { describe, expect, it } from "vitest";
import { decideEventSubNotification } from "../src/services/eventSubService.js";

const viewer = { user_id: "1001", user_login: "viewerone", user_name: "ViewerOne" };

describe("EventSub notification decisions", () => {
  it("grants entries for new subs but ignores gift recipients", () => {
    expect(decideEventSubNotification("channel.subscribe", { ...viewer, tier: "2000", is_gift: false })).toEqual({
      kind: "grant",
      grant: { twitchUserId: "1001", twitchLogin: "viewerone", twitchDisplayName: "ViewerOne", tier: "2000", grantType: "new" }
    });
    expect(decideEventSubNotification("channel.subscribe", { ...viewer, tier: "1000", is_gift: true })).toEqual({
      kind: "ignored",
      reason: "Gift recipient; entries go to the gifter"
    });
  });

  it("grants entries for resubs shared in chat with the month count as a note", () => {
    expect(decideEventSubNotification("channel.subscription.message", { ...viewer, tier: "3000", cumulative_months: 14 })).toMatchObject({
      kind: "grant",
      grant: { grantType: "resub", tier: "3000", notes: "Resub, 14 months" }
    });
    expect(decideEventSubNotification("channel.subscription.message", { ...viewer, tier: "1000" })).toMatchObject({ grant: { notes: null } });
  });

  it("credits gifts to the gifter and sends anonymous gifts for review", () => {
    expect(decideEventSubNotification("channel.subscription.gift", { ...viewer, tier: "1000", total: 5, is_anonymous: false })).toMatchObject({
      kind: "grant",
      grant: { twitchUserId: "1001", grantType: "gift", giftCount: 5 }
    });
    expect(decideEventSubNotification("channel.subscription.gift", { user_id: null, tier: "1000", total: 1, is_anonymous: true })).toEqual({
      kind: "review",
      reason: "Anonymous gift of 1 sub"
    });
    expect(decideEventSubNotification("channel.subscription.gift", { user_id: null, tier: "2000", total: 3, is_anonymous: false })).toEqual({
      kind: "review",
      reason: "Anonymous gift of 3 subs"
    });
  });

  it("falls back to the user id or login when names are missing", () => {
    expect(decideEventSubNotification("channel.subscribe", { user_id: "1001", tier: "1000" })).toMatchObject({
      grant: { twitchLogin: "1001", twitchDisplayName: "1001" }
    });
    expect(decideEventSubNotification("channel.subscribe", { user_id: "1001", user_login: "viewerone", user_name: "", tier: "1000" })).toMatchObject({
      grant: { twitchLogin: "viewerone", twitchDisplayName: "viewerone" }
    });
  });

  it("rejects malformed events and ignores unknown types", () => {
    expect(() => decideEventSubNotification("channel.subscribe", { tier: "1000" })).toThrow("valid user_id");
    expect(() => decideEventSubNotification("channel.subscribe", { user_id: "not-numeric", tier: "1000" })).toThrow("valid user_id");
    expect(() => decideEventSubNotification("channel.subscribe", { ...viewer, tier: "prime" })).toThrow("Unknown subscription tier prime");
    expect(() => decideEventSubNotification("channel.subscription.gift", { ...viewer, tier: "1000", total: 0 })).toThrow("valid total");
    expect(decideEventSubNotification("channel.follow", viewer)).toEqual({ kind: "ignored", reason: "Unhandled subscription type channel.follow" });
  });
});
