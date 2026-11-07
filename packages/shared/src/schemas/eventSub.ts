import { z } from "zod";

export const eventSubSubscriptionSchema = z.object({
  id: z.string(),
  type: z.string(),
  status: z.string(),
  callback: z.string().nullable(),
  createdAt: z.string().nullable(),
  healthy: z.boolean()
});

export const eventSubStatusSchema = z.object({
  secretConfigured: z.boolean(),
  secretChanged: z.boolean(),
  channelLogin: z.string(),
  broadcasterUserId: z.string().nullable(),
  callbackUrl: z.string(),
  authorizedAt: z.string().nullable(),
  authorizedBy: z.string().nullable(),
  revokedAt: z.string().nullable(),
  revokedReason: z.string().nullable(),
  subscriptions: z.array(eventSubSubscriptionSchema),
  missingTypes: z.array(z.string()),
  subscriptionsError: z.string().nullable()
});

export const eventSubSyncResultSchema = z.object({
  created: z.array(z.string()),
  removed: z.number().int(),
  errors: z.array(z.string()),
  status: eventSubStatusSchema
});

export type EventSubSubscriptionDto = z.infer<typeof eventSubSubscriptionSchema>;
export type EventSubStatusDto = z.infer<typeof eventSubStatusSchema>;
export type EventSubSyncResultDto = z.infer<typeof eventSubSyncResultSchema>;
