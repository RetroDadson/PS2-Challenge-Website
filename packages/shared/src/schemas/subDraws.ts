import { z } from "zod";
import { gameProgressSchema } from "./games.js";
import { subDrawDueSchema, subDrawKindSchema, subEntryStatusSchema } from "./subPicks.js";

export const subDrawStatusSchema = z.enum(["ready", "spun", "accepted", "cancelled"]);
export const subDrawStateSchema = z.enum(["ready", "spinning", "awaiting_decision", "accepted", "cancelled"]);
export const subDrawOutcomeSchema = z.enum(["won", "moved_to_100s", "lost", "removed_played"]);
export const subSpinDecisionSchema = z.enum(["pending", "accepted", "respun", "cancelled"]);

export const subWheelSliceSchema = z.object({
  entryId: z.number().int().positive(),
  gameId: z.number().int().positive().nullable(),
  gameTitle: z.string(),
  twitchDisplayName: z.string().nullable()
});

export const subDrawOddsSchema = z.object({
  gameId: z.number().int().positive().nullable(),
  gameTitle: z.string(),
  entries: z.number().int().positive(),
  odds: z.number().min(0).max(1)
});

export const subSpinResultSchema = subWheelSliceSchema.extend({
  entries: z.number().int().positive(),
  odds: z.number().min(0).max(1)
});

export const subDrawSpinSchema = z.object({
  spinNumber: z.number().int().positive(),
  startedAt: z.string(),
  durationMs: z.number().int().positive(),
  revealAt: z.string(),
  sliceCount: z.number().int().positive(),
  winningSliceIndex: z.number().int().min(0),
  stopOffset: z.number().min(0).max(1),
  decision: subSpinDecisionSchema,
  result: subSpinResultSchema.nullable()
});

export const subDrawSchema = z.object({
  id: z.number().int().positive(),
  kind: subDrawKindSchema,
  gameNumber: z.number().int().positive(),
  state: subDrawStateSchema,
  locked: z.boolean(),
  slices: z.array(subWheelSliceSchema),
  odds: z.array(subDrawOddsSchema),
  shuffleCount: z.number().int().min(0),
  spinCount: z.number().int().min(0),
  spin: subDrawSpinSchema.nullable(),
  winner: subSpinResultSchema.nullable(),
  createdAt: z.string(),
  finishedAt: z.string().nullable()
});

export const subWheelSchema = z.object({
  draw: subDrawSchema.nullable(),
  due: subDrawDueSchema.nullable(),
  spinDurationSeconds: z.number().int().positive(),
  serverNow: z.string()
});

export const subDrawHistoryEntrySchema = z.object({
  entryId: z.number().int().positive(),
  gameId: z.number().int().positive().nullable(),
  gameTitle: z.string(),
  twitchDisplayName: z.string().nullable(),
  outcome: subDrawOutcomeSchema.nullable(),
  playedGameNumber: z.number().int().positive().nullable(),
  currentStatus: subEntryStatusSchema,
  currentPlayedGameNumber: z.number().int().positive().nullable()
});

export const subDrawHistorySpinSchema = z.object({
  spinNumber: z.number().int().positive(),
  startedAt: z.string(),
  decision: subSpinDecisionSchema,
  result: subSpinResultSchema
});

export const subDrawHistorySchema = z.object({
  id: z.number().int().positive(),
  kind: subDrawKindSchema,
  gameNumber: z.number().int().positive(),
  status: z.enum(["accepted", "cancelled"]),
  createdAt: z.string(),
  finishedAt: z.string().nullable(),
  winner: subSpinResultSchema.nullable(),
  odds: z.array(subDrawOddsSchema),
  entries: z.array(subDrawHistoryEntrySchema),
  spins: z.array(subDrawHistorySpinSchema)
});

export const subPickGameCountSchema = z.object({
  gameId: z.number().int().positive(),
  gameTitle: z.string(),
  entries: z.number().int().positive()
});

export const subPickedGameSchema = z.object({
  drawId: z.number().int().positive(),
  gameNumber: z.number().int().positive(),
  kind: subDrawKindSchema,
  gameId: z.number().int().positive().nullable(),
  gameTitle: z.string(),
  twitchDisplayName: z.string().nullable(),
  entries: z.number().int().positive(),
  totalEntries: z.number().int().min(0),
  odds: z.number().min(0).max(1),
  spins: z.number().int().min(0),
  progress: gameProgressSchema.nullable()
});

export const subPickStatsSchema = z.object({
  totals: z.object({
    draws: z.number().int().min(0),
    cancelledDraws: z.number().int().min(0),
    spins: z.number().int().min(0),
    respins: z.number().int().min(0),
    entries: z.number().int().min(0),
    viewers: z.number().int().min(0)
  }),
  mostPickedNow: z.array(subPickGameCountSchema),
  mostPickedAllTime: z.array(subPickGameCountSchema),
  longestShot: subPickedGameSchema.nullable(),
  subPickedGames: z.array(subPickedGameSchema)
});

export type SubDrawStatus = z.infer<typeof subDrawStatusSchema>;
export type SubDrawState = z.infer<typeof subDrawStateSchema>;
export type SubDrawOutcome = z.infer<typeof subDrawOutcomeSchema>;
export type SubSpinDecision = z.infer<typeof subSpinDecisionSchema>;
export type SubWheelSliceDto = z.infer<typeof subWheelSliceSchema>;
export type SubDrawOddsDto = z.infer<typeof subDrawOddsSchema>;
export type SubSpinResultDto = z.infer<typeof subSpinResultSchema>;
export type SubDrawSpinDto = z.infer<typeof subDrawSpinSchema>;
export type SubDrawDto = z.infer<typeof subDrawSchema>;
export type SubWheelDto = z.infer<typeof subWheelSchema>;
export type SubDrawHistoryEntryDto = z.infer<typeof subDrawHistoryEntrySchema>;
export type SubDrawHistorySpinDto = z.infer<typeof subDrawHistorySpinSchema>;
export type SubDrawHistoryDto = z.infer<typeof subDrawHistorySchema>;
export type SubPickGameCountDto = z.infer<typeof subPickGameCountSchema>;
export type SubPickedGameDto = z.infer<typeof subPickedGameSchema>;
export type SubPickStatsDto = z.infer<typeof subPickStatsSchema>;
