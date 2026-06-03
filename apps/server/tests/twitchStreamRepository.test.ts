import { describe, expect, it, vi } from "vitest";
import { TwitchStreamRepository } from "../src/repositories/twitchStreamRepository.js";

describe("TwitchStreamRepository", () => {
  it("excludes streams below the requested minimum duration from recent aggregates", async () => {
    const rows = [{ duration_seconds: 1_200 }, { duration_seconds: 3_600 }];
    const builder = {
      select: vi.fn(),
      where: vi.fn(),
      execute: vi.fn(async () => rows)
    };
    builder.select.mockReturnValue(builder);
    builder.where.mockReturnValue(builder);
    const db = { selectFrom: vi.fn(() => builder) };
    const repository = new TwitchStreamRepository(db as never);
    const rangeStart = new Date("2026-04-08T12:00:00Z");
    const rangeEnd = new Date("2026-06-03T12:00:00Z");

    const aggregate = await repository.recentAggregate("retrodadson", rangeStart, rangeEnd, 1_200);

    expect(db.selectFrom).toHaveBeenCalledWith("twitch_stream_vods");
    expect(builder.where).toHaveBeenCalledWith("channel_login", "=", "retrodadson");
    expect(builder.where).toHaveBeenCalledWith("created_at", ">=", rangeStart);
    expect(builder.where).toHaveBeenCalledWith("created_at", "<=", rangeEnd);
    expect(builder.where).toHaveBeenCalledWith("duration_seconds", ">=", 1_200);
    expect(aggregate).toEqual({ totalStreamSeconds: 4_800, vodCount: 2 });
  });
});
