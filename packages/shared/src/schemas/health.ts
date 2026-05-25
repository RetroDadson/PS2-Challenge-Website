import { z } from "zod";

export const healthCheckEntrySchema = z.object({
  name: z.string(),
  status: z.string(),
  description: z.string().nullable().optional(),
  duration: z.string(),
  exception: z.string().nullable().optional(),
  tags: z.array(z.string()).optional()
});

export const healthCheckResponseSchema = z.object({
  status: z.string(),
  totalDuration: z.string(),
  checks: z.array(healthCheckEntrySchema)
});

export const pingResponseSchema = z.object({
  status: z.string(),
  timestamp: z.string(),
  message: z.string()
});

export type HealthCheckResponse = z.infer<typeof healthCheckResponseSchema>;
export type PingResponse = z.infer<typeof pingResponseSchema>;
