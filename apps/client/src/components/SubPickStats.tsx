import type { SubPickedGameDto, SubPickGameCountDto } from "@ps2-challenge/shared";
import { BarChart3, Dices, RotateCcw, Sparkles, Ticket, Trophy, Users } from "lucide-react";
import { api } from "../api.js";
import { formatDateOnly } from "../dateUtils.js";
import { useAsync, useRealtime } from "../hooks.js";
import { formatOdds } from "../subPickLabels.js";
import { Stat } from "./Stat.js";
import { Empty, ErrorMessage, Loading } from "./Status.js";

export function SubPickStats() {
  const stats = useAsync(() => api.subPickStats(), []);
  const reload = () => void stats.reload();
  useRealtime("/subPicksHub", reload);
  useRealtime("/gamesHub", reload);

  if (stats.loading) return <Loading />;
  if (stats.error || !stats.data) return <ErrorMessage message={stats.error ?? "Unable to load sub pick stats"} />;
  const { totals, mostPickedNow, mostPickedAllTime, longestShot, subPickedGames } = stats.data;

  return (
    <section className="panel sub-stats" aria-labelledby="sub-stats-heading">
      <h2 id="sub-stats-heading"><BarChart3 aria-hidden />Stats</h2>
      <div className="stats-grid">
        <Stat tone="challenge" icon={Trophy} label="Games Picked by Subs" value={totals.draws} />
        <Stat tone="progress" icon={Dices} label="Spins" value={totals.spins} />
        <Stat tone="deaths-most" icon={RotateCcw} label="Respins" value={totals.respins} />
        <Stat tone="remaining-games" icon={Ticket} label="Entries Earned" value={totals.entries} />
        <Stat tone="completed" icon={Users} label="Subs Taking Part" value={totals.viewers} />
      </div>

      {longestShot ? (
        <p className="sub-stats-longshot">
          <Sparkles aria-hidden />
          <span>
            Biggest long shot: <strong>{longestShot.gameTitle}</strong> won game {longestShot.gameNumber} with a {formatOdds(longestShot.odds)} chance
            {longestShot.twitchDisplayName ? `, picked by ${longestShot.twitchDisplayName}` : ""}.
          </span>
        </p>
      ) : null}

      <div className="sub-stats-columns">
        <GameCountList title="Most Picked Now" games={mostPickedNow} emptyMessage="Nobody has a pick waiting right now." />
        <GameCountList title="Most Picked of All Time" games={mostPickedAllTime} emptyMessage="No picks yet." />
      </div>

      <h3>Sub-Picked Games</h3>
      {subPickedGames.length === 0 ? (
        <Empty>No games have been picked by subs yet.</Empty>
      ) : (
        <div className="table-scroll">
          <table className="data-table sub-stats-table">
            <thead><tr><th>Game #</th><th>Game</th><th>Picked by</th><th>Chance</th><th>How it went</th><th>Deaths</th></tr></thead>
            <tbody>
              {subPickedGames.map((game) => (
                <tr key={game.drawId}>
                  <td data-label="Game #">{game.gameNumber}</td>
                  <td data-label="Game">{game.gameTitle}</td>
                  <td data-label="Picked by">{game.twitchDisplayName ?? "Anonymous"}</td>
                  <td data-label="Chance">{formatOdds(game.odds)}</td>
                  <td data-label="How it went">{howItWent(game)}</td>
                  <td data-label="Deaths">{game.progress ? game.progress.deaths : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function GameCountList({ title, games, emptyMessage }: Readonly<{ title: string; games: SubPickGameCountDto[]; emptyMessage: string }>) {
  return (
    <div className="sub-stats-list">
      <h3>{title}</h3>
      {games.length === 0 ? (
        <p className="muted">{emptyMessage}</p>
      ) : (
        <ol>
          {games.map((game) => (
            <li key={game.gameId}>
              <span>{game.gameTitle}</span>
              <span className="muted">{game.entries === 1 ? "1 entry" : `${game.entries} entries`}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function howItWent(game: Pick<SubPickedGameDto, "progress">): string {
  const progress = game.progress;
  if (!progress) return "Not started";
  if (!progress.dateFinished) return `In progress since ${formatDateOnly(progress.dateStarted)}`;
  const time = progress.completionTime ? ` in ${progress.completionTime}` : "";
  const criteria = progress.beatenCriteria ? ` (${progress.beatenCriteria})` : "";
  return `Completed ${formatDateOnly(progress.dateFinished)}${time}${criteria}`;
}
