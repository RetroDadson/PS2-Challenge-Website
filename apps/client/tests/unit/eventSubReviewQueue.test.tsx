import type { EventSubReviewItemDto } from "@ps2-challenge/shared";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EventSubReviewQueue } from "../../src/components/EventSubReviewQueue.js";
import { AdminSubPicks } from "../../src/pages/AdminSubPicks.js";
import { mockFetch } from "./subPickFixtures.js";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const anonymousGift: EventSubReviewItemDto = {
  messageId: "anon-1",
  subscriptionType: "channel.subscription.gift",
  status: "needs_review",
  reason: "Anonymous gift of 5 subs",
  receivedAt: "2026-11-07T12:00:00.000Z",
  tier: "1000",
  total: 5,
  twitchDisplayName: null
};

const failedSub: EventSubReviewItemDto = {
  messageId: "broken-1",
  subscriptionType: "channel.subscribe",
  status: "failed",
  reason: "Unknown subscription tier 9000",
  receivedAt: "2026-11-07T12:05:00.000Z",
  tier: "9000",
  total: null,
  twitchDisplayName: "ViewerOne"
};

describe("EventSub review queue", () => {
  it("describes queued events and gives an anonymous gift to a looked-up viewer", async () => {
    const onChanged = vi.fn(async () => undefined);
    const calls = mockFetch({
      "POST /api/admin/sub-picks/twitch-lookup": { twitchUserId: "1001", login: "viewerone", displayName: "ViewerOne", profileImageUrl: null },
      "POST /api/admin/eventsub/review/anon-1/assign": { messageId: "anon-1", status: "resolved", grantId: 7, error: null }
    });
    render(<EventSubReviewQueue items={[anonymousGift, failedSub]} loading={false} error={null} onChanged={onChanged} />);

    expect(screen.getByText("2 events")).toBeInTheDocument();
    const gift = screen.getByRole("listitem", { name: "Anonymous gift of 5 Tier 1 subs" });
    expect(within(gift).getByText("Needs review")).toBeInTheDocument();
    expect(within(gift).queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
    const failed = screen.getByRole("listitem", { name: "New sub from ViewerOne (Tier 9000)" });
    expect(within(failed).getByText("Unknown subscription tier 9000")).toBeInTheDocument();
    expect(within(failed).queryByRole("button", { name: "Give to a Viewer" })).not.toBeInTheDocument();

    fireEvent.click(within(gift).getByRole("button", { name: "Give to a Viewer" }));
    fireEvent.change(within(gift).getByLabelText("Twitch username"), { target: { value: " ViewerOne " } });
    fireEvent.click(within(gift).getByRole("button", { name: "Look Up" }));
    fireEvent.click(await within(gift).findByRole("button", { name: "Give to ViewerOne" }));

    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(calls).toContainEqual({ key: "POST /api/admin/sub-picks/twitch-lookup", body: { login: "ViewerOne" } });
    expect(calls).toContainEqual({
      key: "POST /api/admin/eventsub/review/anon-1/assign",
      body: { twitchUserId: "1001", twitchLogin: "viewerone", twitchDisplayName: "ViewerOne" }
    });
  });

  it("retries, dismisses after confirming and shows errors", async () => {
    const onChanged = vi.fn(async () => undefined);
    const calls = mockFetch({
      "POST /api/admin/eventsub/review/broken-1/retry": [409, { message: "Only failed events can be retried" }],
      "POST /api/admin/eventsub/review/broken-1/dismiss": { messageId: "broken-1", status: "dismissed", grantId: null, error: null },
      "POST /api/admin/sub-picks/twitch-lookup": [404, { message: "No Twitch user called 'nobody'" }]
    });
    const confirm = vi.spyOn(globalThis, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    render(<EventSubReviewQueue items={[failedSub, anonymousGift]} loading={false} error={null} onChanged={onChanged} />);

    const failed = screen.getByRole("listitem", { name: "New sub from ViewerOne (Tier 9000)" });
    fireEvent.click(within(failed).getByRole("button", { name: "Retry" }));
    expect(await within(failed).findByRole("alert")).toHaveTextContent("Only failed events can be retried");

    fireEvent.click(within(failed).getByRole("button", { name: "Dismiss" }));
    expect(confirm).toHaveBeenCalledWith('Dismiss "New sub from ViewerOne (Tier 9000)" without creating any entries?');
    expect(calls.some((call) => call.key.endsWith("/dismiss"))).toBe(false);
    fireEvent.click(within(failed).getByRole("button", { name: "Dismiss" }));
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));

    const gift = screen.getByRole("listitem", { name: "Anonymous gift of 5 Tier 1 subs" });
    fireEvent.click(within(gift).getByRole("button", { name: "Give to a Viewer" }));
    fireEvent.change(within(gift).getByLabelText("Twitch username"), { target: { value: "nobody" } });
    fireEvent.click(within(gift).getByRole("button", { name: "Look Up" }));
    expect(await within(gift).findByText("No Twitch user called 'nobody'")).toBeInTheDocument();
    fireEvent.click(within(gift).getByRole("button", { name: "Cancel" }));
    expect(within(gift).queryByLabelText("Twitch username")).not.toBeInTheDocument();
  });

  it("shows loading, empty and error states and falls back for unknown events", () => {
    const { rerender } = render(<EventSubReviewQueue items={[]} loading error={null} onChanged={vi.fn()} />);
    expect(screen.getByText("Loading...")).toBeInTheDocument();
    rerender(<EventSubReviewQueue items={[]} loading={false} error={null} onChanged={vi.fn()} />);
    expect(screen.getByText("Nothing to review.")).toBeInTheDocument();
    rerender(<EventSubReviewQueue items={[]} loading={false} error="Queue failed" onChanged={vi.fn()} />);
    expect(screen.getByText("Queue failed")).toBeInTheDocument();
    rerender(
      <EventSubReviewQueue
        items={[
          { ...failedSub, messageId: "x", subscriptionType: "channel.unknown", tier: null, twitchDisplayName: null },
          { ...anonymousGift, messageId: "y", total: null, tier: null }
        ]}
        loading={false}
        error={null}
        onChanged={vi.fn()}
      />
    );
    expect(screen.getByText("2 events")).toBeInTheDocument();
    expect(screen.getByRole("listitem", { name: "channel.unknown" })).toBeInTheDocument();
    expect(screen.getByRole("listitem", { name: "Anonymous gift of 1 sub" })).toBeInTheDocument();
  });

  it("shows how many events are waiting on the Twitch tab", async () => {
    mockFetch({
      "GET /api/admin/sub-picks/settings": { tier1Entries: 1, tier2Entries: 2, tier3Entries: 5, spinDurationSeconds: 10, overlayMessage: "Sub!" },
      "GET /api/admin/eventsub/review": [anonymousGift, failedSub],
      "GET /api/admin/sub-picks/grants": [],
      "GET /api/sub-picks/eligible-games": [],
      "GET /api/sub-picks/summary": [500, {}]
    });
    render(<AdminSubPicks />);
    expect(await screen.findByRole("tab", { name: "Twitch (2 to review)" })).toBeInTheDocument();
  });
});
