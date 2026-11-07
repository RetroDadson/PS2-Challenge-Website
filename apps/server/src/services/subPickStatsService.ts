import type { GameProgressDto, SubDrawHistoryDto, SubPickGameCountDto, SubPickedGameDto, SubPickStatsDto } from "@ps2-challenge/shared";
import type { Kysely } from "kysely";
import type { Database } from "../db/kysely.js";
import type { GameService } from "./gameService.js";
import { drawPoolQuery } from "./subDrawPool.js";
import type { SubDrawService } from "./subDrawService.js";

const topGames = 10;
const allFinishedDraws = 10_000;

export class SubPickStatsService {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly draws: Pick<SubDrawService, "history">,
    private readonly games: Pick<GameService, "allProgress">
  ) {}

  async stats(): Promise<SubPickStatsDto> {
    const [history, progress, mostPickedNow, mostPickedAllTime, entryTotals] = await Promise.all([
      this.draws.history(allFinishedDraws),
      this.games.allProgress(),
      this.mostPickedNow(),
      this.mostPickedAllTime(),
      this.db
        .selectFrom("sub_entries")
        .select((eb) => [eb.fn.countAll<string>().as("entries"), eb.fn.count<string>("twitch_user_id").distinct().as("viewers")])
        .where("status", "!=", "voided")
        .executeTakeFirstOrThrow()
    ]);
    const progressByNumber = new Map(progress.map((game) => [game.progressId, game]));
    const subPickedGames = history.flatMap((draw) => (draw.status === "accepted" && draw.winner ? [subPickedGame(draw, progressByNumber.get(draw.gameNumber))] : []));
    const longestShot = subPickedGames.reduce<SubPickedGameDto | null>((longest, game) => (!longest || game.odds < longest.odds ? game : longest), null);
    const spins = history.flatMap((draw) => draw.spins);
    return {
      totals: {
        draws: subPickedGames.length,
        cancelledDraws: history.filter((draw) => draw.status === "cancelled").length,
        spins: spins.length,
        respins: spins.filter((spin) => spin.decision === "respun").length,
        entries: Number(entryTotals.entries),
        viewers: Number(entryTotals.viewers)
      },
      mostPickedNow,
      mostPickedAllTime,
      longestShot,
      subPickedGames
    };
  }

  private async mostPickedNow(): Promise<SubPickGameCountDto[]> {
    const rows = await this.db
      .selectFrom(drawPoolQuery(this.db, "100s").as("pool"))
      .select((eb) => ["pool.game_id", "pool.game_title", eb.fn.countAll<string>().as("entries")])
      .groupBy(["pool.game_id", "pool.game_title"])
      .orderBy("entries", "desc")
      .orderBy("pool.game_title")
      .limit(topGames)
      .execute();
    return rows.map(toGameCount);
  }

  private async mostPickedAllTime(): Promise<SubPickGameCountDto[]> {
    const rows = await this.db
      .selectFrom("sub_entries as e")
      .innerJoin("games as g", "g.game_id", "e.game_id")
      .select((eb) => ["e.game_id as game_id", "g.title as game_title", eb.fn.countAll<string>().as("entries")])
      .where("e.status", "!=", "voided")
      .groupBy(["e.game_id", "g.title"])
      .orderBy("entries", "desc")
      .orderBy("g.title")
      .limit(topGames)
      .execute();
    return rows.map(toGameCount);
  }
}

function toGameCount(row: { game_id: number | null; game_title: string; entries: string }): SubPickGameCountDto {
  return { gameId: row.game_id ?? 0, gameTitle: row.game_title, entries: Number(row.entries) };
}

function subPickedGame(draw: SubDrawHistoryDto, progress: GameProgressDto | undefined): SubPickedGameDto {
  const winner = draw.winner!;
  return {
    drawId: draw.id,
    gameNumber: draw.gameNumber,
    kind: draw.kind,
    gameId: winner.gameId,
    gameTitle: winner.gameTitle,
    twitchDisplayName: winner.twitchDisplayName,
    entries: winner.entries,
    totalEntries: draw.entries.length,
    odds: winner.odds,
    spins: draw.spins.length,
    progress: progress?.gameId === winner.gameId ? progress : null
  };
}
