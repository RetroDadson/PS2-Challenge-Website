import type { EligibleGameDto } from "@ps2-challenge/shared";
import { Search } from "lucide-react";
import { useId, useMemo, useState } from "react";

export function GamePicker({
  games,
  currentGameId,
  busy,
  onSave,
  onCancel
}: Readonly<{
  games: EligibleGameDto[];
  currentGameId: number | null;
  busy: boolean;
  onSave: (gameId: number | null) => void;
  onCancel: () => void;
}>) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<number | null>(games.some((game) => game.id === currentGameId) ? currentGameId : null);
  const matches = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("en-GB");
    return needle ? games.filter((game) => game.title.toLocaleLowerCase("en-GB").includes(needle)) : games;
  }, [games, query]);
  const choice = matches.some((game) => game.id === selected) ? selected : null;

  return (
    <div className="game-picker">
      <label className="search" htmlFor={`${id}-search`}>
        <Search aria-hidden />
        <span className="visually-hidden">Search games</span>
        <input id={`${id}-search`} type="search" placeholder="Search games" value={query} onChange={(event) => setQuery(event.target.value)} />
      </label>
      <label className="visually-hidden" htmlFor={`${id}-game`}>Game</label>
      <select
        id={`${id}-game`}
        size={Math.min(8, Math.max(2, matches.length))}
        value={choice ?? ""}
        onChange={(event) => setSelected(event.target.value ? Number(event.target.value) : null)}
      >
        <option value="" hidden disabled />
        {matches.map((game) => (
          <option key={game.id} value={game.id}>{game.title}</option>
        ))}
      </select>
      {matches.length === 0 ? <p className="muted">No games match that search.</p> : null}
      <div className="game-picker-actions">
        <button type="button" disabled={busy || choice === null} onClick={() => onSave(choice)}>Save Pick</button>
        {currentGameId === null ? null : (
          <button type="button" className="secondary" disabled={busy} onClick={() => onSave(null)}>Clear Pick</button>
        )}
        <button type="button" className="secondary" disabled={busy} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
