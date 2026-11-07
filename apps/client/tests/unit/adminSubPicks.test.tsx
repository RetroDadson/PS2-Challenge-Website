import type { SubGrantDto, SubPickSettingsDto } from "@ps2-challenge/shared";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminSubPicks } from "../../src/pages/AdminSubPicks.js";
import { entry, mockFetch } from "./subPickFixtures.js";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const settings: SubPickSettingsDto = { tier1Entries: 1, tier2Entries: 2, tier3Entries: 5, spinDurationSeconds: 10, overlayMessage: "Sub to add a game." };
const games = [
  { id: 1, title: "Amplitude", imageUrl: null },
  { id: 3, title: "Frequency", imageUrl: null }
];
const summary = {
  schedule: { nextGameNumber: 51, nextDrawGameNumber: 60, nextDrawKind: "10s", gamesUntilNextDraw: 9, nextHundredDrawGameNumber: 100, gamesUntilNextHundredDraw: 49 },
  nextDrawPool: { totalEntries: 15, games: [] },
  tensPool: { totalEntries: 15, games: [] },
  hundredsPool: { totalEntries: 4, games: [] },
  overlayMessage: "Sub to add a game.",
  tierEntries: { tier1: 1, tier2: 2, tier3: 5 }
};

describe("AdminSubPicks", () => {
  it("denies non-admins", async () => {
    mockFetch({ "GET /api/admin/sub-picks/settings": [403, {}] });
    render(<AdminSubPicks />);
    expect(await screen.findByRole("heading", { name: "Access Denied" })).toBeInTheDocument();
  });

  it("shows settings load errors", async () => {
    mockFetch({ "GET /api/admin/sub-picks/settings": [500, { message: "Settings failed" }] });
    render(<AdminSubPicks />);
    expect(await screen.findByText("Settings failed")).toBeInTheDocument();
  });

  it("looks up a viewer and adds entries using the calculated tier value", async () => {
    let grants: SubGrantDto[] = [];
    const calls = mockFetch({
      "GET /api/admin/sub-picks/settings": settings,
      "GET /api/admin/sub-picks/grants": () => grants,
      "GET /api/sub-picks/eligible-games": games,
      "GET /api/sub-picks/summary": summary,
      "POST /api/admin/sub-picks/twitch-lookup": { twitchUserId: "1001", login: "viewerone", displayName: "ViewerOne", profileImageUrl: null },
      "POST /api/admin/sub-picks/grants": (body: Partial<SubGrantDto>) => {
        grants = [grant({ ...body, entryCount: 15, entries: [] })];
        return grants[0];
      }
    });
    render(<AdminSubPicks />);

    expect(await screen.findByText("No entries yet.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Twitch username")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add Entries" }));
    expect(screen.getByRole("button", { name: "Save Entries" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Twitch username"), { target: { value: " ViewerOne " } });
    fireEvent.click(screen.getByRole("button", { name: "Look Up" }));
    expect(await screen.findByText("Found ViewerOne (Twitch ID 1001)")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Tier"), { target: { value: "3000" } });
    fireEvent.change(screen.getByLabelText("Type"), { target: { value: "gift" } });
    fireEvent.change(screen.getByLabelText("Subs gifted"), { target: { value: "3" } });
    expect(screen.getByLabelText("Number of entries")).toHaveValue(15);
    fireEvent.change(screen.getByLabelText("Notes"), { target: { value: "Community gift" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Entries" }));

    expect(await screen.findByText("Added 15 entries for ViewerOne")).toBeInTheDocument();
    expect(calls).toContainEqual({ key: "POST /api/admin/sub-picks/twitch-lookup", body: { login: "ViewerOne" } });
    expect(calls).toContainEqual({
      key: "POST /api/admin/sub-picks/grants",
      body: { twitchUserId: "1001", twitchLogin: "viewerone", twitchDisplayName: "ViewerOne", tier: "3000", grantType: "gift", giftCount: 3, notes: "Community gift" }
    });
    fireEvent.click(await screen.findByRole("button", { name: "ViewerOne" }));
    expect(screen.getByRole("article", { name: "Grant 1 for ViewerOne" })).toHaveTextContent("Tier 3 · Gifted subs ×3 · 15 entries");
  });

  it("sends an entry override and reports lookup failures", async () => {
    const calls = mockFetch({
      "GET /api/admin/sub-picks/settings": settings,
      "GET /api/admin/sub-picks/grants": [],
      "GET /api/sub-picks/eligible-games": games,
      "POST /api/admin/sub-picks/twitch-lookup": [404, { message: "No Twitch user called 'nobody'" }]
    });
    render(<AdminSubPicks />);

    fireEvent.click(await screen.findByRole("button", { name: "Add Entries" }));
    fireEvent.change(screen.getByLabelText("Twitch username"), { target: { value: "nobody" } });
    fireEvent.click(screen.getByRole("button", { name: "Look Up" }));
    expect(await screen.findByText("No Twitch user called 'nobody'")).toBeInTheDocument();

    mockFetch({
      "GET /api/admin/sub-picks/grants": [],
      "GET /api/sub-picks/eligible-games": games,
      "POST /api/admin/sub-picks/twitch-lookup": { twitchUserId: "1001", login: "viewerone", displayName: "ViewerOne", profileImageUrl: null },
      "POST /api/admin/sub-picks/grants": [400, { message: "Invalid grant" }]
    });
    fireEvent.click(screen.getByRole("button", { name: "Look Up" }));
    await screen.findByText("Found ViewerOne (Twitch ID 1001)");
    fireEvent.change(screen.getByLabelText("Number of entries"), { target: { value: "7" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Entries" }));
    expect(await screen.findByText("Invalid grant")).toBeInTheDocument();
    expect(calls.length).toBeGreaterThan(0);
  });

  it("summarises the pools and lets admins fix entries that need attention", async () => {
    const calls = mockFetch({
      "GET /api/admin/sub-picks/settings": settings,
      "GET /api/admin/sub-picks/grants": grantsNeedingAttention(),
      "GET /api/sub-picks/eligible-games": games,
      "GET /api/sub-picks/summary": summary,
      "PUT /api/admin/sub-picks/entries/10/pick": entry({ id: 10, gameId: 3, gameTitle: "Frequency", pool: "next_draw" })
    });
    render(<AdminSubPicks />);

    expect(await screen.findByText("Next 10s draw: Game 60")).toBeInTheDocument();
    expect(statValue("Entries in Next Draw")).toHaveTextContent("15");
    expect(statValue("100s Pool")).toHaveTextContent("4");
    expect(statValue("Need a Pick")).toHaveTextContent("1");
    expect(statValue("Need a New Pick")).toHaveTextContent("1");

    const attention = screen.getByRole("region", { name: "Needs Attention" });
    expect(within(attention).getByText("2 entries")).toBeInTheDocument();
    expect(within(attention).getAllByText("ViewerOne")).toHaveLength(2);
    expect(within(attention).getByText("Needs a new pick")).toBeInTheDocument();
    expect(within(attention).queryByText("OtherViewer")).not.toBeInTheDocument();

    fireEvent.click(within(attention).getByRole("button", { name: "Set pick for entry 10" }));
    fireEvent.change(within(attention).getByLabelText("Game"), { target: { value: "3" } });
    fireEvent.click(within(attention).getByRole("button", { name: "Save Pick" }));
    await waitFor(() => expect(calls).toContainEqual({ key: "PUT /api/admin/sub-picks/entries/10/pick", body: { gameId: 3 } }));

    const viewerRows = screen.getAllByRole("row").slice(1);
    expect(within(viewerRows[0]!).getAllByRole("cell").slice(0, 5).map((cell) => cell.textContent)).toEqual(["ViewerOne", "3", "0", "0", "2"]);
    expect(within(viewerRows[1]!).getAllByRole("cell").slice(0, 5).map((cell) => cell.textContent)).toEqual(["OtherViewer", "1", "1", "0", "0"]);
  });

  it("shows an empty attention list when every entry has a pick", async () => {
    mockFetch({
      "GET /api/admin/sub-picks/settings": settings,
      "GET /api/admin/sub-picks/grants": [grant({ entries: [entry({ id: 20, gameId: 1, gameTitle: "Amplitude", pool: "next_draw" })] })],
      "GET /api/sub-picks/eligible-games": games,
      "GET /api/sub-picks/summary": summary
    });
    render(<AdminSubPicks />);
    expect(await screen.findByText("Every entry has a valid pick.")).toBeInTheDocument();
  });

  it("expands a viewer to edit grants, remove entries and filter viewers", async () => {
    const calls = mockFetch({
      "GET /api/admin/sub-picks/settings": settings,
      "GET /api/admin/sub-picks/grants": grantsNeedingAttention(),
      "GET /api/sub-picks/eligible-games": games,
      "GET /api/sub-picks/summary": summary,
      "DELETE /api/admin/sub-picks/entries/10": { deleted: true },
      "PUT /api/admin/sub-picks/grants/1": grant({ id: 1 }),
      "DELETE /api/admin/sub-picks/grants/1": [409, { message: "Could not remove" }]
    });
    vi.spyOn(globalThis, "confirm").mockReturnValue(true);
    render(<AdminSubPicks />);

    const toggle = await screen.findByRole("button", { name: "ViewerOne" });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const entries = screen.getByRole("list", { name: "Entries for ViewerOne" });
    expect(within(entries).getByText("Won")).toBeInTheDocument();
    expect(within(entries).queryByRole("button", { name: "Set pick for entry 11" })).not.toBeInTheDocument();
    expect(within(entries).queryByRole("button", { name: "Remove entry 11" })).not.toBeInTheDocument();

    fireEvent.click(within(entries).getByRole("button", { name: "Remove entry 10" }));
    await waitFor(() => expect(calls.some((call) => call.key === "DELETE /api/admin/sub-picks/entries/10")).toBe(true));
    expect(globalThis.confirm).toHaveBeenCalledWith("Remove entry 10?");

    const card = screen.getByRole("article", { name: "Grant 1 for ViewerOne" });
    fireEvent.click(within(card).getByRole("button", { name: "Edit grant 1" }));
    fireEvent.change(within(card).getByLabelText("Number of entries"), { target: { value: "4" } });
    fireEvent.change(within(card).getByLabelText("Notes"), { target: { value: "Fixed" } });
    fireEvent.click(within(card).getByRole("button", { name: "Save Grant" }));
    await waitFor(() =>
      expect(calls).toContainEqual({ key: "PUT /api/admin/sub-picks/grants/1", body: { tier: "1000", grantType: "new", giftCount: 1, entryCount: 4, notes: "Fixed" } })
    );

    fireEvent.click(within(card).getByRole("button", { name: "Remove grant 1" }));
    expect(await within(card).findByRole("alert")).toHaveTextContent("Could not remove");

    fireEvent.click(toggle);
    expect(screen.queryByRole("article", { name: "Grant 1 for ViewerOne" })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Filter by viewer"), { target: { value: "other" } });
    expect(screen.queryByRole("button", { name: "ViewerOne" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "OtherViewer" }));
    expect(screen.getByRole("article", { name: "Grant 2 for OtherViewer" })).toHaveTextContent(/From Twitch.*Hype train/);
  });

  it("does nothing when a removal is not confirmed and shows entry errors", async () => {
    const calls = mockFetch({
      "GET /api/admin/sub-picks/settings": settings,
      "GET /api/admin/sub-picks/grants": grantsNeedingAttention(),
      "GET /api/sub-picks/eligible-games": games,
      "GET /api/sub-picks/summary": summary,
      "PUT /api/admin/sub-picks/entries/12/pick": [409, { message: "Pick is locked" }]
    });
    const confirm = vi.spyOn(globalThis, "confirm").mockReturnValue(false);
    render(<AdminSubPicks />);

    const attention = await screen.findByRole("region", { name: "Needs Attention" });
    fireEvent.click(await within(attention).findByRole("button", { name: "Remove entry 10" }));
    expect(confirm).toHaveBeenCalledWith("Remove entry 10 for ViewerOne?");
    fireEvent.click(screen.getByRole("button", { name: "ViewerOne" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove grant 1" }));
    expect(calls.some((call) => call.key.startsWith("DELETE"))).toBe(false);

    fireEvent.click(within(attention).getByRole("button", { name: "Set pick for entry 12" }));
    fireEvent.change(within(attention).getByLabelText("Game"), { target: { value: "1" } });
    fireEvent.click(within(attention).getByRole("button", { name: "Save Pick" }));
    expect(await within(attention).findByRole("alert")).toHaveTextContent("Pick is locked");
    fireEvent.click(within(attention).getByRole("button", { name: "Cancel" }));
    expect(within(attention).queryByLabelText("Game")).not.toBeInTheDocument();
  });

  it("saves settings and shows the audit log", async () => {
    const calls = mockFetch({
      "GET /api/admin/sub-picks/settings": settings,
      "GET /api/admin/sub-picks/grants": [],
      "GET /api/sub-picks/eligible-games": games,
      "PUT /api/admin/sub-picks/settings": (body: Partial<SubPickSettingsDto>) => ({ ...settings, ...body }),
      "GET /api/admin/sub-picks/audit": [
        { id: 1, actor: "StreamAdmin", action: "grant.create", targetType: "grant", targetId: 4, details: { entryCount: 5 }, createdAt: "2026-11-07T12:00:00.000Z" },
        { id: 2, actor: null, action: "settings.update", targetType: "settings", targetId: null, details: {}, createdAt: "2026-11-07T12:00:00.000Z" }
      ]
    });
    render(<AdminSubPicks />);

    fireEvent.click(await screen.findByRole("tab", { name: "Settings" }));
    expect(screen.getByRole("link", { name: "Admin page" })).toHaveAttribute("href", "/admin");
    fireEvent.change(screen.getByLabelText("Tier 3 entries"), { target: { value: "6" } });
    fireEvent.change(screen.getByLabelText("Wheel spin seconds"), { target: { value: "12" } });
    fireEvent.change(screen.getByLabelText("Overlay message"), { target: { value: "Sub for a spin!" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Settings" }));
    expect(await screen.findByText(/Settings saved/)).toBeInTheDocument();
    expect(calls).toContainEqual({
      key: "PUT /api/admin/sub-picks/settings",
      body: { tier1Entries: 1, tier2Entries: 2, tier3Entries: 6, spinDurationSeconds: 12, overlayMessage: "Sub for a spin!" }
    });

    fireEvent.click(screen.getByRole("tab", { name: "Audit Log" }));
    expect(await screen.findByRole("row", { name: /StreamAdmin grant\.create grant 4/ })).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /Unknown settings\.update settings \{\}/ })).toBeInTheDocument();
  });

  it("shows settings save errors and an empty audit log", async () => {
    mockFetch({
      "GET /api/admin/sub-picks/settings": settings,
      "GET /api/admin/sub-picks/grants": [],
      "GET /api/sub-picks/eligible-games": games,
      "PUT /api/admin/sub-picks/settings": [400, { message: "Overlay message is required" }],
      "GET /api/admin/sub-picks/audit": []
    });
    render(<AdminSubPicks />);

    fireEvent.click(await screen.findByRole("tab", { name: "Settings" }));
    fireEvent.click(screen.getByRole("button", { name: "Save Settings" }));
    expect(await screen.findByText("Overlay message is required")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Audit Log" }));
    expect(await screen.findByText("No changes recorded yet.")).toBeInTheDocument();
  });
});

function statValue(label: string) {
  return screen.getByText(label, { selector: ".stat-label" }).parentElement!.querySelector(".stat-value")!;
}

function grantsNeedingAttention(): SubGrantDto[] {
  return [
    grant({
      id: 2,
      twitchUserId: "1002",
      twitchDisplayName: "OtherViewer",
      twitchLogin: "otherviewer",
      source: "eventsub",
      notes: "Hype train",
      entries: [entry({ id: 20, twitchUserId: "1002", gameId: 1, gameTitle: "Amplitude", pool: "next_draw" })]
    }),
    grant({
      id: 1,
      entryCount: 3,
      entries: [
        entry({ id: 10 }),
        entry({ id: 11, status: "won", pool: "finished", canChangePick: false, gameTitle: "Frequency" }),
        entry({ id: 12, gameId: 5, gameTitle: "Burnout 3", pool: "needs_new_pick" })
      ]
    })
  ];
}

function grant(overrides: Partial<SubGrantDto> = {}): SubGrantDto {
  return {
    id: 1,
    twitchUserId: "1001",
    twitchLogin: "viewerone",
    twitchDisplayName: "ViewerOne",
    tier: "1000",
    grantType: "new",
    giftCount: 1,
    entryCount: 1,
    source: "manual",
    notes: null,
    createdBy: "StreamAdmin",
    createdAt: "2026-11-07T12:00:00.000Z",
    entries: [],
    ...overrides
  };
}
