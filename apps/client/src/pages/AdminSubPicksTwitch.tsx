import type { EventSubReviewItemDto, EventSubStatusDto, EventSubSubscriptionDto } from "@ps2-challenge/shared";
import { AlertTriangle, Radio, RefreshCw } from "lucide-react";
import { useState } from "react";
import { api } from "../api.js";
import { EventSubReviewQueue } from "../components/EventSubReviewQueue.js";
import { ErrorMessage, Loading } from "../components/Status.js";
import { useAsync } from "../hooks.js";

type StatusMessage = { kind: "success" | "error"; message: string };

const subscriptionLabels: Record<string, string> = {
  "channel.subscribe": "New subs",
  "channel.subscription.message": "Resubs shared in chat",
  "channel.subscription.gift": "Gifted subs"
};

const statusLabels: Record<string, string> = {
  enabled: "Active",
  webhook_callback_verification_pending: "Waiting for Twitch to verify",
  webhook_callback_verification_failed: "Twitch couldn't verify the webhook",
  notification_failures_exceeded: "Stopped after too many failed deliveries",
  authorization_revoked: "Access revoked",
  user_removed: "Channel account removed"
};

export function authorisationMessage(result: string | null, channel: string): StatusMessage | null {
  switch (result) {
    case "authorised":
      return { kind: "success", message: "Subscription access authorised. Now create the subscriptions." };
    case "wrong-account":
      return { kind: "error", message: `That Twitch account isn't ${channel}. Log in to Twitch as ${channel} and try again.` };
    case "missing-scope":
      return { kind: "error", message: "Twitch didn't grant subscription access. Try again and accept the permission." };
    case "forbidden":
      return { kind: "error", message: "Only admins can authorise subscription access." };
    case "failed":
      return { kind: "error", message: "Twitch authorisation failed. Try again." };
    default:
      return null;
  }
}

export type ReviewQueueState = { items: EventSubReviewItemDto[]; loading: boolean; error: string | null; reload: () => Promise<void> };

export function TwitchTab({ authorisationResult, review }: Readonly<{ authorisationResult: string | null; review: ReviewQueueState }>) {
  const status = useAsync(() => api.eventSubStatus(), []);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<StatusMessage | null>(null);

  if (status.loading) return <Loading />;
  if (status.error || !status.data) return <ErrorMessage message={status.error ?? "Unable to load the Twitch connection"} />;

  const data = status.data;
  const authorisation = authorisationMessage(authorisationResult, data.channelLogin);
  const revoked = Boolean(data.revokedAt && (!data.authorizedAt || data.revokedAt > data.authorizedAt));

  const sync = async () => {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const result = await api.syncEventSubSubscriptions();
      status.setData(result.status);
      setSyncMessage(syncSummary(result.created, result.removed, result.errors));
    } catch (error) {
      setSyncMessage({ kind: "error", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <>
      <section className="panel" aria-labelledby="twitch-connection-heading">
        <h2 id="twitch-connection-heading"><Radio aria-hidden />Twitch Connection</h2>
        <p className="muted">Twitch sends subs, resubs shared in chat and gifted subs to this site, which turns them into entries automatically.</p>

        {authorisation ? <output className={`status${authorisation.kind === "error" ? " error" : ""}`}>{authorisation.message}</output> : null}
        {revoked ? (
          <div className="status error sub-twitch-alert" role="alert">
            <AlertTriangle aria-hidden />
            Twitch revoked access ({describeStatus(data.revokedReason ?? "revoked")}) on {formatDate(data.revokedAt)}. Authorise again, then create the subscriptions.
          </div>
        ) : null}
        {data.secretConfigured ? null : (
          <div className="status error" role="alert">TWITCH_CLIENT_SECRET isn't set, so the webhook won't accept events. Add it to the app settings and restart.</div>
        )}
        {data.secretChanged ? (
          <div className="status error sub-twitch-alert" role="alert">
            <AlertTriangle aria-hidden />
            The Twitch client secret has changed since the subscriptions were created, so Twitch's messages are being rejected. Click Create or Repair
            Subscriptions to replace them.
          </div>
        ) : null}

        <ConnectionDetails status={data} />

        <ol className="sub-twitch-steps">
          <li>
            <a className="button-link" href="/api/admin/eventsub/authorize">Authorise Subscriptions</a>
            <span className="muted">Log in to Twitch as {data.channelLogin} in this browser first. Your site login won't change.</span>
          </li>
          <li>
            <button type="button" disabled={syncing || !data.secretConfigured} onClick={() => void sync()}>
              <RefreshCw aria-hidden className={syncing ? "spin" : undefined} />{syncing ? "Working..." : "Create or Repair Subscriptions"}
            </button>
            <span className="muted">Creates any that are missing and replaces any that have stopped.</span>
          </li>
        </ol>
        {syncMessage ? <output className={`status${syncMessage.kind === "error" ? " error" : ""}`}>{syncMessage.message}</output> : null}

        <h3>Subscriptions</h3>
        {data.subscriptionsError ? <ErrorMessage message={`Couldn't load subscriptions from Twitch: ${data.subscriptionsError}`} /> : null}
        <div className="table-scroll">
          <table className="data-table sub-twitch-table">
            <thead><tr><th>Event</th><th>Status</th><th>Created</th></tr></thead>
            <tbody>
              {Object.entries(subscriptionLabels).map(([type, label]) => (
                <SubscriptionRow key={type} label={label} subscription={bestSubscription(data, type)} />
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <EventSubReviewQueue items={review.items} loading={review.loading} error={review.error} onChanged={review.reload} />
    </>
  );
}

function ConnectionDetails({ status }: Readonly<{ status: EventSubStatusDto }>) {
  const channel = status.broadcasterUserId ? `${status.channelLogin} (Twitch ID ${status.broadcasterUserId})` : `${status.channelLogin} (not found on Twitch)`;
  const authorised = status.authorizedAt ? `${formatDate(status.authorizedAt)} by ${status.authorizedBy ?? "an admin"}` : "Not yet";
  return (
    <dl className="sub-twitch-details">
      <div><dt>Channel</dt><dd>{channel}</dd></div>
      <div><dt>Webhook</dt><dd><code>{status.callbackUrl}</code></dd></div>
      <div><dt>Authorised</dt><dd>{authorised}</dd></div>
    </dl>
  );
}

function SubscriptionRow({ label, subscription }: Readonly<{ label: string; subscription: EventSubSubscriptionDto | undefined }>) {
  if (!subscription) {
    return (
      <tr>
        <td data-label="Event">{label}</td>
        <td data-label="Status"><span className="badge status-inprogress">Missing</span></td>
        <td data-label="Created">-</td>
      </tr>
    );
  }
  return (
    <tr>
      <td data-label="Event">{label}</td>
      <td data-label="Status">
        <span className={`badge ${subscription.healthy ? "status-completed" : "status-inprogress"}`}>{describeStatus(subscription.status)}</span>
        {subscription.healthy || !subscription.callback ? null : <small className="muted"> Points at {subscription.callback}</small>}
      </td>
      <td data-label="Created">{subscription.createdAt ? formatDate(subscription.createdAt) : "-"}</td>
    </tr>
  );
}

function bestSubscription(status: EventSubStatusDto, type: string): EventSubSubscriptionDto | undefined {
  const matches = status.subscriptions.filter((subscription) => subscription.type === type);
  return matches.find((subscription) => subscription.healthy) ?? matches[0];
}

function syncSummary(created: string[], removed: number, errors: string[]): StatusMessage {
  if (errors.length) {
    return { kind: "error", message: errors.join(" ") };
  }
  if (!created.length && !removed) {
    return { kind: "success", message: "All three subscriptions are already in place." };
  }
  const parts = [created.length ? `created ${created.length}` : null, removed ? `replaced ${removed} that had stopped` : null].filter(Boolean).join(", ");
  return { kind: "success", message: `${parts.charAt(0).toUpperCase()}${parts.slice(1)}. Twitch verifies new ones within a few seconds; refresh to check.` };
}

function describeStatus(status: string): string {
  return statusLabels[status] ?? status.replaceAll("_", " ");
}

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleString() : "";
}
