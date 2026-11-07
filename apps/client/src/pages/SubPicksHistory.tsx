import type { SubDrawHistoryDto, SubDrawHistoryEntryDto, SubSpinDecision } from "@ps2-challenge/shared";
import { Dices, History, Trophy, XCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { Empty, ErrorMessage, Loading } from "../components/Status.js";
import { useAsync, useRealtime } from "../hooks.js";
import { formatOdds } from "../subPickLabels.js";

const decisionLabels: Record<SubSpinDecision, string> = {
  pending: "Waiting",
  accepted: "Accepted",
  respun: "Respun",
  cancelled: "Draw cancelled"
};

export function SubPicksHistory() {
  const history = useAsync(() => api.subDrawHistory(), []);
  useRealtime("/wheelHub", () => void history.reload());

  return (
    <section className="page sub-history-page">
      <header className="page-header">
        <div>
          <p>Sub Picks</p>
          <h1>Draw History</h1>
        </div>
        <Link className="button-link secondary" to="/sub-picks"><Dices aria-hidden />Back to Sub Picks</Link>
      </header>
      <p className="page-introduction">
        Every finished draw, newest first: who won, every spin including the ones that were respun, and what happened to each entry afterwards.
      </p>
      {history.loading ? <Loading /> : null}
      {history.error ? <ErrorMessage message={history.error} /> : null}
      {history.data?.length === 0 ? <Empty>No draws have finished yet.</Empty> : null}
      <div className="sub-history-list">
        {history.data?.map((draw) => <DrawCard key={draw.id} draw={draw} />)}
      </div>
    </section>
  );
}

function DrawCard({ draw }: Readonly<{ draw: SubDrawHistoryDto }>) {
  const entryCount = draw.entries.length;
  return (
    <article className="panel sub-history-draw" aria-labelledby={`sub-draw-${draw.id}`}>
      <header className="sub-history-header">
        <h2 id={`sub-draw-${draw.id}`}>Game {draw.gameNumber}</h2>
        <span className="badge included-badge">{draw.kind} draw</span>
        {draw.finishedAt ? <time dateTime={draw.finishedAt} className="muted">{formatDate(draw.finishedAt)}</time> : null}
      </header>
      {draw.winner ? (
        <p className="sub-history-winner">
          <Trophy aria-hidden />
          <span>
            <strong>{draw.winner.gameTitle}</strong>
            {draw.winner.twitchDisplayName ? ` picked by ${draw.winner.twitchDisplayName}` : ""}
            <span className="muted"> · {draw.winner.entries} of {entryCount} {entryCount === 1 ? "entry" : "entries"} ({formatOdds(draw.winner.odds)} chance)</span>
          </span>
        </p>
      ) : (
        <p className="sub-history-winner is-cancelled"><XCircle aria-hidden /><span>Cancelled with no winner.</span></p>
      )}
      <p className="muted sub-history-meta">
        {entryCount} {entryCount === 1 ? "entry" : "entries"} · {draw.odds.length} {draw.odds.length === 1 ? "game" : "games"} · {draw.spins.length}{" "}
        {draw.spins.length === 1 ? "spin" : "spins"}
      </p>
      {draw.spins.length || entryCount ? (
        <details className="sub-history-details">
          <summary><History aria-hidden />Spins and entries</summary>
          {draw.spins.length ? <SpinsTable draw={draw} /> : null}
          {entryCount ? <EntriesTable draw={draw} /> : null}
        </details>
      ) : null}
    </article>
  );
}

function SpinsTable({ draw }: Readonly<{ draw: SubDrawHistoryDto }>) {
  return (
    <div className="table-scroll">
      <table className="data-table sub-history-table">
        <caption>Spins</caption>
        <thead><tr><th>Spin</th><th>When</th><th>Landed on</th><th>Chance</th><th>Decision</th></tr></thead>
        <tbody>
          {draw.spins.map((spin) => (
            <tr key={spin.spinNumber}>
              <td data-label="Spin">{spin.spinNumber}</td>
              <td data-label="When"><time dateTime={spin.startedAt}>{formatTime(spin.startedAt)}</time></td>
              <td data-label="Landed on">
                {spin.result.gameTitle}
                {spin.result.twitchDisplayName ? <span className="muted"> ({spin.result.twitchDisplayName})</span> : null}
              </td>
              <td data-label="Chance">{formatOdds(spin.result.odds)}</td>
              <td data-label="Decision">{decisionLabels[spin.decision]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EntriesTable({ draw }: Readonly<{ draw: SubDrawHistoryDto }>) {
  return (
    <div className="table-scroll">
      <table className="data-table sub-history-table">
        <caption>Entries</caption>
        <thead><tr><th>Viewer</th><th>Picked</th><th>What happened</th></tr></thead>
        <tbody>
          {draw.entries.map((entry) => (
            <tr key={entry.entryId} className={entry.outcome === "won" ? "is-winner" : undefined}>
              <td data-label="Viewer">{entry.twitchDisplayName ?? "Anonymous"}</td>
              <td data-label="Picked">{entry.gameTitle}</td>
              <td data-label="What happened">{entryFate(entry, draw)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function entryFate(entry: SubDrawHistoryEntryDto, draw: Pick<SubDrawHistoryDto, "gameNumber" | "status">): string {
  if (entry.outcome === "won") return `Won game ${entry.playedGameNumber ?? draw.gameNumber}`;
  if (entry.outcome === "removed_played") return `Same game won, so it was played at game ${entry.playedGameNumber ?? draw.gameNumber}`;
  if (entry.outcome === "lost") return "Lost in the 100s draw";
  if (entry.outcome === "moved_to_100s") return `Moved to the 100s pool${laterFate(entry)}`;
  return draw.status === "cancelled" ? "Draw cancelled, entry went back to waiting" : "No result";
}

function laterFate(entry: SubDrawHistoryEntryDto): string {
  switch (entry.currentStatus) {
    case "won":
      return `, then won game ${entry.currentPlayedGameNumber}`;
    case "lost":
      return ", then lost in the 100s draw";
    case "removed_played":
      return `, then its game was played at game ${entry.currentPlayedGameNumber}`;
    case "voided":
      return ", then removed";
    default:
      return "";
  }
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

function formatTime(value: string): string {
  return new Date(value).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
