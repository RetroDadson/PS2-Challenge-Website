import { Edit3, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import type { AlternateTitle, GameProgressDto } from "@ps2-challenge/shared";
import { api } from "../api.js";
import { CoverImage } from "../components/CoverImage.js";
import { ProgressModal } from "../components/ProgressModal.js";
import { SortButton } from "../components/SortButton.js";
import { Empty, ErrorMessage, Loading } from "../components/Status.js";
import { formatDateOnly } from "../dateUtils.js";
import { useAsync, useCurrentUser, useRealtime } from "../hooks.js";
import { compareNullable } from "../sortHelpers.js";

type SortColumn = "ProgressId" | "Status" | "GameTitle" | "DateStarted" | "DateFinished" | "CompletionTime" | "Platform";

export function Progress() {
  const user = useCurrentUser();
  const progress = useAsync(() => api.progress(), []);
  const gamesPageData = useAsync(() => api.gamesPageData(), []);
  const [searchQuery, setSearchQuery] = useState("");
  const [showCompletedOnly, setShowCompletedOnly] = useState(false);
  const [showInProgressOnly, setShowInProgressOnly] = useState(false);
  const [sortColumn, setSortColumn] = useState<SortColumn>("ProgressId");
  const [sortAscending, setSortAscending] = useState(false);
  const [editingProgress, setEditingProgress] = useState<GameProgressDto | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  useRealtime("/gamesHub", () => {
    void progress.reload();
    void gamesPageData.reload();
  });

  const isAdmin = user.data?.role === "Admin";
  const allProgress = progress.data ?? [];
  const alternateTitles = gamesPageData.data?.alternateTitles ?? {};
  const completedCount = allProgress.filter((game) => !!game.dateFinished).length;
  const inProgressCount = allProgress.length - completedCount;

  const filtered = useMemo(
    () =>
      sortProgress(
        allProgress.filter((game) => {
          if (showCompletedOnly && !game.dateFinished) return false;
          if (showInProgressOnly && game.dateFinished) return false;
          if (!searchQuery.trim()) return true;
          const query = searchQuery.trim().toLocaleLowerCase("en-GB");
          return [game.gameTitle, game.beatenCriteria, game.review]
            .filter((value): value is string => !!value)
            .some((value) => value.toLocaleLowerCase("en-GB").includes(query));
        }),
        sortColumn,
        sortAscending
      ),
    [allProgress, searchQuery, showCompletedOnly, showInProgressOnly, sortAscending, sortColumn]
  );

  const titleSuggestions = useMemo(
    () => [...new Set((gamesPageData.data?.games ?? []).map((game) => game.title).filter(Boolean))].sort((left, right) => left.localeCompare(right, "en-GB")),
    [gamesPageData.data?.games]
  );

  const save = async (payload: Record<string, unknown>) => {
    await api.updateProgress(payload);
    setModalOpen(false);
    setEditingProgress(null);
    await progress.reload();
  };

  const openAddModal = () => {
    setEditingProgress(null);
    setModalOpen(true);
  };

  const openEditModal = (game: GameProgressDto) => {
    setEditingProgress(game);
    setModalOpen(true);
  };

  const sortBy = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortAscending(!sortAscending);
      return;
    }
    setSortColumn(column);
    setSortAscending(true);
  };

  if (user.loading || progress.loading || gamesPageData.loading) return <Loading />;
  if (user.error || progress.error || gamesPageData.error) return <ErrorMessage message={user.error ?? progress.error ?? gamesPageData.error ?? ""} />;

  return (
    <section className="page">
      <header className="page-header">
        <div><p>Challenge</p><h1>Game Progress</h1></div>
        {isAdmin ? <button onClick={openAddModal}><Plus />Add New Game</button> : null}
      </header>
      <section className="panel">
        <div className="toolbar progress-toolbar">
          <input
            placeholder="Search by title, criteria, or review..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
          <label><input type="checkbox" checked={showCompletedOnly} onChange={(event) => setShowCompletedOnly(event.target.checked)} /> Show Completed Only</label>
          <label><input type="checkbox" checked={showInProgressOnly} onChange={(event) => setShowInProgressOnly(event.target.checked)} /> Show In Progress Only</label>
        </div>
        <div className="results-count">
          Showing {filtered.length} of {allProgress.length} games | Completed: {completedCount} | In Progress: {inProgressCount}
        </div>
      </section>
      {filtered.length ? (
        <div className="table-scroll">
          <table className="data-table progress-table">
            <colgroup>
              <col className="col-progress-number" />
              <col className="col-progress-status" />
              <col className="col-progress-cover" />
              <col className="col-progress-title" />
              <col className="col-progress-started" />
              <col className="col-progress-finished" />
              <col className="col-progress-time" />
              <col className="col-progress-platform" />
              <col className="col-progress-criteria" />
              <col className="col-progress-review" />
              {isAdmin ? <col className="col-progress-actions" /> : null}
            </colgroup>
            <thead>
              <tr>
                <th className="col-progress-number"><SortButton column="ProgressId" current={sortColumn} ascending={sortAscending} onSort={sortBy}>Game Number</SortButton></th>
                <th className="col-progress-status"><SortButton column="Status" current={sortColumn} ascending={sortAscending} onSort={sortBy}>Status</SortButton></th>
                <th className="col-progress-cover">Cover</th>
                <th className="col-progress-title"><SortButton column="GameTitle" current={sortColumn} ascending={sortAscending} onSort={sortBy}>Title</SortButton></th>
                <th className="col-progress-started"><SortButton column="DateStarted" current={sortColumn} ascending={sortAscending} onSort={sortBy}>Started</SortButton></th>
                <th className="col-progress-finished"><SortButton column="DateFinished" current={sortColumn} ascending={sortAscending} onSort={sortBy}>Finished</SortButton></th>
                <th className="col-progress-time"><SortButton column="CompletionTime" current={sortColumn} ascending={sortAscending} onSort={sortBy}>Time</SortButton></th>
                <th className="col-progress-platform"><SortButton column="Platform" current={sortColumn} ascending={sortAscending} onSort={sortBy}>Platform</SortButton></th>
                <th className="col-progress-criteria">Criteria</th>
                <th className="col-progress-review">Review</th>
                {isAdmin ? <th className="col-progress-actions">Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {filtered.map((game) => (
                <tr key={game.progressId} className={game.dateFinished ? "completed" : "in-progress"}>
                  <td className="col-progress-number" data-label="Game Number">{game.progressId}</td>
                  <td className="col-progress-status" data-label="Status"><span className={`status-badge ${game.dateFinished ? "status-completed" : "status-inprogress"}`}>{game.dateFinished ? "Completed" : "In Progress"}</span></td>
                  <td className="cover-cell col-progress-cover" data-label="Cover"><CoverImage src={game.imageUrl} alt={`${game.gameTitle} cover`} /></td>
                  <td className="col-progress-title" data-label="Title"><ProgressTitle game={game} alternateTitles={alternateTitles[String(game.gameId)] ?? []} /></td>
                  <td className="col-progress-started" data-label="Started">{formatDateOnly(game.dateStarted)}</td>
                  <td className="col-progress-finished" data-label="Finished">{game.dateFinished ? formatDateOnly(game.dateFinished) : "-"}</td>
                  <td className="col-progress-time" data-label="Time">{formatCompletionTime(game.completionTime)}</td>
                  <td className="col-progress-platform" data-label="Platform"><span className={`platform-badge platform-${game.platform.toLocaleLowerCase("en-GB")}`}>{game.platform}</span></td>
                  <td className="col-progress-criteria" data-label="Criteria">{game.beatenCriteria ?? "-"}</td>
                  <td className="col-progress-review" data-label="Review">{game.review ?? "-"}</td>
                  {isAdmin ? <td className="col-progress-actions" data-label="Actions"><button className="icon-text-button" onClick={() => openEditModal(game)} aria-label={`Edit ${game.gameTitle}`}><Edit3 />Edit</button></td> : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <Empty>No games in progress found.</Empty>}
      {modalOpen ? (
        <ProgressModal
          progress={editingProgress}
          titles={titleSuggestions}
          onClose={() => {
            setModalOpen(false);
            setEditingProgress(null);
          }}
          onSave={save}
        />
      ) : null}
    </section>
  );
}

function ProgressTitle({ game, alternateTitles }: Readonly<{ game: GameProgressDto; alternateTitles: AlternateTitle[] }>) {
  if (!alternateTitles.length) {
    return <>{game.gameTitle}</>;
  }

  const titles = alternateTitles.map((alternateTitle) => alternateTitle.title).join("\n");
  return (
    <span className="alternate-title-hint" title={titles} aria-label={`${game.gameTitle}. Alternate titles: ${titles.replaceAll("\n", ", ")}`}>
      {game.gameTitle}
    </span>
  );
}

function sortProgress(progress: GameProgressDto[], column: SortColumn, ascending: boolean) {
  return [...progress].sort((left, right) => compareProgress(left, right, column, ascending));
}

function compareProgress(left: GameProgressDto, right: GameProgressDto, column: SortColumn, ascending: boolean) {
  const direction = ascending ? 1 : -1;
  switch (column) {
    case "ProgressId":
      return (left.progressId - right.progressId) * direction;
    case "Status":
      return (Number(!!left.dateFinished) - Number(!!right.dateFinished) || left.gameTitle.localeCompare(right.gameTitle, "en-GB")) * direction;
    case "GameTitle":
      return left.gameTitle.localeCompare(right.gameTitle, "en-GB") * direction;
    case "DateStarted":
      return compareNullable(left.dateStarted, right.dateStarted) * direction;
    case "DateFinished":
      return compareNullableLast(left.dateFinished, right.dateFinished, ascending);
    case "CompletionTime":
      return compareNullableNumberLast(durationSeconds(left.completionTime), durationSeconds(right.completionTime), ascending);
    case "Platform":
      return left.platform.localeCompare(right.platform, "en-GB") * direction;
  }
}

function compareNullableLast(left: string | null | undefined, right: string | null | undefined, ascending: boolean) {
  if (!left && !right) return 0;
  if (!left) return 1;
  if (!right) return -1;
  const comparison = left.localeCompare(right, "en-GB");
  return ascending ? comparison : -comparison;
}

function compareNullableNumberLast(left: number | null, right: number | null, ascending: boolean) {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  const comparison = left - right;
  return ascending ? comparison : -comparison;
}

function durationSeconds(value?: string | null) {
  if (!value) return null;
  const [hours = "0", minutes = "0", seconds = "0"] = value.split(".").at(-1)!.split(":");
  return Number.parseInt(hours, 10) * 3600 + Number.parseInt(minutes, 10) * 60 + Number.parseInt(seconds, 10);
}

function formatCompletionTime(value?: string | null) {
  if (!value) return "-";
  const [hours = "0", minutes = "0", seconds = "0"] = value.split(".").at(-1)!.split(":");
  return `${hours.padStart(2, "0")}:${minutes.padStart(2, "0")}:${seconds.padStart(2, "0")}`;
}
