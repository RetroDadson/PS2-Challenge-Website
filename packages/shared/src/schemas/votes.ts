import { z } from "zod";
import { requiredString } from "./common.js";

export const currentVoteSchema = z.object({
  gameId: z.number().int().default(0),
  gameTitle: z.string().default(""),
  voteCount: z.number().int().min(0).default(0),
  gameNumber: z.number().int().min(1).max(3)
});

export const uploadGameVoteSchema = z.object({
  gameTitle: requiredString("Game title"),
  count: z.number().int().min(0),
  position: z.number().int().min(1).max(3).nullable().optional()
});

export const uploadRoundSchema = z.object({
  voteRound: z.number().int().positive(),
  votes: z.array(uploadGameVoteSchema),
  notes: z.string().nullable().optional()
});

export const voteRoundSchema = z.object({
  voteRound: z.number().int(),
  topGameTitle: z.string(),
  topVotes: z.number().int(),
  topPosition: z.number().int().nullable().optional(),
  secondGameTitle: z.string(),
  secondVotes: z.number().int(),
  secondPosition: z.number().int().nullable().optional(),
  lastGameTitle: z.string(),
  lastVotes: z.number().int(),
  lastPosition: z.number().int().nullable().optional(),
  notes: z.string().nullable().optional()
});

export const archiveVotesRequestSchema = z.object({
  notes: z.string().nullable().optional(),
  manualPositions: z.record(z.string(), z.number().int().min(1).max(3)).nullable().optional()
});

export const updateVoteByGameNumberRequestSchema = z.object({
  gameNumber: z.number().int().min(1).max(3),
  voteCount: z.number().int().min(0)
});

export const fillRandomVotesRequestSchema = z.object({
  count: z.number().int().positive().default(1)
});

export type CurrentVoteDto = z.infer<typeof currentVoteSchema>;
export type UploadRoundDto = z.infer<typeof uploadRoundSchema>;
export type VoteRoundDto = z.infer<typeof voteRoundSchema>;
export type ArchiveVotesRequest = z.infer<typeof archiveVotesRequestSchema>;
