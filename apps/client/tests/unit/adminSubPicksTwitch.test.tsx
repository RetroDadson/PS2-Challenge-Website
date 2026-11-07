import type { EventSubStatusDto } from "@ps2-challenge/shared";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminSubPicks } from "../../src/pages/AdminSubPicks.js";
import { authorisationMessage, TwitchTab } from "../../src/pages/AdminSubPicksTwitch.js";
import { mockFetch } from "./subPickFixtures.js";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  globalThis.history.pushState({}, "", "/");
});

const callback = "https://ps2.example/api/eventsub/webhook";
const emptyReview = { items: [], loading: false, error: null, reload: async () => undefined };

function status(overrides: Partial<EventSubStatusDto> = {}): EventSubStatusDto {
  return {
    secretConfigured: true,
    secretChanged: false,
    channelLogin: "retrodadson",
    broadcasterUserId: "500",
    callbackUrl: callback,
    authorizedAt: null,
    authorizedBy: null,
    revokedAt: null,
    revokedReason: null,
    subscriptions: [],
    missingTypes: ["channel.subscribe", "channel.subscription.message", "channel.subscription.gift"],
    subscriptionsError: null,
    ...overrides
  };
}

function subscription(type: string, statusValue = "enabled", healthy = true, callbackUrl: string | null = callback) {
  return { id: `${type}-id`, type, status: statusValue, callback: callbackUrl, createdAt: "2026-11-07T12:00:00.000Z", healthy };
}

describe("Twitch connection tab", () => {
  it("maps every authorisation result to a message", () => {
    expect(authorisationMessage("authorised", "retrodadson")).toEqual({ kind: "success", message: "Subscription access authorised. Now create the subscriptions." });
    expect(authorisationMessage("wrong-account", "retrodadson")?.message).toBe("That Twitch account isn't retrodadson. Log in to Twitch as retrodadson and try again.");
    expect(authorisationMessage("missing-scope", "retrodadson")?.kind).toBe("error");
    expect(authorisationMessage("forbidden", "retrodadson")?.message).toMatch(/Only admins/);
    expect(authorisationMessage("failed", "retrodadson")?.message).toMatch(/failed/);
    expect(authorisationMessage(null, "retrodadson")).toBeNull();
    expect(authorisationMessage("something-else", "retrodadson")).toBeNull();
  });

  it("walks through authorising and creating the subscriptions", async () => {
    const synced = status({
      subscriptions: [
        subscription("channel.subscribe", "webhook_callback_verification_pending"),
        subscription("channel.subscription.message"),
        subscription("channel.subscription.gift")
      ],
      missingTypes: []
    });
    const calls = mockFetch({
      "GET /api/admin/eventsub/status": status(),
      "POST /api/admin/eventsub/subscriptions": { created: ["channel.subscribe", "channel.subscription.message", "channel.subscription.gift"], removed: 0, errors: [], status: synced }
    });
    render(<TwitchTab review={emptyReview} authorisationResult="authorised" />);

    expect(await screen.findByText("Subscription access authorised. Now create the subscriptions.")).toBeInTheDocument();
    expect(screen.getByText("retrodadson (Twitch ID 500)")).toBeInTheDocument();
    expect(screen.getByText(callback)).toBeInTheDocument();
    expect(screen.getByText("Not yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Authorise Subscriptions" })).toHaveAttribute("href", "/api/admin/eventsub/authorize");
    expect(screen.getAllByText("Missing")).toHaveLength(3);

    fireEvent.click(screen.getByRole("button", { name: "Create or Repair Subscriptions" }));
    expect(await screen.findByText(/Created 3\. Twitch verifies new ones/)).toBeInTheDocument();
    expect(calls).toContainEqual({ key: "POST /api/admin/eventsub/subscriptions", body: {} });
    const rows = screen.getAllByRole("row").slice(1);
    expect(within(rows[0]!).getByText("Waiting for Twitch to verify")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("Active")).toBeInTheDocument();
    expect(screen.queryByText("Missing")).not.toBeInTheDocument();
  });

  it("reports repairs, existing subscriptions and errors", async () => {
    const authorised = status({ authorizedAt: "2026-11-07T12:00:00.000Z", authorizedBy: "StreamAdmin" });
    mockFetch({
      "GET /api/admin/eventsub/status": authorised,
      "POST /api/admin/eventsub/subscriptions": { created: ["channel.subscribe"], removed: 1, errors: [], status: authorised }
    });
    const { unmount } = render(<TwitchTab review={emptyReview} authorisationResult={null} />);
    expect(await screen.findByText(/by StreamAdmin/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Create or Repair Subscriptions" }));
    expect(await screen.findByText(/Created 1, replaced 1 that had stopped\./)).toBeInTheDocument();
    unmount();

    mockFetch({ "GET /api/admin/eventsub/status": authorised, "POST /api/admin/eventsub/subscriptions": { created: [], removed: 2, errors: [], status: authorised } });
    const second = render(<TwitchTab review={emptyReview} authorisationResult={null} />);
    fireEvent.click(await screen.findByRole("button", { name: "Create or Repair Subscriptions" }));
    expect(await screen.findByText(/^Replaced 2 that had stopped\./)).toBeInTheDocument();
    second.unmount();

    mockFetch({ "GET /api/admin/eventsub/status": authorised, "POST /api/admin/eventsub/subscriptions": { created: [], removed: 0, errors: [], status: authorised } });
    const third = render(<TwitchTab review={emptyReview} authorisationResult={null} />);
    fireEvent.click(await screen.findByRole("button", { name: "Create or Repair Subscriptions" }));
    expect(await screen.findByText("All three subscriptions are already in place.")).toBeInTheDocument();
    third.unmount();

    mockFetch({
      "GET /api/admin/eventsub/status": authorised,
      "POST /api/admin/eventsub/subscriptions": { created: [], removed: 0, errors: ["channel.subscribe: the channel hasn't authorised subscription access yet"], status: authorised }
    });
    const fourth = render(<TwitchTab review={emptyReview} authorisationResult={null} />);
    fireEvent.click(await screen.findByRole("button", { name: "Create or Repair Subscriptions" }));
    expect(await screen.findByText("channel.subscribe: the channel hasn't authorised subscription access yet")).toBeInTheDocument();
    fourth.unmount();

    mockFetch({ "GET /api/admin/eventsub/status": authorised, "POST /api/admin/eventsub/subscriptions": [502, { message: "Twitch API request failed: 500" }] });
    render(<TwitchTab review={emptyReview} authorisationResult={null} />);
    fireEvent.click(await screen.findByRole("button", { name: "Create or Repair Subscriptions" }));
    expect(await screen.findByText("Twitch API request failed: 500")).toBeInTheDocument();
  });

  it("warns about revoked access, a missing secret and unreachable Twitch", async () => {
    mockFetch({
      "GET /api/admin/eventsub/status": status({
        secretConfigured: false,
        broadcasterUserId: null,
        authorizedAt: "2026-11-01T12:00:00.000Z",
        revokedAt: "2026-11-05T12:00:00.000Z",
        revokedReason: "authorization_revoked",
        subscriptionsError: "Twitch API request failed: 500",
        subscriptions: [subscription("channel.subscribe", "notification_failures_exceeded", false, "https://old.example/api/eventsub/webhook"), subscription("channel.subscription.gift", "some_new_state", false, null)]
      })
    });
    render(<TwitchTab review={emptyReview} authorisationResult="wrong-account" />);

    expect(await screen.findByText(/That Twitch account isn't retrodadson/)).toBeInTheDocument();
    const alerts = screen.getAllByRole("alert");
    expect(alerts[0]).toHaveTextContent("Twitch revoked access (Access revoked)");
    expect(alerts[1]).toHaveTextContent("TWITCH_CLIENT_SECRET isn't set");
    expect(screen.getByRole("button", { name: "Create or Repair Subscriptions" })).toBeDisabled();
    expect(screen.getByText("retrodadson (not found on Twitch)")).toBeInTheDocument();
    expect(screen.getByText("Couldn't load subscriptions from Twitch: Twitch API request failed: 500")).toBeInTheDocument();
    expect(screen.getByText("Stopped after too many failed deliveries")).toBeInTheDocument();
    expect(screen.getByText(/Points at https:\/\/old\.example/)).toBeInTheDocument();
    expect(screen.getByText("some new state")).toBeInTheDocument();
  });

  it("hides the revoked warning once access has been authorised again, and shows load errors", async () => {
    mockFetch({ "GET /api/admin/eventsub/status": status({ authorizedAt: "2026-11-06T12:00:00.000Z", revokedAt: "2026-11-05T12:00:00.000Z", revokedReason: "user_removed" }) });
    const { unmount } = render(<TwitchTab review={emptyReview} authorisationResult={null} />);
    expect(await screen.findByText("Twitch Connection")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    unmount();

    mockFetch({ "GET /api/admin/eventsub/status": [500, { message: "Status failed" }] });
    render(<TwitchTab review={emptyReview} authorisationResult={null} />);
    expect(await screen.findByText("Status failed")).toBeInTheDocument();
  });

  it("opens on the Twitch tab when Twitch sends the admin back", async () => {
    globalThis.history.pushState({}, "", "/admin/sub-picks?tab=twitch&eventsub=missing-scope");
    mockFetch({
      "GET /api/admin/sub-picks/settings": { tier1Entries: 1, tier2Entries: 2, tier3Entries: 5, spinDurationSeconds: 10, overlayMessage: "Sub!" },
      "GET /api/admin/eventsub/status": status()
    });
    render(<AdminSubPicks />);
    expect(await screen.findByRole("tab", { name: "Twitch", selected: true })).toBeInTheDocument();
    expect(await screen.findByText(/Twitch didn't grant subscription access/)).toBeInTheDocument();
  });
});
