import { Dices, Skull } from "lucide-react";
import { api } from "../api.js";
import { useAsync, useRealtime } from "../hooks.js";
import { useEffect, useMemo, useState } from "react";

export function BlankOverlay() {
  return <div className="stream-overlay blank-overlay-frame" />;
}

export function VotesOverlay() {
  const votes = useAsync(() => api.currentVotes(), []);
  useRealtime("/votesHub", () => void votes.reload());
  const orderedVotes = useMemo(
    () =>
      [...(votes.data ?? [])].sort(
        (left, right) => left.gameNumber - right.gameNumber || right.voteCount - left.voteCount || left.gameTitle.localeCompare(right.gameTitle, "en-GB")
      ),
    [votes.data]
  );

  return (
    <div className="stream-overlay votes-overlay-frame">
      {votes.loading ? <OverlayMessage>Loading...</OverlayMessage> : null}
      {votes.error ? <OverlayMessage>Error loading votes</OverlayMessage> : null}
      {!votes.loading && !votes.error && orderedVotes.length === 0 ? <OverlayMessage>No current votes</OverlayMessage> : null}
      {!votes.loading && !votes.error && orderedVotes.length > 0
        ? orderedVotes.map((vote) => (
            <div className="vote-game-box" key={`${vote.gameNumber}-${vote.gameId}-${vote.gameTitle}`}>
              <div className="vote-game-title">{vote.gameTitle}</div>
              <div className="vote-game-number">Game {vote.gameNumber}: {vote.voteCount}</div>
            </div>
          ))
        : null}
    </div>
  );
}

export function VoteCoversOverlay() {
  const votes = useAsync(() => api.currentVotes(), []);
  const games = useAsync(() => api.games(), []);
  useRealtime("/votesHub", () => void votes.reload());
  useRealtime("/gamesHub", () => void games.reload());
  const coverUrls = useMemo(() => {
    const gameMap = new Map((games.data ?? []).map((game) => [game.id, game]));
    return [...(votes.data ?? [])]
      .sort((left, right) => left.gameNumber - right.gameNumber)
      .map((vote) => gameMap.get(vote.gameId)?.imageUrl)
      .filter((url): url is string => !!url);
  }, [games.data, votes.data]);
  const currentCoverIndex = useCyclingIndex(coverUrls.length, 2000);
  const loading = votes.loading || games.loading;
  const error = votes.error || games.error;

  return (
    <div className="stream-overlay vote-covers-overlay-frame">
      {loading ? <OverlayMessage>Loading...</OverlayMessage> : null}
      {error ? <OverlayMessage>Error loading covers</OverlayMessage> : null}
      {!loading && !error && coverUrls.length === 0 ? <OverlayMessage>No cover images available</OverlayMessage> : null}
      {!loading && !error
        ? coverUrls.map((url, index) => (
            <img
              alt={`Game cover ${index + 1}`}
              className={`vote-cover-image ${index === currentCoverIndex ? "active" : ""}`}
              key={url}
              src={url}
            />
          ))
        : null}
    </div>
  );
}

export function ProgressOverlay() {
  const progress = useAsync(() => api.progress(), []);
  const games = useAsync(() => api.games(), []);
  useRealtime("/gamesHub", () => void progress.reload());
  useRealtime("/gamesHub", () => void games.reload());

  const gamesInChallengeCount = (games.data ?? []).filter((game) => !game.isExcluded).length;
  const gamesCompletedCount = (progress.data ?? []).filter((game) => !!game.dateFinished).length;
  const percentageComplete = gamesInChallengeCount > 0 ? (gamesCompletedCount / gamesInChallengeCount) * 100 : 0;
  const loading = progress.loading || games.loading;
  const error = progress.error || games.error;

  return (
    <div className="stream-overlay progress-overlay-frame">
      {loading ? <OverlayMessage>Loading...</OverlayMessage> : null}
      {error ? <OverlayMessage>Error loading progress</OverlayMessage> : null}
      {!loading && !error ? (
        <div className="progress-overlay-box">
          <div className="progress-overlay-label">Games Completed</div>
          <div className="progress-overlay-count">{gamesCompletedCount} / {gamesInChallengeCount}</div>
          <div className="progress-overlay-percentage">{percentageComplete.toFixed(2)}%</div>
        </div>
      ) : null}
    </div>
  );
}

export function DeathCounterOverlay() {
  const counter = useAsync(() => api.currentDeathCounter(), []);
  useRealtime("/gamesHub", () => void counter.reload());

  return (
    <div className="stream-overlay death-overlay-frame">
      {counter.loading ? <OverlayMessage>Loading...</OverlayMessage> : null}
      {counter.error ? <OverlayMessage>Error loading death counter</OverlayMessage> : null}
      {!counter.loading && !counter.error && !counter.data ? <OverlayMessage>No game in progress</OverlayMessage> : null}
      {!counter.loading && !counter.error && counter.data ? (
        <div className="death-overlay-badge">
          <Skull className="death-overlay-icon" aria-hidden="true" />
          <span className="visually-hidden">{counter.data.deathLabel}</span>
          <span className="death-overlay-count" data-testid="death-overlay-count">{counter.data.deaths}</span>
        </div>
      ) : null}
    </div>
  );
}

export function SubPicksOverlay() {
  const summary = useAsync(() => api.subPicksSummary(), []);
  const reload = () => void summary.reload();
  useRealtime("/subPicksHub", reload);
  useRealtime("/gamesHub", reload);
  const timer = useMemo(() => overlayTimer(globalThis.location.search), []);
  const visible = useShowHideTimer(timer);
  const data = summary.data;
  const topPick = data?.nextDrawPool.games[0];

  return (
    <div className={`stream-overlay sub-picks-overlay-frame${visible ? "" : " is-hidden"}`} aria-hidden={!visible} data-testid="sub-picks-overlay">
      {summary.loading ? <OverlayMessage>Loading...</OverlayMessage> : null}
      {summary.error ? <OverlayMessage>Error loading sub picks</OverlayMessage> : null}
      {data ? (
        <div className="sub-picks-overlay-box">
          <div className="sub-picks-overlay-heading"><Dices aria-hidden="true" />Sub Picks</div>
          <p className="sub-picks-overlay-message">{data.overlayMessage}</p>
          <div className="sub-picks-overlay-stats">
            <OverlayStat
              label={`Next ${data.schedule.nextDrawKind} draw`}
              value={`Game ${data.schedule.nextDrawGameNumber}`}
              detail={gamesToGo(data.schedule.gamesUntilNextDraw)}
            />
            <OverlayStat label="On the wheel" value={String(data.nextDrawPool.totalEntries)} detail={data.nextDrawPool.totalEntries === 1 ? "entry" : "entries"} />
            <OverlayStat
              label="Top pick"
              value={topPick?.gameTitle ?? "No picks yet"}
              detail={topPick ? entriesLabel(topPick.entries) : "Sub to add one"}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

export type OverlayTimer = { showMs: number; everyMs: number; alwaysVisible: boolean };

export function overlayTimer(search: string): OverlayTimer {
  const params = new URLSearchParams(search);
  const show = secondsParam(params, "show") || 20;
  const every = secondsParam(params, "every") ?? 900;
  const timed = params.has("show") || params.has("every");
  return { showMs: show * 1000, everyMs: every * 1000, alwaysVisible: !timed || every === 0 || every <= show };
}

function secondsParam(params: URLSearchParams, name: string): number | null {
  const raw = params.get(name);
  const value = Number(raw);
  return raw !== null && raw.trim() !== "" && Number.isFinite(value) && value >= 0 ? value : null;
}

function useShowHideTimer({ showMs, everyMs, alwaysVisible }: OverlayTimer) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    setVisible(true);
    if (alwaysVisible) {
      return undefined;
    }
    let hideTimeout = globalThis.setTimeout(() => setVisible(false), showMs);
    const cycle = globalThis.setInterval(() => {
      setVisible(true);
      globalThis.clearTimeout(hideTimeout);
      hideTimeout = globalThis.setTimeout(() => setVisible(false), showMs);
    }, everyMs);
    return () => {
      globalThis.clearInterval(cycle);
      globalThis.clearTimeout(hideTimeout);
    };
  }, [alwaysVisible, everyMs, showMs]);

  return visible;
}

function entriesLabel(count: number): string {
  return count === 1 ? "1 entry" : `${count} entries`;
}

function gamesToGo(games: number): string {
  if (games === 0) return "Next game!";
  return games === 1 ? "1 game to go" : `${games} games to go`;
}

function OverlayStat({ label, value, detail }: Readonly<{ label: string; value: string; detail: string }>) {
  return (
    <div className="sub-picks-overlay-stat">
      <span className="sub-picks-overlay-stat-label">{label}</span>
      <strong className="sub-picks-overlay-stat-value">{value}</strong>
      <span className="sub-picks-overlay-stat-detail">{detail}</span>
    </div>
  );
}

function OverlayMessage({ children }: Readonly<{ children: string }>) {
  return <div className="overlay-message">{children}</div>;
}

function useCyclingIndex(length: number, durationMs: number) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
    if (length <= 1) {
      return undefined;
    }

    const interval = globalThis.setInterval(() => {
      setIndex((current) => (current + 1) % length);
    }, durationMs);

    return () => globalThis.clearInterval(interval);
  }, [durationMs, length]);

  return Math.min(index, Math.max(0, length - 1));
}
