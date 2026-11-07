import type { EventSubReviewItemDto, TwitchUserLookupDto } from "@ps2-challenge/shared";
import { Inbox } from "lucide-react";
import { useId, useState } from "react";
import { api } from "../api.js";
import { Empty, ErrorMessage, Loading } from "./Status.js";

const eventLabels: Record<string, string> = {
  "channel.subscribe": "New sub",
  "channel.subscription.message": "Resub",
  "channel.subscription.gift": "Gifted subs"
};

const tierLabels: Record<string, string> = { "1000": "Tier 1", "2000": "Tier 2", "3000": "Tier 3" };

export function EventSubReviewQueue({
  items,
  loading,
  error,
  onChanged
}: Readonly<{ items: EventSubReviewItemDto[]; loading: boolean; error: string | null; onChanged: () => Promise<void> }>) {
  return (
    <section className="panel" aria-labelledby="eventsub-review-heading">
      <header className="section-header">
        <h2 id="eventsub-review-heading"><Inbox aria-hidden />Review Queue</h2>
        <span className="muted">{items.length} {items.length === 1 ? "event" : "events"}</span>
      </header>
      <p className="muted">Anonymous gifts and Twitch events that couldn't be processed wait here. Nothing in this list has created entries yet.</p>
      {loading ? <Loading /> : null}
      {error ? <ErrorMessage message={error} /> : null}
      {!loading && !error && items.length === 0 ? <Empty>Nothing to review.</Empty> : null}
      <ul className="sub-entry-list">
        {items.map((item) => (
          <ReviewItem key={item.messageId} item={item} onChanged={onChanged} />
        ))}
      </ul>
    </section>
  );
}

function ReviewItem({ item, onChanged }: Readonly<{ item: EventSubReviewItemDto; onChanged: () => Promise<void> }>) {
  const [assigning, setAssigning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canAssign = item.status === "needs_review" && item.subscriptionType === "channel.subscription.gift";
  const label = describe(item);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      await onChanged();
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : String(error_));
    } finally {
      setBusy(false);
    }
  };

  const dismiss = async () => {
    if (!globalThis.confirm(`Dismiss "${label}" without creating any entries?`)) return;
    await run(() => api.dismissEventSubReview(item.messageId));
  };

  return (
    <li className="sub-entry" aria-label={label}>
      <div className="sub-entry-summary">
        <span className={`badge ${item.status === "failed" ? "status-inprogress" : "included-badge"}`}>{item.status === "failed" ? "Failed" : "Needs review"}</span>
        <strong>{label}</strong>
        <span className="muted">{new Date(item.receivedAt).toLocaleString()}</span>
        {item.reason && item.status === "failed" ? <span className="muted">{item.reason}</span> : null}
        <span className="sub-review-actions">
          {canAssign && !assigning ? <button type="button" disabled={busy} onClick={() => setAssigning(true)}>Give to a Viewer</button> : null}
          {item.status === "failed" ? <button type="button" className="secondary" disabled={busy} onClick={() => void run(() => api.retryEventSubReview(item.messageId))}>Retry</button> : null}
          <button type="button" className="secondary" disabled={busy} onClick={() => void dismiss()}>Dismiss</button>
        </span>
      </div>
      {assigning ? (
        <AssignViewer
          busy={busy}
          onCancel={() => setAssigning(false)}
          onAssign={(viewer) => void run(() => api.assignEventSubReview(item.messageId, { twitchUserId: viewer.twitchUserId, twitchLogin: viewer.login, twitchDisplayName: viewer.displayName }))}
        />
      ) : null}
      {error ? <div className="status error" role="alert">{error}</div> : null}
    </li>
  );
}

function AssignViewer({ busy, onAssign, onCancel }: Readonly<{ busy: boolean; onAssign: (viewer: TwitchUserLookupDto) => void; onCancel: () => void }>) {
  const id = useId();
  const [login, setLogin] = useState("");
  const [viewer, setViewer] = useState<TwitchUserLookupDto | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [looking, setLooking] = useState(false);

  const lookup = async () => {
    setLooking(true);
    setLookupError(null);
    setViewer(null);
    try {
      setViewer(await api.lookupTwitchUser(login.trim()));
    } catch (error) {
      setLookupError(error instanceof Error ? error.message : String(error));
    } finally {
      setLooking(false);
    }
  };

  return (
    <div className="sub-review-assign">
      <label htmlFor={`${id}-login`}>Twitch username</label>
      <input id={`${id}-login`} value={login} autoComplete="off" onChange={(event) => { setLogin(event.target.value); setViewer(null); }} />
      <button type="button" className="secondary" disabled={looking || !login.trim()} onClick={() => void lookup()}>Look Up</button>
      {viewer ? (
        <button type="button" disabled={busy} onClick={() => onAssign(viewer)}>Give to {viewer.displayName}</button>
      ) : null}
      <button type="button" className="secondary" disabled={busy} onClick={onCancel}>Cancel</button>
      {lookupError ? <div className="status error" role="alert">{lookupError}</div> : null}
    </div>
  );
}

function describe(item: EventSubReviewItemDto): string {
  const tier = item.tier ? tierLabels[item.tier] ?? `Tier ${item.tier}` : null;
  if (item.status === "needs_review" && item.subscriptionType === "channel.subscription.gift") {
    const count = item.total ?? 1;
    return `Anonymous gift of ${count} ${tier ?? ""} ${count === 1 ? "sub" : "subs"}`.replaceAll(/\s+/g, " ");
  }
  const event = eventLabels[item.subscriptionType] ?? item.subscriptionType;
  return [event, item.twitchDisplayName ? `from ${item.twitchDisplayName}` : null, tier ? `(${tier})` : null].filter(Boolean).join(" ");
}
