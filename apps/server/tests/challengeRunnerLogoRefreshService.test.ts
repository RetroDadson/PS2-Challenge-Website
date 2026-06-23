import type { ChallengeRunnerDto } from "@ps2-challenge/shared";
import { describe, expect, it, vi } from "vitest";
import { ChallengeRunnerLogoRefreshService } from "../src/services/challengeRunnerLogoRefreshService.js";

describe("challenge runner profile picture refresh", () => {
  it("updates changed pictures while isolating unchanged runners and lookup errors", async () => {
    const runners = [
      runner(1, "Changed Runner", "https://images.example/old.png"),
      runner(2, "Unchanged Runner", "https://images.example/same.png"),
      runner(3, "Failed Runner", "https://images.example/failed.png")
    ];
    const repository = {
      list: vi.fn().mockResolvedValue(runners),
      updateLogo: vi.fn().mockResolvedValue(true)
    };
    const logoService = {
      resolveLogo: vi.fn(async (candidate: ChallengeRunnerDto) => {
        if (candidate.id === 1) return "https://images.example/new.png";
        if (candidate.id === 2) return "https://images.example/same.png";
        throw new Error("Provider unavailable");
      })
    };
    const logger = { warn: vi.fn() };

    await expect(new ChallengeRunnerLogoRefreshService(repository, logoService, logger).refreshLogos()).resolves.toEqual({
      total: 3,
      updated: 1,
      unchanged: 1,
      errors: 1
    });
    expect(repository.updateLogo).toHaveBeenCalledWith(1, "https://images.example/new.png");
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ challengeRunnerId: 3, challengeRunnerName: "Failed Runner" }),
      "Failed to refresh challenge runner profile picture"
    );
  });

  it("reports a runner removed during refresh as an error", async () => {
    const repository = {
      list: vi.fn().mockResolvedValue([runner(1, "Removed Runner", null)]),
      updateLogo: vi.fn().mockResolvedValue(false)
    };
    const logger = { warn: vi.fn() };
    const service = new ChallengeRunnerLogoRefreshService(repository, { resolveLogo: vi.fn().mockResolvedValue("https://images.example/new.png") }, logger);

    await expect(service.refreshLogos()).resolves.toEqual({ total: 1, updated: 0, unchanged: 0, errors: 1 });
    expect(logger.warn).toHaveBeenCalledWith(
      { challengeRunnerId: 1 },
      "Challenge runner disappeared during profile picture refresh"
    );
  });
});

function runner(id: number, name: string, logoUrl: string | null): ChallengeRunnerDto {
  return {
    id,
    name,
    description: `${name} description`,
    twitchUrl: `https://www.twitch.tv/runner${id}`,
    youtubeUrl: null,
    logoUrl
  };
}
