import type { ChallengeRunnerDto, ChallengeRunnerInput } from "@ps2-challenge/shared";
import type { Kysely, Selectable } from "kysely";
import type { Database } from "../db/kysely.js";

type ChallengeRunnerRow = Selectable<Database["challenge_runners"]>;

export class ChallengeRunnerRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async list(): Promise<ChallengeRunnerDto[]> {
    const rows = await this.db.selectFrom("challenge_runners").selectAll().orderBy("name", "asc").execute();
    return rows.map(toDto);
  }

  async create(input: ChallengeRunnerInput, logoUrl: string): Promise<ChallengeRunnerDto> {
    const row = await this.db
      .insertInto("challenge_runners")
      .values(toValues(input, logoUrl))
      .returningAll()
      .executeTakeFirstOrThrow();
    return toDto(row);
  }

  async update(id: number, input: ChallengeRunnerInput, logoUrl: string): Promise<ChallengeRunnerDto | null> {
    const row = await this.db
      .updateTable("challenge_runners")
      .set({ ...toValues(input, logoUrl), updated_at: new Date() })
      .where("challenge_runner_id", "=", id)
      .returningAll()
      .executeTakeFirst();
    return row ? toDto(row) : null;
  }

  async updateLogo(id: number, logoUrl: string): Promise<boolean> {
    const result = await this.db
      .updateTable("challenge_runners")
      .set({ logo_url: logoUrl, updated_at: new Date() })
      .where("challenge_runner_id", "=", id)
      .executeTakeFirst();
    return result.numUpdatedRows > 0n;
  }

  async delete(id: number): Promise<boolean> {
    const result = await this.db.deleteFrom("challenge_runners").where("challenge_runner_id", "=", id).executeTakeFirst();
    return result.numDeletedRows > 0n;
  }
}

function toValues(input: ChallengeRunnerInput, logoUrl: string) {
  return {
    name: input.name,
    description: input.description,
    twitch_url: input.twitchUrl,
    youtube_url: input.youtubeUrl,
    logo_url: logoUrl
  };
}

function toDto(row: ChallengeRunnerRow): ChallengeRunnerDto {
  return {
    id: row.challenge_runner_id,
    name: row.name,
    description: row.description,
    twitchUrl: row.twitch_url,
    youtubeUrl: row.youtube_url,
    logoUrl: row.logo_url
  };
}
