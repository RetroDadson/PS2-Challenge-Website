import { z } from "zod";

const channelUrlSchema = z.url().trim().max(500).refine(
  (value) => value.startsWith("https://"),
  "Channel URLs must use HTTPS"
);
const twitchUrlSchema = channelUrlSchema.refine((value) => hasHost(value, "twitch.tv"), "Twitch URL must point to twitch.tv");
const youtubeUrlSchema = channelUrlSchema.refine(
  (value) => hasHost(value, "youtube.com") || hasHost(value, "youtu.be"),
  "YouTube URL must point to youtube.com or youtu.be"
);

export const challengeRunnerInputSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(100),
    description: z.string().trim().min(1, "Description is required").max(1000),
    twitchUrl: twitchUrlSchema.nullable(),
    youtubeUrl: youtubeUrlSchema.nullable()
  })
  .strict()
  .refine((runner) => runner.twitchUrl !== null || runner.youtubeUrl !== null, {
    message: "At least one Twitch or YouTube URL is required",
    path: ["twitchUrl"]
  });

export const challengeRunnerSchema = z
  .object({
    id: z.number().int().positive(),
    name: z.string().trim().min(1).max(100),
    description: z.string().trim().min(1).max(1000),
    twitchUrl: twitchUrlSchema.nullable(),
    youtubeUrl: youtubeUrlSchema.nullable(),
    logoUrl: channelUrlSchema.nullable()
  })
  .strict()
  .refine((runner) => runner.twitchUrl !== null || runner.youtubeUrl !== null);

export type ChallengeRunnerInput = z.infer<typeof challengeRunnerInputSchema>;
export type ChallengeRunnerDto = z.infer<typeof challengeRunnerSchema>;

function hasHost(value: string, host: string): boolean {
  try {
    const hostname = new URL(value).hostname.toLocaleLowerCase("en-GB");
    return hostname === host || hostname.endsWith(`.${host}`);
  } catch {
    return false;
  }
}
