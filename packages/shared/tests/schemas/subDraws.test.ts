import { describe, expect, it } from "vitest";
import { subDrawSchema, subWheelSchema } from "../../src/schemas/subDraws.js";

const slice = { entryId: 4, gameId: 50, gameTitle: "Alpha", twitchDisplayName: "ViewerOne" };

const draw = {
  id: 1,
  kind: "10s",
  gameNumber: 10,
  state: "awaiting_decision",
  locked: true,
  slices: [slice],
  odds: [{ gameId: 50, gameTitle: "Alpha", entries: 1, odds: 1 }],
  shuffleCount: 2,
  spinCount: 1,
  spin: {
    spinNumber: 1,
    startedAt: "2026-11-07T12:00:00.000Z",
    durationMs: 10_000,
    revealAt: "2026-11-07T12:00:10.000Z",
    sliceCount: 1,
    winningSliceIndex: 0,
    stopOffset: 0.4,
    decision: "pending",
    result: { ...slice, entries: 1, odds: 1 }
  },
  winner: null,
  createdAt: "2026-11-07T11:59:00.000Z",
  finishedAt: null
};

describe("sub draw schemas", () => {
  it("accepts a wheel with a draw waiting for a decision", () => {
    expect(subWheelSchema.parse({ draw, due: null, spinDurationSeconds: 10, serverNow: "2026-11-07T12:00:11.000Z" }).draw?.spin?.result?.gameTitle).toBe(
      "Alpha"
    );
  });

  it("rejects unknown states and out-of-range stop offsets", () => {
    expect(subDrawSchema.safeParse({ ...draw, state: "paused" }).success).toBe(false);
    expect(subDrawSchema.safeParse({ ...draw, spin: { ...draw.spin, stopOffset: 1.5 } }).success).toBe(false);
  });
});
