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
