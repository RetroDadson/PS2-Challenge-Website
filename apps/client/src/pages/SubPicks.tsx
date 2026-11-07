import type { SubPoolDto } from "@ps2-challenge/shared";
import { CalendarClock, Dices, Gamepad2, History, Ticket } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { Stat } from "../components/Stat.js";
import { Empty, ErrorMessage, Loading } from "../components/Status.js";
import { useAsync, useCurrentUser } from "../hooks.js";
import { formatOdds } from "../subPickLabels.js";

export function SubPicks() {
  const summary = useAsync(() => api.subPicksSummary(), []);
  const user = useCurrentUser();

  if (summary.loading) return <Loading />;
  if (summary.error || !summary.data) return <ErrorMessage message={summary.error ?? "Unable to load sub picks"} />;

  const { schedule, nextDrawPool, hundredsPool, tierEntries } = summary.data;
  const nextDrawLabel = schedule.nextDrawKind === "100s" ? "100s draw" : "10s draw";

  return (
    <section className="page sub-picks-page">
      <header className="page-header">
        <div>
          <p>Picked by subs</p>
          <h1>Sub Picks</h1>
        </div>
        <div className="actions">
          <Link className="button-link secondary" to="/sub-picks/history"><History aria-hidden />Draw History</Link>
          {user.data?.isAuthenticated ? (
            <Link className="button-link" to="/sub-picks/mine"><Ticket aria-hidden />My Entries</Link>
          ) : (
            <a className="button-link twitch" href="/api/auth/login?returnUrl=%2Fsub-picks%2Fmine">Login to Pick</a>
          )}
        </div>
      </header>

      <div className="page-introduction">
        <p>
          Every 10th game in the challenge is picked by Twitch subs, and every 100th game is a bigger draw made up of picks that didn't win along the way.
          Each sub earns entries, and each entry is one pick on the wheel.
        </p>
        <p className="muted">
          Tier 1 and Prime: {plural(tierEntries.tier1, "entry")}. Tier 2: {plural(tierEntries.tier2, "entry")}. Tier 3: {plural(tierEntries.tier3, "entry")}.
          Gifted subs earn entries for the gifter.
        </p>
      </div>

      <div className="stats-grid">
        <Stat tone="challenge" icon={Gamepad2} label="Next Game" value={`Game ${schedule.nextGameNumber}`} />
        <Stat
          tone="progress"
          icon={CalendarClock}
          label={`Next ${nextDrawLabel}: Game ${schedule.nextDrawGameNumber}`}
          value={schedule.gamesUntilNextDraw === 0 ? "Next game" : plural(schedule.gamesUntilNextDraw, "game") + " to go"}
        />
        <Stat
          tone="remaining-games"
          icon={CalendarClock}
          label={`Next 100s draw: Game ${schedule.nextHundredDrawGameNumber}`}
          value={schedule.gamesUntilNextHundredDraw === 0 ? "Next game" : plural(schedule.gamesUntilNextHundredDraw, "game") + " to go"}
        />
        <Stat tone="completed" icon={Dices} label="Entries in the Next Draw" value={nextDrawPool.totalEntries} />
      </div>

      <PoolPanel
        title={`Next Draw Pool (Game ${schedule.nextDrawGameNumber})`}
        description={
          schedule.nextDrawKind === "100s"
            ? "This is a 100s draw, so it includes every picked entry that hasn't been drawn yet plus the 100s pool."
            : "Every picked entry that hasn't been in a draw yet."
        }
        pool={nextDrawPool}
        emptyMessage="No picks yet. If the pool is empty when the draw comes up, the game is chosen as normal."
      />
      <PoolPanel
        title="100s Pool"
        description={`Picks that lost a 10s draw. They're locked in for game ${schedule.nextHundredDrawGameNumber}.`}
        pool={hundredsPool}
        emptyMessage="Nothing in the 100s pool yet."
      />
    </section>
  );
}

function PoolPanel({
  title,
  description,
  pool,
  emptyMessage
}: Readonly<{ title: string; description: string; pool: SubPoolDto; emptyMessage: string }>) {
  const headingId = `${title.replaceAll(/\W+/g, "-").toLocaleLowerCase("en-GB")}-heading`;
  return (
    <section className="panel" aria-labelledby={headingId}>
      <header className="section-header">
        <h2 id={headingId}>{title}</h2>
        <span className="muted">{plural(pool.totalEntries, "entry")}</span>
      </header>
      <p className="muted">{description}</p>
      {pool.games.length === 0 ? (
        <Empty>{emptyMessage}</Empty>
      ) : (
        <div className="table-scroll">
          <table className="data-table sub-pool-table">
            <thead>
              <tr><th>Game</th><th>Entries</th><th>Odds</th></tr>
            </thead>
            <tbody>
              {pool.games.map((game) => (
                <tr key={game.gameId}>
                  <td data-label="Game">{game.gameTitle}</td>
                  <td data-label="Entries">{game.entries}</td>
                  <td data-label="Odds">{formatOdds(game.odds)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function plural(count: number, noun: string): string {
  if (count === 1) return `1 ${noun}`;
  const pluralNoun = noun.endsWith("y") ? noun.slice(0, -1) + "ies" : noun + "s";
  return `${count} ${pluralNoun}`;
}
