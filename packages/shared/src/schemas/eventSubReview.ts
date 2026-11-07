import { z } from "zod";

export const eventSubReviewItemSchema = z.object({
  messageId: z.string(),
  subscriptionType: z.string(),
  status: z.enum(["needs_review", "failed"]),
  reason: z.string().nullable(),
  receivedAt: z.string(),
  tier: z.string().nullable(),
  total: z.number().int().nullable(),
  twitchDisplayName: z.string().nullable()
});

export const assignEventSubReviewRequestSchema = z
  .object({
    twitchUserId: z.string().trim().regex(/^\d{1,20}$/, "Twitch user ID must be numeric"),
    twitchLogin: z.string().trim().regex(/^\w{1,25}$/, "Twitch usernames contain only letters, numbers and underscores"),
    twitchDisplayName: z.string().trim().min(1).max(255)
  })
  .strict();

export const eventSubReviewResultSchema = z.object({
  messageId: z.string(),
  status: z.enum(["processed", "ignored", "failed", "needs_review", "resolved", "dismissed"]),
  grantId: z.number().int().nullable(),
  error: z.string().nullable()
});

export type EventSubReviewItemDto = z.infer<typeof eventSubReviewItemSchema>;
export type AssignEventSubReviewRequest = z.infer<typeof assignEventSubReviewRequestSchema>;
export type EventSubReviewResultDto = z.infer<typeof eventSubReviewResultSchema>;
