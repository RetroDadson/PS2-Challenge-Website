import type { SubEntryDto } from "@ps2-challenge/shared";
import { Dices, History, ListChecks, Ticket, Trophy } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { GamePicker } from "../components/GamePicker.js";
import { Stat } from "../components/Stat.js";
import { Empty, ErrorMessage, Loading } from "../components/Status.js";
import { useAsync } from "../hooks.js";
import { entryStatusClass, entryStatusLabel, formatOdds } from "../subPickLabels.js";

export function SubPicksMine() {
  const mine = useAsync(loadMySubPicks, []);
  const games = useAsync(() => api.subPickEligibleGames(), []);
  const [editingEntryId, setEditingEntryId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  if (mine.loading) return <Loading />;
  if (mine.error && mine.error !== "Unauthorized") return <ErrorMessage message={mine.error} />;
  if (!mine.data) {
    return (
      <section className="panel narrow auth-message">
        <h1>Not Logged In</h1>
        <p>Log in with Twitch to see your sub pick entries and choose games.</p>
        <a className="button-link twitch" href="/api/auth/login?returnUrl=%2Fsub-picks%2Fmine">Login with Twitch</a>
      </section>
    );
  }

  const savePick = async (entry: SubEntryDto, gameId: number | null) => {
    setSaving(true);
    setStatus(null);
    try {
      const updated = await api.setMySubPick(entry.id, gameId);
      setEditingEntryId(null);
      setStatus({ kind: "success", message: updated.gameTitle ? `Entry ${entry.id} is now on ${updated.gameTitle}` : `Cleared the pick on entry ${entry.id}` });
      await Promise.all([mine.reload(), games.reload()]);
    } catch (error) {
      setStatus({ kind: "error", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setSaving(false);
    }
  };

  const { entries, stats } = mine.data;

  return (
    <section className="page sub-picks-mine-page">
      <header className="page-header">
        <div>
          <p>Sub Picks</p>
          <h1>My Entries</h1>
        </div>
        <Link className="button-link secondary" to="/sub-picks">View Pools</Link>
      </header>

      <div className="stats-grid">
        <Stat tone="challenge" icon={Ticket} label="Entries Earned" value={stats.entriesEarned} />
        <Stat tone="progress" icon={ListChecks} label="Picks Made" value={stats.picksMade} />
        <Stat tone="completed" icon={Trophy} label="Wins" value={stats.wins} />
        <Stat tone="deaths-most" icon={History} label="Draws Entered" value={stats.drawsEntered} />
        <Stat tone="remaining-games" icon={Dices} label="Chance in the Next Draw" value={formatOdds(stats.nextDrawOdds)} />
      </div>

      {status ? <output className={`status${status.kind === "error" ? " error" : ""}`}>{status.message}</output> : null}

      <section className="panel" aria-labelledby="my-entries-heading">
        <h2 id="my-entries-heading">Entries</h2>
        <p className="muted">
          You can pick or change the game on any entry that hasn't been in a draw yet. Stack several entries on one game or spread them out.
        </p>
        {entries.length === 0 ? (
          <Empty>No entries yet. Subscribing, resubscribing or gifting subs on Twitch earns entries.</Empty>
        ) : (
          <ul className="sub-entry-list">
            {entries.map((entry) => (
              <li key={entry.id} className="sub-entry">
                <div className="sub-entry-summary">
                  <span className="muted">Entry {entry.id}</span>
                  <strong>{entry.gameTitle ?? "No game picked"}</strong>
                  <span className={`badge ${entryStatusClass(entry)}`}>{entryStatusLabel(entry)}</span>
                  {entry.canChangePick && editingEntryId !== entry.id ? (
                    <button type="button" className="secondary" onClick={() => setEditingEntryId(entry.id)} aria-label={`${entry.gameId ? "Change" : "Pick"} game for entry ${entry.id}`}>
                      {entry.gameId ? "Change" : "Pick a Game"}
                    </button>
                  ) : null}
                </div>
                {editingEntryId === entry.id ? (
                  <EntryPicker
                    gamesError={games.error}
                    games={games.data ?? []}
                    currentGameId={entry.gameId}
                    busy={saving || games.loading}
                    onSave={(gameId) => void savePick(entry, gameId)}
                    onCancel={() => setEditingEntryId(null)}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}

function EntryPicker({ gamesError, ...picker }: Readonly<{ gamesError: string | null } & Parameters<typeof GamePicker>[0]>) {
  if (gamesError) return <ErrorMessage message={gamesError} />;
  return <GamePicker {...picker} />;
}

async function loadMySubPicks() {
  const user = await api.authUser();
  return user.isAuthenticated ? api.mySubPicks() : null;
}
