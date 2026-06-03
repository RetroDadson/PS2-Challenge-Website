import type { Kysely } from "kysely";
import type { Database } from "../db/kysely.js";

export type TwitchVodRecord = {
  vodId: string;
  channelLogin: string;
  title: string | null;
  url: string | null;
  createdAt: Date;
  durationSeconds: number;
  fetchedAt: Date;
};

export type TwitchStreamAggregate = {
  totalStreamSeconds: number;
  vodCount: number;
};

export class TwitchStreamRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async upsertVods(vods: TwitchVodRecord[]): Promise<number> {
    for (const vod of vods) {
      await this.db
        .insertInto("twitch_stream_vods")
        .values({
          vod_id: vod.vodId,
          channel_login: vod.channelLogin,
          title: vod.title,
          url: vod.url,
          created_at: vod.createdAt,
          duration_seconds: vod.durationSeconds,
          fetched_at: vod.fetchedAt
        })
        .onConflict((oc) =>
          oc.column("vod_id").doUpdateSet({
            channel_login: vod.channelLogin,
            title: vod.title,
            url: vod.url,
            created_at: vod.createdAt,
            duration_seconds: vod.durationSeconds,
            fetched_at: vod.fetchedAt
          })
        )
        .execute();
    }

    return vods.length;
  }

  async recentAggregate(channelLogin: string, rangeStart: Date, rangeEnd: Date, minimumDurationSeconds = 0): Promise<TwitchStreamAggregate> {
    const rows = await this.db
      .selectFrom("twitch_stream_vods")
      .select(["duration_seconds"])
      .where("channel_login", "=", channelLogin)
      .where("created_at", ">=", rangeStart)
      .where("created_at", "<=", rangeEnd)
      .where("duration_seconds", ">=", minimumDurationSeconds)
      .execute();

    return {
      totalStreamSeconds: rows.reduce((sum, row) => sum + row.duration_seconds, 0),
      vodCount: rows.length
    };
  }
}
