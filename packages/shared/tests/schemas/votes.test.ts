import { describe, expect, it } from "vitest";
import {
  archiveVotesRequestSchema,
  currentVoteSchema,
  fillRandomVotesRequestSchema,
  updateVoteByGameNumberRequestSchema,
  uploadRoundSchema,
  voteRoundSchema
} from "../../src/schemas/votes.js";

describe("vote schemas", () => {
  it("applies C# defaults and vote bounds", () => {
    expect(currentVoteSchema.parse({ gameNumber: 2 })).toEqual({
      gameId: 0,
      gameTitle: "",
      voteCount: 0,
      gameNumber: 2
    });
    expect(currentVoteSchema.safeParse({ gameNumber: 4 }).success).toBe(false);
    expect(updateVoteByGameNumberRequestSchema.safeParse({ gameNumber: 1, voteCount: -1 }).success).toBe(false);
  });

  it("validates upload, archive, and random-fill request shapes", () => {
    expect(
      uploadRoundSchema.parse({
        voteRound: 1,
        notes: null,
        votes: [{ gameTitle: "Game", count: 5, position: null }]
      })
    ).toEqual({
      voteRound: 1,
      notes: null,
      votes: [{ gameTitle: "Game", count: 5, position: null }]
    });
    expect(uploadRoundSchema.safeParse({ voteRound: 0, votes: [{ gameTitle: "", count: -1, position: 4 }] }).success).toBe(false);
    expect(archiveVotesRequestSchema.parse({ manualPositions: { 1: 2 }, notes: "Tie breaker" })).toEqual({
      manualPositions: { 1: 2 },
      notes: "Tie breaker"
    });
    expect(fillRandomVotesRequestSchema.parse({})).toEqual({ count: 1 });
  });

  it("accepts archived vote round DTOs", () => {
    expect(
      voteRoundSchema.parse({
        voteRound: 3,
        topGameTitle: "Winner",
        topVotes: 10,
        topPosition: 1,
        secondGameTitle: "Runner Up",
        secondVotes: 7,
        secondPosition: 2,
        lastGameTitle: "Last",
        lastVotes: 1,
        lastPosition: null,
        notes: null
      })
    ).toMatchObject({ voteRound: 3, topGameTitle: "Winner", lastPosition: null });
  });
});
