import { Edit3, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import type { AlternateTitle, GameDto } from "@ps2-challenge/shared";
import { api } from "../api.js";
import { CoverImage } from "../components/CoverImage.js";
import { GameModal } from "../components/GameModal.js";
import { Empty, ErrorMessage, Loading } from "../components/Status.js";
import { formatDateOnly } from "../dateUtils.js";
import { useAsync, useCurrentUser, useRealtime } from "../hooks.js";

type SortColumn = "Title" | "Developer" | "Publisher" | "FirstReleased" | "RegionFirstReleasedIn" | "IsExcluded" | "IsOwned" | "CompletionStatus";

export function Games() {
  const user = useCurrentUser();
  const pageData = useAsync(() => api.gamesPageData(), []);
  const [search, setSearch] = useState("");
  const [showOwnedOnly, setShowOwnedOnly] = useState(localStorage.getItem("showOwnedOnly") === "true");
  const [showExcludedGames, setShowExcludedGames] = useState(localStorage.getItem("showExcludedGames") === "true");
  const [sortColumn, setSortColumn] = useState<SortColumn>("Title");
  const [sortAscending, setSortAscending] = useState(true);
  const [editing, setEditing] = useState<GameDto | null | undefined>(undefined);
  useRealtime("/gamesHub", () => void pageData.reload());

  const isAdmin = user.data?.role === "Admin";
  const games = pageData.data?.games ?? [];
  const ownedTypes = pageData.data?.ownedTypes ?? {};
  const exclusionReasons = pageData.data?.exclusionReasons ?? {};
  const completionStatus = pageData.data?.completionStatus ?? {};
  const alternateTitles = pageData.data?.alternateTitles ?? {};

  const counts = useMemo(() => {
    const nonExcluded = games.filter((game) => !game.isExcluded);
    return {
      total: games.length,
      owned: games.filter((game) => game.isOwned).length,
      excluded: games.filter((game) => game.isExcluded).length,
      completed: nonExcluded.filter((game) => getCompletionStatus(completionStatus, game.id) === "Completed").length,
      inProgress: nonExcluded.filter((game) => getCompletionStatus(completionStatus, game.id) === "In Progress").length,
      notStarted: nonExcluded.filter((game) => getCompletionStatus(completionStatus, game.id) === "Not Started").length
    };
  }, [completionStatus, games]);

  const filtered = useMemo(() => {
    const searchLower = search.trim().toLocaleLowerCase("en-GB");
    const visible = games.filter((game) => {
      if (showOwnedOnly && !game.isOwned) return false;
      if (!showExcludedGames && game.isExcluded) return false;
      if (!searchLower) return true;
      return gameMatchesSearch(game, searchLower, alternateTitles);
    });
    return sortGames(visible, sortColumn, sortAscending, completionStatus);
  }, [alternateTitles, completionStatus, games, search, showExcludedGames, showOwnedOnly, sortAscending, sortColumn]);

  const save = async (draft: Partial<GameDto>) => {
    return editing ? api.updateGame(editing.id, draft) : api.createGame(draft);
  };

  const remove = async (id: number) => {
    await api.deleteGame(id);
    setEditing(undefined);
    await pageData.reload();
  };

  const sortBy = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortAscending(!sortAscending);
      return;
    }
    setSortColumn(column);
    setSortAscending(true);
  };

  if (user.loading || pageData.loading) return <Loading />;
  if (user.error || pageData.error) return <ErrorMessage message={user.error ?? pageData.error ?? ""} />;

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p>Library</p>
          <h1>PS2 Games Library</h1>
        </div>
        {isAdmin ? <button onClick={() => setEditing(null)}><Plus />Add New Game</button> : null}
      </header>
      <section className="panel">
        <div className="toolbar">
          <label className="search">
            <Search />
            <input
              placeholder="Search games by title, developer, or publisher..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={showOwnedOnly}
              onChange={(event) => {
                setShowOwnedOnly(event.target.checked);
                localStorage.setItem("showOwnedOnly", String(event.target.checked));
              }}
            />
            <span>Show Owned Only</span>
          </label>
          <label>
            <input
              type="checkbox"
              checked={showExcludedGames}
              onChange={(event) => {
                setShowExcludedGames(event.target.checked);
                localStorage.setItem("showExcludedGames", String(event.target.checked));
              }}
            />
            <span>Show Excluded Games</span>
          </label>
        </div>
        <div className="results-count">
          Showing {filtered.length} of {counts.total} games | Owned: {counts.owned} | Excluded: {counts.excluded} | Completed: {counts.completed} | In Progress: {counts.inProgress} | Not Started: {counts.notStarted}
        </div>
      </section>
      {filtered.length ? (
        <div className="table-scroll">
          <table className="data-table games-table">
            <colgroup>
              {isAdmin ? <col className="col-games-actions" /> : null}
              <col className="col-games-cover" />
              <col className="col-games-title" />
              <col className="col-games-developer" />
              <col className="col-games-publisher" />
              <col className="col-games-release" />
              <col className="col-games-region" />
              <col className="col-games-excluded" />
              <col className="col-games-owned" />
              <col className="col-games-status" />
            </colgroup>
            <thead>
              <tr>
                {isAdmin ? <th>Actions</th> : null}
                <th>Cover</th>
                <th><SortButton column="Title" current={sortColumn} ascending={sortAscending} onSort={sortBy}>Title</SortButton></th>
                <th><SortButton column="Developer" current={sortColumn} ascending={sortAscending} onSort={sortBy}>Developer</SortButton></th>
                <th><SortButton column="Publisher" current={sortColumn} ascending={sortAscending} onSort={sortBy}>Publisher</SortButton></th>
                <th><SortButton column="FirstReleased" current={sortColumn} ascending={sortAscending} onSort={sortBy}>Release Date</SortButton></th>
                <th><SortButton column="RegionFirstReleasedIn" current={sortColumn} ascending={sortAscending} onSort={sortBy}>Region First Released In</SortButton></th>
                <th><SortButton column="IsExcluded" current={sortColumn} ascending={sortAscending} onSort={sortBy}>Excluded</SortButton></th>
                <th><SortButton column="IsOwned" current={sortColumn} ascending={sortAscending} onSort={sortBy}>Owned</SortButton></th>
                <th><SortButton column="CompletionStatus" current={sortColumn} ascending={sortAscending} onSort={sortBy}>Status</SortButton></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((game) => {
                const status = getCompletionStatus(completionStatus, game.id);
                return (
                  <tr key={game.id} className={gameRowClass(game)}>
                    {isAdmin ? <td data-label="Actions"><button className="icon-button" onClick={() => setEditing(game)} aria-label={`Edit ${game.title}`}><Edit3 /></button></td> : null}
                    <td className="cover-cell" data-label="Cover"><CoverImage src={game.imageUrl} alt={`${game.title} cover`} /></td>
                    <td data-label="Title"><GameTitle game={game} alternateTitles={alternateTitles[String(game.id)] ?? []} /></td>
                    <td data-label="Developer">{game.developer}</td>
                    <td data-label="Publisher">{game.publisher}</td>
                    <td data-label="Release Date">{formatDateOnly(game.firstReleased, "Unknown")}</td>
                    <td data-label="Region">{game.regionFirstReleasedIn}</td>
                    <td data-label="Excluded">
                      {game.isExcluded
                        ? <span className="badge excluded-badge" title={exclusionReasons[String(game.id)] ?? "No reason provided"}>Excluded</span>
                        : <span className="badge included-badge">Included</span>}
                    </td>
                    <td data-label="Owned">
                      {game.isOwned
                        ? <span className="badge owned-badge" title={ownedTypes[String(game.id)] ?? "Owned"}>{ownedTypes[String(game.id)] || "Owned"}</span>
                        : <span className="badge not-owned-badge">To Purchase</span>}
                    </td>
                    <td data-label="Status"><span className={`badge ${statusClass(status)}`}>{status}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : <Empty>No games found.</Empty>}
      <EditingGameModal
        editing={editing}
        onClose={() => setEditing(undefined)}
        onDelete={remove}
        onSaved={() => pageData.reload({ showLoading: false })}
        onSave={save}
      />
    </section>
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

function EditingGameModal({
  editing,
  onClose,
  onDelete,
  onSave,
  onSaved
}: Readonly<{
  editing: GameDto | null | undefined;
  onClose: () => void;
  onDelete: (id: number) => Promise<void>;
  onSave: (draft: Partial<GameDto>) => Promise<GameDto>;
  onSaved: () => Promise<void>;
}>) {
  if (editing === undefined) {
    return null;
  }

  if (editing === null) {
    return <GameModal game={null} onClose={onClose} onSaved={onSaved} onSave={onSave} />;
  }

  return <GameModal game={editing} onClose={onClose} onSaved={onSaved} onSave={onSave} onDelete={onDelete} />;
}

function gameRowClass(game: GameDto) {
  if (game.isExcluded) {
    return "excluded-row";
  }
  if (game.isOwned) {
    return "owned-row";
  }
  return undefined;
}

function sortMarker(current: SortColumn, column: SortColumn, ascending: boolean) {
  if (current !== column) {
    return "";
  }
  return ascending ? " ▲" : " ▼";
}

function GameTitle({ game, alternateTitles }: Readonly<{ game: GameDto; alternateTitles: AlternateTitle[] }>) {
  if (!alternateTitles.length) {
    return <>{game.title}</>;
  }

  const titles = alternateTitles.map((alternateTitle) => alternateTitle.title).join("\n");
  return (
    <span className="alternate-title-hint" title={titles} aria-label={`${game.title}. Alternate titles: ${titles.replaceAll("\n", ", ")}`}>
      {game.title}
    </span>
  );
}

function gameMatchesSearch(game: GameDto, searchLower: string, alternateTitles: Record<string, Array<{ title: string }>>) {
  if ([game.title, game.developer, game.publisher].filter((value): value is string => !!value).some((value) => value.toLocaleLowerCase("en-GB").includes(searchLower))) {
    return true;
  }
  return (alternateTitles[String(game.id)] ?? []).some((alternateTitle) => alternateTitle.title.toLocaleLowerCase("en-GB").includes(searchLower));
}

function sortGames(games: GameDto[], column: SortColumn, ascending: boolean, completionStatus: Record<string, string>) {
  const sorted = [...games].sort((left, right) => compareGames(left, right, column, completionStatus));
  return ascending ? sorted : sorted.reverse();
}

function compareGames(left: GameDto, right: GameDto, column: SortColumn, completionStatus: Record<string, string>) {
  switch (column) {
    case "Developer":
      return compareNullable(left.developer, right.developer);
    case "Publisher":
      return compareNullable(left.publisher, right.publisher);
    case "FirstReleased":
      return compareNullable(left.firstReleased, right.firstReleased);
    case "RegionFirstReleasedIn":
      return compareNullable(left.regionFirstReleasedIn, right.regionFirstReleasedIn);
    case "IsExcluded":
      return Number(left.isExcluded) - Number(right.isExcluded);
    case "IsOwned":
      return Number(left.isOwned) - Number(right.isOwned);
    case "CompletionStatus":
      return getCompletionStatus(completionStatus, left.id).localeCompare(getCompletionStatus(completionStatus, right.id), "en-GB");
    case "Title":
      return left.title.localeCompare(right.title, "en-GB");
  }
}

function compareNullable(left?: string | null, right?: string | null) {
  return (left ?? "").localeCompare(right ?? "", "en-GB");
}

function getCompletionStatus(completionStatus: Record<string, string>, id: number) {
  return completionStatus[String(id)] ?? "Not Started";
}

function statusClass(status: string) {
  if (status === "Completed") return "status-completed";
  if (status === "In Progress") return "status-inprogress";
  return "status-notstarted";
}
