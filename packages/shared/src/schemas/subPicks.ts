import { z } from "zod";

export const subTiers = ["prime", "1000", "2000", "3000"] as const;
export const subGrantTypes = ["new", "resub", "gift"] as const;
export const subEntryStatuses = ["undrawn", "in_100s_pool", "won", "lost", "removed_played", "voided"] as const;
export const subEntryPools = ["awaiting_pick", "needs_new_pick", "next_draw", "100s_pool", "finished"] as const;

export const subTierSchema = z.enum(subTiers);
export const subGrantTypeSchema = z.enum(subGrantTypes);
export const subEntryStatusSchema = z.enum(subEntryStatuses);
export const subEntryPoolSchema = z.enum(subEntryPools);

const entryValue = z.number().int().min(0).max(100);
const twitchUserId = z.string().trim().regex(/^\d{1,20}$/, "Twitch user ID must be numeric");
const twitchLogin = z.string().trim().regex(/^\w{1,25}$/, "Twitch usernames contain only letters, numbers and underscores");

export const subPickSettingsSchema = z.object({
  tier1Entries: entryValue,
  tier2Entries: entryValue,
  tier3Entries: entryValue,
  spinDurationSeconds: z.number().int().min(1).max(120),
  overlayMessage: z.string().trim().min(1, "Overlay message is required").max(300, "Overlay message cannot exceed 300 characters")
});

export const updateSubPickSettingsRequestSchema = subPickSettingsSchema.partial().strict();

export const twitchUserLookupRequestSchema = z.object({ login: twitchLogin }).strict();

export const twitchUserLookupSchema = z.object({
  twitchUserId,
  login: z.string(),
  displayName: z.string(),
  profileImageUrl: z.string().nullable()
});

export const createSubGrantRequestSchema = z
  .object({
    twitchUserId,
    twitchLogin,
    twitchDisplayName: z.string().trim().min(1).max(255),
    tier: subTierSchema,
    grantType: subGrantTypeSchema,
    giftCount: z.number().int().min(1).max(1000).optional(),
    entryCount: z.number().int().min(0).max(5000).optional(),
    notes: z.string().trim().max(500).nullable().optional()
  })
  .strict();

export const updateSubGrantRequestSchema = z
  .object({
    tier: subTierSchema,
    grantType: subGrantTypeSchema,
    giftCount: z.number().int().min(1).max(1000),
    entryCount: z.number().int().min(0).max(5000),
    notes: z.string().trim().max(500).nullable()
  })
  .partial()
  .strict();

export const setSubEntryPickRequestSchema = z.object({ gameId: z.number().int().positive().nullable() }).strict();

export const subEntrySchema = z.object({
  id: z.number().int().positive(),
  grantId: z.number().int().positive(),
  twitchUserId: z.string().nullable(),
  twitchDisplayName: z.string().nullable(),
  gameId: z.number().int().nullable(),
  gameTitle: z.string().nullable(),
  status: subEntryStatusSchema,
  pool: subEntryPoolSchema,
  canChangePick: z.boolean(),
  playedGameNumber: z.number().int().nullable(),
  createdAt: z.string()
});

export const subGrantSchema = z.object({
  id: z.number().int().positive(),
  twitchUserId: z.string().nullable(),
  twitchLogin: z.string().nullable(),
  twitchDisplayName: z.string().nullable(),
  tier: subTierSchema,
  grantType: subGrantTypeSchema,
  giftCount: z.number().int(),
  entryCount: z.number().int(),
  source: z.enum(["eventsub", "manual"]),
  notes: z.string().nullable(),
  createdBy: z.string().nullable(),
  createdAt: z.string(),
  entries: z.array(subEntrySchema)
});

export const subPoolGameSchema = z.object({
  gameId: z.number().int(),
  gameTitle: z.string(),
  imageUrl: z.string().nullable(),
  entries: z.number().int(),
  odds: z.number()
});

export const subPoolSchema = z.object({
  totalEntries: z.number().int(),
  games: z.array(subPoolGameSchema)
});

export const subDrawKindSchema = z.enum(["10s", "100s"]);

export const subDrawDueSchema = z.object({
  gameNumber: z.number().int().positive(),
  kind: subDrawKindSchema,
  entryCount: z.number().int().positive()
});

export const subDrawDueErrorCode = "sub_draw_due";

export const subDrawScheduleSchema = z.object({
  nextGameNumber: z.number().int().positive(),
  nextDrawGameNumber: z.number().int().positive(),
  nextDrawKind: subDrawKindSchema,
  gamesUntilNextDraw: z.number().int().min(0),
  nextHundredDrawGameNumber: z.number().int().positive(),
  gamesUntilNextHundredDraw: z.number().int().min(0)
});

export const subPicksSummarySchema = z.object({
  schedule: subDrawScheduleSchema,
  nextDrawPool: subPoolSchema,
  tensPool: subPoolSchema,
  hundredsPool: subPoolSchema,
  overlayMessage: z.string(),
  tierEntries: z.object({ tier1: z.number().int(), tier2: z.number().int(), tier3: z.number().int() })
});

export const mySubPicksSchema = z.object({
  entries: z.array(subEntrySchema),
  stats: z.object({
    entriesEarned: z.number().int(),
    picksMade: z.number().int(),
    wins: z.number().int(),
    nextDrawOdds: z.number()
  })
});

export const eligibleGameSchema = z.object({
  id: z.number().int().positive(),
  title: z.string(),
  imageUrl: z.string().nullable()
});

export const subPickAuditSchema = z.object({
  id: z.number().int().positive(),
  actor: z.string().nullable(),
  action: z.string(),
  targetType: z.string(),
  targetId: z.number().int().nullable(),
  details: z.record(z.string(), z.unknown()),
  createdAt: z.string()
});

export type SubTier = z.infer<typeof subTierSchema>;
export type SubGrantType = z.infer<typeof subGrantTypeSchema>;
export type SubEntryStatus = z.infer<typeof subEntryStatusSchema>;
export type SubEntryPool = z.infer<typeof subEntryPoolSchema>;
export type SubPickSettingsDto = z.infer<typeof subPickSettingsSchema>;
export type UpdateSubPickSettingsRequest = z.infer<typeof updateSubPickSettingsRequestSchema>;
export type TwitchUserLookupDto = z.infer<typeof twitchUserLookupSchema>;
export type CreateSubGrantRequest = z.infer<typeof createSubGrantRequestSchema>;
export type UpdateSubGrantRequest = z.infer<typeof updateSubGrantRequestSchema>;
export type SubEntryDto = z.infer<typeof subEntrySchema>;
export type SubGrantDto = z.infer<typeof subGrantSchema>;
export type SubPoolDto = z.infer<typeof subPoolSchema>;
export type SubPoolGameDto = z.infer<typeof subPoolGameSchema>;
export type SubDrawScheduleDto = z.infer<typeof subDrawScheduleSchema>;
export type SubPicksSummaryDto = z.infer<typeof subPicksSummarySchema>;
export type MySubPicksDto = z.infer<typeof mySubPicksSchema>;
export type EligibleGameDto = z.infer<typeof eligibleGameSchema>;
export type SubDrawKind = z.infer<typeof subDrawKindSchema>;
export type SubDrawDueDto = z.infer<typeof subDrawDueSchema>;
export type SubPickAuditDto = z.infer<typeof subPickAuditSchema>;

export function subTierEntryValue(tier: SubTier, settings: Pick<SubPickSettingsDto, "tier1Entries" | "tier2Entries" | "tier3Entries">): number {
  if (tier === "3000") return settings.tier3Entries;
  if (tier === "2000") return settings.tier2Entries;
  return settings.tier1Entries;
}

export function subGrantEntryCount(
  grant: { tier: SubTier; grantType: SubGrantType; giftCount?: number },
  settings: Pick<SubPickSettingsDto, "tier1Entries" | "tier2Entries" | "tier3Entries">
): number {
  const multiplier = grant.grantType === "gift" ? grant.giftCount ?? 1 : 1;
  return subTierEntryValue(grant.tier, settings) * multiplier;
}

export function subDrawSchedule(nextGameNumber: number): SubDrawScheduleDto {
  const nextDrawGameNumber = Math.ceil(nextGameNumber / 10) * 10;
  const nextHundredDrawGameNumber = Math.ceil(nextGameNumber / 100) * 100;
  return {
    nextGameNumber,
    nextDrawGameNumber,
    nextDrawKind: nextDrawGameNumber % 100 === 0 ? "100s" : "10s",
    gamesUntilNextDraw: nextDrawGameNumber - nextGameNumber,
    nextHundredDrawGameNumber,
    gamesUntilNextHundredDraw: nextHundredDrawGameNumber - nextGameNumber
  };
}
