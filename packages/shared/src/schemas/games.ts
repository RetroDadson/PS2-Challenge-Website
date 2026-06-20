import { z } from "zod";
import { dateOnlySchema, requiredString } from "./common.js";

export const gameSchema = z.object({
  id: z.number().int().default(0),
  title: z.string().default(""),
  developer: z.string().nullable().optional(),
  publisher: z.string().nullable().optional(),
  firstReleased: dateOnlySchema.nullable().optional(),
  regionFirstReleasedIn: z.string().nullable().optional(),
  releasedInEuPalOrNa: z.boolean().default(false),
  imageUrl: z.string().nullable().optional(),
  isExcluded: z.boolean().default(false),
  isOwned: z.boolean().default(false),
  howLongToBeatId: z.number().int().nullable().optional(),
  howLongToBeatMainStorySeconds: z.number().int().nullable().optional(),
  howLongToBeatMainExtraSeconds: z.number().int().nullable().optional(),
  howLongToBeatCompletionistSeconds: z.number().int().nullable().optional()
});

export const createGameSchema = z.object({
  title: requiredString("Title", 150),
  developer: requiredString("Developer", 100),
  publisher: requiredString("Publisher", 100),
  firstReleased: dateOnlySchema.nullable().optional(),
  regionFirstReleasedIn: requiredString("Region first released in", 100),
  releasedInEuPalOrNa: z.boolean().default(false),
  imageUrl: z.string().nullable().optional()
});

export const updateGameSchema = createGameSchema;

export const excludeGameRequestSchema = z.object({
  title: requiredString("Title"),
  reason: requiredString("Reason")
});

export const updateExclusionRequestSchema = z
  .object({
    isExcluded: z.boolean().optional(),
    exclude: z.boolean().optional(),
    reason: z.string().nullable().optional()
  })
  .transform((value) => ({
    isExcluded: value.isExcluded ?? value.exclude ?? false,
    reason: value.reason
  }));

export const addGameOwnedRequestSchema = z.object({
  title: requiredString("Title"),
  ownPhysicalCopy: z.boolean(),
  typeOwned: z
    .string()
    .nullable()
    .optional()
    .transform((value) => value ?? "")
}).superRefine((value, context) => {
  if (value.ownPhysicalCopy && !value.typeOwned.trim()) {
    context.addIssue({
      code: "custom",
      path: ["typeOwned"],
      message: "Type owned is required when marking as owned"
    });
  }
});

export const updateOwnershipRequestSchema = z.object({
  ownPhysicalCopy: z.boolean(),
  typeOwned: z
    .string()
    .nullable()
    .optional()
    .transform((value) => value ?? "")
});

export const addSerialNumberRequestSchema = z.object({
  title: requiredString("Title"),
  serialNumber: requiredString("Serial number", 50),
  region: z.string().max(50, "Region cannot exceed 50 characters").nullable().optional(),
  notes: z.string().max(500, "Notes cannot exceed 500 characters").nullable().optional()
});

export const alternateTitleSchema = z.object({
  alternateTitleId: z.number().int(),
  gameId: z.number().int(),
  title: z.string(),
  notes: z.string().nullable().optional()
});

export const addAlternateTitleRequestSchema = z.object({
  title: requiredString("Title", 150),
  notes: z.string().max(500, "Notes cannot exceed 500 characters").nullable().optional()
});

export const gameProgressSchema = z.object({
  progressId: z.number().int(),
  gameId: z.number().int(),
  gameTitle: z.string(),
  imageUrl: z.string().nullable().optional(),
  dateStarted: dateOnlySchema,
  dateFinished: dateOnlySchema.nullable().optional(),
  completionTime: z.string().nullable().optional(),
  beatenCriteria: z.string().nullable().optional(),
  review: z.string().nullable().optional(),
  platform: z.string()
});

export const updateProgressRequestSchema = z.object({
  title: requiredString("Title"),
  dateStarted: dateOnlySchema,
  dateFinished: dateOnlySchema.nullable().optional(),
  completionTime: z.string().nullable().optional(),
  beatenCriteria: z.string().nullable().optional(),
  review: z.string().nullable().optional(),
  platform: requiredString("Platform")
});

export const gamesPageDataSchema = z.object({
  games: z.array(gameSchema),
  ownedTypes: z.record(z.string(), z.string()),
  exclusionReasons: z.record(z.string(), z.string()),
  completionStatus: z.record(z.string(), z.string()),
  alternateTitles: z.record(z.string(), z.array(alternateTitleSchema))
});

export type GameDto = z.infer<typeof gameSchema>;
export type CreateGameRequest = z.infer<typeof createGameSchema>;
export type ExcludeGameRequest = z.infer<typeof excludeGameRequestSchema>;
export type AddGameOwnedRequest = z.infer<typeof addGameOwnedRequestSchema>;
export type AlternateTitle = z.infer<typeof alternateTitleSchema>;
export type GameProgressDto = z.infer<typeof gameProgressSchema>;
export type UpdateProgressRequest = z.infer<typeof updateProgressRequestSchema>;
export type GamesPageDataDto = z.infer<typeof gamesPageDataSchema>;
