import type { ChallengeRunnerDto } from "@ps2-challenge/shared";
import type { ChallengeRunnerLogoService } from "./challengeRunnerLogoService.js";

export type ChallengeRunnerLogoRefreshResult = {
  total: number;
  updated: number;
  unchanged: number;
  errors: number;
};

type ChallengeRunnerLogoRefreshRepository = {
  list(): Promise<ChallengeRunnerDto[]>;
  updateLogo(id: number, logoUrl: string): Promise<boolean>;
};

type RefreshLogger = {
  warn(object: object, message: string): void;
};

export class ChallengeRunnerLogoRefreshService {
  constructor(
    private readonly repository: ChallengeRunnerLogoRefreshRepository,
    private readonly logoService: Pick<ChallengeRunnerLogoService, "resolveLogo">,
    private readonly logger?: RefreshLogger
  ) {}

  async refreshLogos(): Promise<ChallengeRunnerLogoRefreshResult> {
    const runners = await this.repository.list();
    const result: ChallengeRunnerLogoRefreshResult = {
      total: runners.length,
      updated: 0,
      unchanged: 0,
      errors: 0
    };

    for (const runner of runners) {
      try {
        const logoUrl = await this.logoService.resolveLogo(runner);
        if (logoUrl === runner.logoUrl) {
          result.unchanged += 1;
          continue;
        }
        if (await this.repository.updateLogo(runner.id, logoUrl)) {
          result.updated += 1;
        } else {
          result.errors += 1;
          this.logger?.warn({ challengeRunnerId: runner.id }, "Challenge runner disappeared during profile picture refresh");
        }
      } catch (error) {
        result.errors += 1;
        this.logger?.warn(
          { err: error, challengeRunnerId: runner.id, challengeRunnerName: runner.name },
          "Failed to refresh challenge runner profile picture"
        );
      }
    }

    return result;
  }
}
