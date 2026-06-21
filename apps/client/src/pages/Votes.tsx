import { Archive, Dice5, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import type { CurrentVoteDto, GameDto, VoteRoundDto } from "@ps2-challenge/shared";
import { api } from "../api.js";
import { CoverImage } from "../components/CoverImage.js";
import { ModalDialog } from "../components/ModalDialog.js";
import { Empty, ErrorMessage, Loading } from "../components/Status.js";
import { useAsync, useCurrentUser, useRealtime } from "../hooks.js";

type SortColumn = "VoteRound" | "TopGameTitle" | "TopVotes" | "SecondGameTitle" | "SecondVotes" | "LastGameTitle" | "LastVotes";

export function Votes() {
  const user = useCurrentUser();
  const history = useAsync(() => api.votesHistory(), []);
  const current = useAsync(() => api.currentVotes(), []);
  const games = useAsync(() => api.games(), []);
  const [newCurrentTitle, setNewCurrentTitle] = useState("");
  const [newCurrentCount, setNewCurrentCount] = useState(0);
  const [filter, setFilter] = useState("");
  const [showOnlyRoundsWithVotes, setShowOnlyRoundsWithVotes] = useState(false);
  const [sortColumn, setSortColumn] = useState<SortColumn>("VoteRound");
  const [sortAscending, setSortAscending] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  useRealtime("/votesHub", () => { void history.reload(); void current.reload(); });
  useRealtime("/gamesHub", () => void games.reload());
  const isAdmin = user.data?.role === "Admin";

  const orderedCurrentVotes = useMemo(
    () => [...(current.data ?? [])].sort((left, right) => left.gameNumber - right.gameNumber || right.voteCount - left.voteCount || left.gameTitle.localeCompare(right.gameTitle, "en-GB")),
    [current.data]
  );
  const gamesById = useMemo(() => new Map((games.data ?? []).map((game) => [game.id, game])), [games.data]);
  const titleSuggestions = useMemo(() => {
    const search = newCurrentTitle.trim().toLocaleLowerCase("en-GB");
    if (!search) return [];
    return (games.data ?? [])
      .map((game) => game.title)
      .filter((title) => title.toLocaleLowerCase("en-GB").includes(search))
      .sort((left, right) => left.localeCompare(right, "en-GB"))
      .slice(0, 8);
  }, [games.data, newCurrentTitle]);
  const pieSlices = useMemo(() => buildPieSlices(orderedCurrentVotes), [orderedCurrentVotes]);
  const filteredHistory = useMemo(
    () => sortVoteHistory(filterVoteHistory(history.data ?? [], filter, showOnlyRoundsWithVotes), sortColumn, sortAscending),
    [filter, history.data, showOnlyRoundsWithVotes, sortAscending, sortColumn]
  );

  const addCurrent = async () => {
    const title = newCurrentTitle.trim();
    if (!title) return;
    const gameNumber = nextAvailableGameNumber(orderedCurrentVotes);
    await api.setCurrentVotes([{ gameId: 0, gameTitle: title, voteCount: Math.max(0, newCurrentCount), gameNumber }]);
    setNewCurrentTitle("");
    setNewCurrentCount(0);
    await current.reload();
  };

  const fillRandomGames = async () => {
    const countToAdd = 3 - orderedCurrentVotes.length;
    if (countToAdd <= 0) return;
    await api.fillRandomVotes(countToAdd);
    await current.reload();
  };

  const refresh = async () => {
    await Promise.all([history.reload(), current.reload(), games.reload()]);
  };

  const sortBy = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortAscending(!sortAscending);
      return;
    }
    setSortColumn(column);
    setSortAscending(true);
  };

  const archived = async () => {
    setArchiveOpen(false);
    await history.reload();
    await current.reload();
  };

  const updateCurrentVoteCount = (vote: CurrentVoteDto, voteCount: number) => {
    current.setData((votes) =>
      votes?.map((entry) => (entry.gameNumber === vote.gameNumber ? { ...entry, voteCount } : entry)) ?? votes
    );
    void api.updateVoteByNumber(vote.gameNumber, voteCount).then(() => current.reload()).catch(() => current.reload());
  };

  const removeCurrentVote = async (vote: CurrentVoteDto) => {
    await api.removeCurrentVote(vote.gameTitle);
    await current.reload();
  };

  if (user.loading || history.loading || current.loading || games.loading) return <Loading />;
  if (user.error || history.error || current.error || games.error) return <ErrorMessage message={user.error ?? history.error ?? current.error ?? games.error ?? ""} />;

  return (
    <section className="page">
      <header className="page-header"><div><p>Community</p><h1>Votes</h1></div><button onClick={() => void refresh()}><RefreshCw />Refresh</button></header>
      <CurrentVotesPanel
        games={games.data ?? []}
        gamesById={gamesById}
        isAdmin={isAdmin}
        newCurrentCount={newCurrentCount}
        newCurrentTitle={newCurrentTitle}
        onAdd={() => void addCurrent()}
        onArchiveOpen={() => setArchiveOpen(true)}
        onCountChange={setNewCurrentCount}
        onFillRandom={() => void fillRandomGames()}
        onRefresh={() => void current.reload()}
        onRemove={(vote) => void removeCurrentVote(vote)}
        onTitleChange={setNewCurrentTitle}
        onUpdateVoteCount={updateCurrentVoteCount}
        pieSlices={pieSlices}
        titleSuggestions={titleSuggestions}
        votes={orderedCurrentVotes}
      />
      <VoteHistoryPanel
        allRounds={history.data ?? []}
        ascending={sortAscending}
        filter={filter}
        filteredRounds={filteredHistory}
        onFilterChange={setFilter}
        onShowOnlyRoundsWithVotesChange={setShowOnlyRoundsWithVotes}
        onSort={sortBy}
        showOnlyRoundsWithVotes={showOnlyRoundsWithVotes}
        sortColumn={sortColumn}
      />
      {archiveOpen ? <VoteArchiveModal currentVotes={current.data ?? []} onClose={() => setArchiveOpen(false)} onArchived={archived} /> : null}
    </section>
  );
}

function CurrentVotesPanel({
  games,
  gamesById,
  isAdmin,
  newCurrentCount,
  newCurrentTitle,
  onAdd,
  onArchiveOpen,
  onCountChange,
  onFillRandom,
  onRefresh,
  onRemove,
  onTitleChange,
  onUpdateVoteCount,
  pieSlices,
  titleSuggestions,
  votes
}: Readonly<{
  games: GameDto[];
  gamesById: Map<number, GameDto>;
  isAdmin: boolean;
  newCurrentCount: number;
  newCurrentTitle: string;
  onAdd: () => void;
  onArchiveOpen: () => void;
  onCountChange: (value: number) => void;
  onFillRandom: () => void;
  onRefresh: () => void;
  onRemove: (vote: CurrentVoteDto) => void;
  onTitleChange: (value: string) => void;
  onUpdateVoteCount: (vote: CurrentVoteDto, voteCount: number) => void;
  pieSlices: PieSlice[];
  titleSuggestions: string[];
  votes: CurrentVoteDto[];
}>) {
  return (
    <section className="panel">
      <h2>Current Votes</h2>
      {votes.length ? (
        <CurrentVotesDashboard
          games={games}
          gamesById={gamesById}
          isAdmin={isAdmin}
          onRefresh={onRefresh}
          onRemove={onRemove}
          onUpdateVoteCount={onUpdateVoteCount}
          pieSlices={pieSlices}
          votes={votes}
        />
      ) : <p className="muted">{isAdmin ? "No current votes configured. Add games below." : "No current votes configured."}</p>}
      {isAdmin ? (
        <CurrentVotesAdminToolbar
          newCurrentCount={newCurrentCount}
          newCurrentTitle={newCurrentTitle}
          onAdd={onAdd}
          onArchiveOpen={onArchiveOpen}
          onCountChange={onCountChange}
          onFillRandom={onFillRandom}
          onTitleChange={onTitleChange}
          titleSuggestions={titleSuggestions}
          votes={votes}
        />
      ) : null}
    </section>
  );
}

function CurrentVotesDashboard({
  games,
  gamesById,
  isAdmin,
  onRefresh,
  onRemove,
  onUpdateVoteCount,
  pieSlices,
  votes
}: Readonly<{
  games: GameDto[];
  gamesById: Map<number, GameDto>;
  isAdmin: boolean;
  onRefresh: () => void;
  onRemove: (vote: CurrentVoteDto) => void;
  onUpdateVoteCount: (vote: CurrentVoteDto, voteCount: number) => void;
  pieSlices: PieSlice[];
  votes: CurrentVoteDto[];
}>) {
  return (
    <div className="current-votes-dashboard">
      <div className="current-votes-left">
        <CurrentVotesTable
          games={games}
          gamesById={gamesById}
          isAdmin={isAdmin}
          onRemove={onRemove}
          onUpdateVoteCount={onUpdateVoteCount}
          votes={votes}
        />
        <button className="secondary" onClick={onRefresh}><RefreshCw />Refresh</button>
      </div>
      <CurrentVotesPie slices={pieSlices} />
    </div>
  );
}

function CurrentVotesTable({
  games,
  gamesById,
  isAdmin,
  onRemove,
  onUpdateVoteCount,
  votes
}: Readonly<{
  games: GameDto[];
  gamesById: Map<number, GameDto>;
  isAdmin: boolean;
  onRemove: (vote: CurrentVoteDto) => void;
  onUpdateVoteCount: (vote: CurrentVoteDto, voteCount: number) => void;
  votes: CurrentVoteDto[];
}>) {
  return (
    <table>
      <thead>
        <tr>
          <th>Cover</th>
          <th>Game</th>
          <th>Game#</th>
          <th>Votes</th>
          {isAdmin ? <th>Actions</th> : null}
        </tr>
      </thead>
      <tbody>
        {votes.map((vote) => (
          <CurrentVoteRow
            game={findGameForVote(vote, gamesById, games)}
            isAdmin={isAdmin}
            key={`${vote.gameNumber}-${vote.gameId}-${vote.gameTitle}`}
            onRemove={onRemove}
            onUpdateVoteCount={onUpdateVoteCount}
            vote={vote}
          />
        ))}
      </tbody>
    </table>
  );
}

function CurrentVoteRow({
  game,
  isAdmin,
  onRemove,
  onUpdateVoteCount,
  vote
}: Readonly<{
  game: GameDto | undefined;
  isAdmin: boolean;
  onRemove: (vote: CurrentVoteDto) => void;
  onUpdateVoteCount: (vote: CurrentVoteDto, voteCount: number) => void;
  vote: CurrentVoteDto;
}>) {
  return (
    <tr>
      <td className="cover-cell"><CoverImage src={game?.imageUrl} alt={`${vote.gameTitle} cover`} /></td>
      <td className="game-title">{vote.gameTitle}</td>
      <td>{vote.gameNumber}</td>
      <td>
        {isAdmin ? <VoteCountInput vote={vote} onUpdateVoteCount={onUpdateVoteCount} /> : vote.voteCount}
      </td>
      {isAdmin ? (
        <td>
          <button className="icon-button" onClick={() => onRemove(vote)} aria-label={`Remove ${vote.gameTitle}`}><Trash2 /></button>
        </td>
      ) : null}
    </tr>
  );
}

function VoteCountInput({
  onUpdateVoteCount,
  vote
}: Readonly<{
  onUpdateVoteCount: (vote: CurrentVoteDto, voteCount: number) => void;
  vote: CurrentVoteDto;
}>) {
  return (
    <input
      aria-label={`Votes for ${vote.gameTitle}`}
      min="0"
      type="number"
      value={vote.voteCount}
      onChange={(event) => {
        onUpdateVoteCount(vote, Math.max(0, Number(event.target.value) || 0));
      }}
    />
  );
}

function CurrentVotesPie({ slices }: Readonly<{ slices: PieSlice[] }>) {
  return (
    <div className="current-votes-right">
      <svg className="pie-chart" viewBox="0 0 200 200" role="img" aria-label="Votes breakdown">
        <g transform="translate(100,100)">
          {slices.map((slice) => <path d={slice.path} fill={slice.color} key={slice.label} stroke="#ffffff" strokeWidth="0.6" />)}
          <circle cx="0" cy="0" r="36" fill="var(--surface)" />
        </g>
      </svg>
      <div className="pie-legend">
        {slices.map((slice) => (
          <div className="legend-item" key={slice.label}>
            <span className="legend-swatch" style={{ background: slice.color }} />
            <span className="legend-label">{slice.label}: {slice.value} ({slice.percent.toFixed(1)}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CurrentVotesAdminToolbar({
  newCurrentCount,
  newCurrentTitle,
  onAdd,
  onArchiveOpen,
  onCountChange,
  onFillRandom,
  onTitleChange,
  titleSuggestions,
  votes
}: Readonly<{
  newCurrentCount: number;
  newCurrentTitle: string;
  onAdd: () => void;
  onArchiveOpen: () => void;
  onCountChange: (value: number) => void;
  onFillRandom: () => void;
  onTitleChange: (value: string) => void;
  titleSuggestions: string[];
  votes: CurrentVoteDto[];
}>) {
  return (
    <div className="toolbar vote-admin-toolbar">
      <div className="suggestion-field">
        <input placeholder="Game title" value={newCurrentTitle} onChange={(event) => onTitleChange(event.target.value)} />
        {titleSuggestions.length ? <TitleSuggestions suggestions={titleSuggestions} onSelect={onTitleChange} /> : null}
      </div>
      <label>
        <span>Vote count</span>
        <input
          aria-label="Vote count"
          min="0"
          type="number"
          value={newCurrentCount}
          onChange={(event) => onCountChange(Math.max(0, Number(event.target.value) || 0))}
        />
      </label>
      <button onClick={onAdd}><Plus />Add</button>
      {votes.length ? <button onClick={onArchiveOpen}><Archive />Archive to History</button> : null}
      {votes.length < 3 ? <button onClick={onFillRandom}><Dice5 />Fill with Random Games</button> : null}
    </div>
  );
}

function TitleSuggestions({ suggestions, onSelect }: Readonly<{ suggestions: string[]; onSelect: (title: string) => void }>) {
  return (
    <ul className="suggestions">
      {suggestions.map((title) => (
        <li key={title}>
          <button className="suggestion-option" onClick={() => onSelect(title)}>{title}</button>
        </li>
      ))}
    </ul>
  );
}

function VoteHistoryPanel({
  allRounds,
  ascending,
  filter,
  filteredRounds,
  onFilterChange,
  onShowOnlyRoundsWithVotesChange,
  onSort,
  showOnlyRoundsWithVotes,
  sortColumn
}: Readonly<{
  allRounds: VoteRoundDto[];
  ascending: boolean;
  filter: string;
  filteredRounds: VoteRoundDto[];
  onFilterChange: (value: string) => void;
  onShowOnlyRoundsWithVotesChange: (value: boolean) => void;
  onSort: (column: SortColumn) => void;
  showOnlyRoundsWithVotes: boolean;
  sortColumn: SortColumn;
}>) {
  return (
    <section className="panel">
      <h2>Vote History</h2>
      <VoteHistoryToolbar
        filter={filter}
        filteredCount={filteredRounds.length}
        onFilterChange={onFilterChange}
        onShowOnlyRoundsWithVotesChange={onShowOnlyRoundsWithVotesChange}
        showOnlyRoundsWithVotes={showOnlyRoundsWithVotes}
        totalCount={allRounds.length}
      />
      {filteredRounds.length ? (
        <VoteHistoryTable ascending={ascending} rounds={filteredRounds} onSort={onSort} sortColumn={sortColumn} />
      ) : <Empty>No vote history yet.</Empty>}
    </section>
  );
}

function VoteHistoryToolbar({
  filter,
  filteredCount,
  onFilterChange,
  onShowOnlyRoundsWithVotesChange,
  showOnlyRoundsWithVotes,
  totalCount
}: Readonly<{
  filter: string;
  filteredCount: number;
  onFilterChange: (value: string) => void;
  onShowOnlyRoundsWithVotesChange: (value: boolean) => void;
  showOnlyRoundsWithVotes: boolean;
  totalCount: number;
}>) {
  return (
    <div className="toolbar">
      <label className="search">
        <Search />
        <input placeholder="Search by round or game title..." value={filter} onChange={(event) => onFilterChange(event.target.value)} />
      </label>
      <label>
        <input type="checkbox" checked={showOnlyRoundsWithVotes} onChange={(event) => onShowOnlyRoundsWithVotesChange(event.target.checked)} />
        <span>Show only rounds with votes</span>
      </label>
      <div className="results-count">Showing {filteredCount} of {totalCount} rounds</div>
    </div>
  );
}

function VoteHistoryTable({
  ascending,
  onSort,
  rounds,
  sortColumn
}: Readonly<{
  ascending: boolean;
  onSort: (column: SortColumn) => void;
  rounds: VoteRoundDto[];
  sortColumn: SortColumn;
}>) {
  return (
    <table>
      <thead>
        <tr>
          <th><SortButton column="VoteRound" current={sortColumn} ascending={ascending} onSort={onSort}>Round</SortButton></th>
          <th><SortButton column="TopGameTitle" current={sortColumn} ascending={ascending} onSort={onSort}>Top Game</SortButton></th>
          <th><SortButton column="TopVotes" current={sortColumn} ascending={ascending} onSort={onSort}>Top Votes</SortButton></th>
          <th><SortButton column="SecondGameTitle" current={sortColumn} ascending={ascending} onSort={onSort}>2nd Game</SortButton></th>
          <th><SortButton column="SecondVotes" current={sortColumn} ascending={ascending} onSort={onSort}>2nd Votes</SortButton></th>
          <th><SortButton column="LastGameTitle" current={sortColumn} ascending={ascending} onSort={onSort}>Last Game</SortButton></th>
          <th><SortButton column="LastVotes" current={sortColumn} ascending={ascending} onSort={onSort}>Last Votes</SortButton></th>
          <th>Notes</th>
        </tr>
      </thead>
      <tbody>
        {rounds.map((round) => <VoteHistoryRow key={round.voteRound} round={round} />)}
      </tbody>
    </table>
  );
}

function VoteHistoryRow({ round }: Readonly<{ round: VoteRoundDto }>) {
  return (
    <tr>
      <td>{round.voteRound}</td>
      <td className="game-title">{round.topGameTitle}{isTopTied(round) ? <span className="muted"> (Tied)</span> : null}</td>
      <td>{round.topVotes}</td>
      <td className="game-title">{round.secondGameTitle}{isSecondTied(round) ? <span className="muted"> (Tied)</span> : null}</td>
      <td>{round.secondVotes}</td>
      <td className="game-title">{round.lastGameTitle}{isLastTied(round) ? <span className="muted"> (Tied)</span> : null}</td>
      <td>{round.lastVotes}</td>
      <td>{round.notes?.trim() ? round.notes : "-"}</td>
    </tr>
  );
}

function SortButton({
  column,
  current,
  ascending,
  onSort,
  children
}: Readonly<{
  column: SortColumn;
  current: SortColumn;
  ascending: boolean;
  onSort: (column: SortColumn) => void;
  children: string;
}>) {
  const marker = sortMarker(current, column, ascending);
  return <button className="table-sort-button" onClick={() => onSort(column)}>{children}{marker}</button>;
}

function sortMarker(current: SortColumn, column: SortColumn, ascending: boolean) {
  if (current !== column) {
    return "";
  }
  return ascending ? " ▲" : " ▼";
}

function filterVoteHistory(rounds: VoteRoundDto[], filter: string, showOnlyRoundsWithVotes: boolean) {
  const search = filter.trim().toLocaleLowerCase("en-GB");
  return rounds.filter((round) => {
    if (showOnlyRoundsWithVotes && round.topVotes + round.secondVotes + round.lastVotes === 0) {
      return false;
    }
    if (!search) return true;
    return [
      String(round.voteRound),
      round.topGameTitle,
      round.secondGameTitle,
      round.lastGameTitle,
      round.notes ?? ""
    ].some((value) => value.toLocaleLowerCase("en-GB").includes(search));
  });
}

function sortVoteHistory(rounds: VoteRoundDto[], column: SortColumn, ascending: boolean) {
  const sorted = [...rounds].sort((left, right) => compareVoteRounds(left, right, column));
  return ascending ? sorted : sorted.reverse();
}

function compareVoteRounds(left: VoteRoundDto, right: VoteRoundDto, column: SortColumn) {
  switch (column) {
    case "TopVotes":
      return left.topVotes - right.topVotes;
    case "SecondVotes":
      return left.secondVotes - right.secondVotes;
    case "LastVotes":
      return left.lastVotes - right.lastVotes;
    case "TopGameTitle":
      return left.topGameTitle.localeCompare(right.topGameTitle, "en-GB");
    case "SecondGameTitle":
      return left.secondGameTitle.localeCompare(right.secondGameTitle, "en-GB");
    case "LastGameTitle":
      return left.lastGameTitle.localeCompare(right.lastGameTitle, "en-GB");
    case "VoteRound":
      return left.voteRound - right.voteRound;
  }
}

function isTopTied(round: VoteRoundDto) {
  return !round.topPosition && round.topVotes === round.secondVotes;
}

function isSecondTied(round: VoteRoundDto) {
  return !round.secondPosition && (round.secondVotes === round.topVotes || round.secondVotes === round.lastVotes);
}

function isLastTied(round: VoteRoundDto) {
  return !round.lastPosition && round.lastVotes === round.secondVotes;
}

function nextAvailableGameNumber(votes: CurrentVoteDto[]) {
  const usedNumbers = new Set(votes.map((vote) => vote.gameNumber));
  return [1, 2, 3].find((number) => !usedNumbers.has(number)) ?? 1;
}

function findGameForVote(vote: CurrentVoteDto, gamesById: Map<number, GameDto>, games: GameDto[]) {
  return gamesById.get(vote.gameId) ?? games.find((game) => game.title.toLocaleLowerCase("en-GB") === vote.gameTitle.toLocaleLowerCase("en-GB"));
}

type PieSlice = {
  path: string;
  color: string;
  label: string;
  value: number;
  percent: number;
};

function buildPieSlices(votes: CurrentVoteDto[]): PieSlice[] {
  const total = votes.reduce((sum, vote) => sum + Math.max(0, vote.voteCount), 0);
  if (total <= 0) {
    return [{ path: fullCirclePath(70), color: "#e0e0e0", label: "No votes", value: 0, percent: 100 }];
  }

  const colors = ["#e91e63", "#9c27b0", "#9146ff", "#ff9800", "#4caf50", "#2196f3", "#f44336", "#ffc107"];
  const slices: PieSlice[] = [];
  const itemsWithVotes = votes.filter((vote) => vote.voteCount > 0);
  let startAngle = -90;

  votes.forEach((vote, index) => {
    const value = Math.max(0, vote.voteCount);
    if (value === 0) return;
    const angle = (value / total) * 360;
    const endAngle = startAngle + angle;
    slices.push({
      path: itemsWithVotes.length === 1 && value === total ? fullCirclePath(70) : sectorPath(startAngle, endAngle, 70),
      color: colors[index % colors.length]!,
      label: vote.gameTitle,
      value,
      percent: (value / total) * 100
    });
    startAngle = endAngle;
  });

  return slices;
}

function sectorPath(startAngleDeg: number, endAngleDeg: number, radius: number) {
  const startRad = (Math.PI / 180) * startAngleDeg;
  const endRad = (Math.PI / 180) * endAngleDeg;
  const x1 = radius * Math.cos(startRad);
  const y1 = radius * Math.sin(startRad);
  const x2 = radius * Math.cos(endRad);
  const y2 = radius * Math.sin(endRad);
  const largeArc = endAngleDeg - startAngleDeg > 180 ? 1 : 0;
  return `M 0 0 L ${formatPathNumber(x1)} ${formatPathNumber(y1)} A ${radius} ${radius} 0 ${largeArc} 1 ${formatPathNumber(x2)} ${formatPathNumber(y2)} Z`;
}

function fullCirclePath(radius: number) {
  return `M 0 ${-radius} A ${radius} ${radius} 0 0 1 0 ${radius} A ${radius} ${radius} 0 0 1 0 ${-radius} Z`;
}

function formatPathNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(3);
}

export const votesPageHelpers = {
  sortMarker,
  filterVoteHistory,
  sortVoteHistory,
  isTopTied,
  isSecondTied,
  isLastTied,
  nextAvailableGameNumber,
  findGameForVote,
  buildPieSlices,
  sectorPath,
  fullCirclePath,
  formatPathNumber
};

function VoteArchiveModal({
  currentVotes,
  onClose,
  onArchived
}: Readonly<{
  currentVotes: CurrentVoteDto[];
  onClose: () => void;
  onArchived: () => Promise<void>;
}>) {
  const [notes, setNotes] = useState("");
  const [manualPositions, setManualPositions] = useState<Record<number, number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sortedVotes = useMemo(() => [...currentVotes].sort((left, right) => right.voteCount - left.voteCount), [currentVotes]);
  const hasTies = useMemo(() => new Set(currentVotes.map((vote) => vote.voteCount)).size !== currentVotes.length, [currentVotes]);

  const archive = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.archiveVotes(notes.trim() || null, Object.keys(manualPositions).length ? manualPositions : undefined);
      await onArchived();
    } catch (archiveError) {
      setError(archiveError instanceof Error ? archiveError.message : String(archiveError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalDialog title="Archive Current Votes to History" onClose={onClose}>
        {error ? <div className="status error">{error}</div> : null}
        {hasTies ? (
          <div className="modal-section">
            <h3>Tied Votes Detected</h3>
            {sortedVotes.map((vote) => (
              <div className="archive-position-row" key={vote.gameId}>
                <span>{vote.gameTitle}</span>
                <span>{vote.voteCount} votes</span>
                <select
                  aria-label={`Position for ${vote.gameTitle}`}
                  value={manualPositions[vote.gameId] ?? ""}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    const next = { ...manualPositions };
                    if (value) {
                      next[vote.gameId] = value;
                    } else {
                      delete next[vote.gameId];
                    }
                    setManualPositions(next);
                  }}
                >
                  <option value="">Auto/Tied</option>
                  <option value="1">1st Place</option>
                  <option value="2">2nd Place</option>
                  <option value="3">3rd Place</option>
                </select>
              </div>
            ))}
          </div>
        ) : null}
        <label><span>Notes</span><textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
        <footer>
          <button className="secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button onClick={archive} disabled={busy}>{busy ? "Archiving..." : "Archive"}</button>
        </footer>
    </ModalDialog>
  );
}
