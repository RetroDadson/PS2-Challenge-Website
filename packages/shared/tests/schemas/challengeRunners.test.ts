import { describe, expect, it } from "vitest";
import { challengeRunnerInputSchema, challengeRunnerSchema } from "../../src/schemas/challengeRunners.js";

describe("challenge runner schemas", () => {
  it("accepts a described runner with one or both channel URLs", () => {
    expect(
      challengeRunnerInputSchema.parse({
        name: "Runner One",
        description: "Completing every PAL PS2 game.",
        twitchUrl: "https://www.twitch.tv/runnerone",
        youtubeUrl: null
      })
    ).toEqual({
      name: "Runner One",
      description: "Completing every PAL PS2 game.",
      twitchUrl: "https://www.twitch.tv/runnerone",
      youtubeUrl: null
    });

    expect(
      challengeRunnerSchema.safeParse({
        id: 1,
        name: "Runner One",
        description: "A challenge description",
        twitchUrl: null,
        youtubeUrl: "https://www.youtube.com/@runnerone",
        logoUrl: "https://yt3.ggpht.com/runnerone"
      }).success
    ).toBe(true);
  });

  it("requires a name, description, and at least one HTTP channel URL", () => {
    expect(challengeRunnerInputSchema.safeParse({ name: "", description: "Challenge", twitchUrl: null, youtubeUrl: null }).success).toBe(false);
    expect(challengeRunnerInputSchema.safeParse({ name: "Runner", description: "", twitchUrl: "https://twitch.tv/runner", youtubeUrl: null }).success).toBe(false);
    expect(challengeRunnerInputSchema.safeParse({ name: "Runner", description: "Challenge", twitchUrl: "javascript:alert(1)", youtubeUrl: null }).success).toBe(false);
    expect(challengeRunnerInputSchema.safeParse({ name: "Runner", description: "Challenge", twitchUrl: "https://example.com/runner", youtubeUrl: null }).success).toBe(false);
    expect(challengeRunnerInputSchema.safeParse({ name: "Runner", description: "Challenge", twitchUrl: null, youtubeUrl: "https://example.com/runner" }).success).toBe(false);
  });
});
