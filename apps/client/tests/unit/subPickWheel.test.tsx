import type { SubDrawDto, SubWheelDto } from "@ps2-challenge/shared";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Wheel, wheelLabel } from "../../src/components/Wheel.js";
import { formatOdds } from "../../src/subPickLabels.js";
import { AdminSubPicks } from "../../src/pages/AdminSubPicks.js";
import { WheelOverlay } from "../../src/pages/Overlays.js";
import { canvasCalls } from "./setup.js";
import { mockFetch } from "./subPickFixtures.js";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  canvasCalls.length = 0;
});

const settings = { tier1Entries: 1, tier2Entries: 2, tier3Entries: 5, spinDurationSeconds: 10, overlayMessage: "Sub!" };
const slices = [
  { entryId: 1, gameId: 50, gameTitle: "Alpha", twitchDisplayName: "ViewerOne" },
  { entryId: 2, gameId: 51, gameTitle: "Beta", twitchDisplayName: "ViewerTwo" },
  { entryId: 3, gameId: 50, gameTitle: "Alpha", twitchDisplayName: "ViewerThree" }
];
const odds = [
  { gameId: 50, gameTitle: "Alpha", entries: 2, odds: 2 / 3 },
  { gameId: 51, gameTitle: "Beta", entries: 1, odds: 1 / 3 }
];
const result = { ...slices[1]!, entries: 1, odds: 1 / 3 };

function draw(overrides: Partial<SubDrawDto> = {}): SubDrawDto {
  return {
    id: 7,
    kind: "10s",
    gameNumber: 10,
    state: "ready",
    locked: false,
    slices,
    odds,
    shuffleCount: 0,
    spinCount: 0,
    spin: null,
    winner: null,
    createdAt: "2026-11-07T12:00:00.000Z",
    finishedAt: null,
    ...overrides
  };
}

function spin(startedAt: string, decision: "pending" | "accepted" = "pending", revealed = false) {
  return {
    spinNumber: 1,
    startedAt,
    durationMs: 10_000,
    revealAt: new Date(Date.parse(startedAt) + 10_000).toISOString(),
    sliceCount: 3,
    winningSliceIndex: 1,
    stopOffset: 0.5,
    decision,
    result: revealed ? result : null
  };
}

function wheel(drawValue: SubDrawDto | null, due: SubWheelDto["due"] = null, serverNow = new Date().toISOString()): SubWheelDto {
  return { draw: drawValue, due, spinDurationSeconds: 10, serverNow };
}

function adminRoutes(wheelValue: SubWheelDto | (() => SubWheelDto), extra: Record<string, unknown> = {}) {
  return mockFetch({
    "GET /api/admin/sub-picks/settings": settings,
    "GET /api/admin/eventsub/review": [],
    "GET /api/admin/sub-picks/grants": [],
    "GET /api/sub-picks/eligible-games": [],
    "GET /api/sub-picks/summary": [500, {}],
    "GET /api/sub-picks/wheel": wheelValue,
    ...extra
  });
}

async function openWheelTab() {
  render(<AdminSubPicks />);
  fireEvent.click(await screen.findByRole("tab", { name: /^Wheel/ }));
  return screen.getByRole("tabpanel");
}

describe("sub pick wheel", () => {
  it("offers to open a due draw and shows the last result", async () => {
    const accepted = draw({ id: 3, gameNumber: 10, state: "accepted", winner: result, finishedAt: "2026-11-01T12:00:00.000Z" });
    const calls = adminRoutes(wheel(accepted, { gameNumber: 20, kind: "10s", entryCount: 4 }), { "POST /api/admin/sub-picks/draws": draw({ gameNumber: 20 }) });

    const panel = await openWheelTab();

    expect(screen.getByRole("tab", { name: "Wheel (draw due)" })).toBeInTheDocument();
    expect(within(panel).getByText("Game 20 is a 10s draw. 4 entries are waiting.")).toBeInTheDocument();
    expect(within(panel).getByText(/Last result: game 10 went to/)).toHaveTextContent("Last result: game 10 went to Beta, picked by ViewerTwo.");
    fireEvent.click(within(panel).getByRole("button", { name: "Open Draw" }));
    await waitFor(() => expect(calls.map((call) => call.key)).toContain("POST /api/admin/sub-picks/draws"));
  });

  it("explains when no draw is due", async () => {
    adminRoutes(wheel(null));
    const panel = await openWheelTab();
    expect(within(panel).getByText(/No draw is due right now/)).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Wheel" })).toBeInTheDocument();
  });

  it("spins, shuffles and cancels an open draw and shows the odds", async () => {
    const calls = adminRoutes(wheel(draw()), {
      "POST /api/admin/sub-picks/draws/7/spin": draw({ state: "spinning" }),
      "POST /api/admin/sub-picks/draws/7/shuffle": draw({ shuffleCount: 1 }),
      "POST /api/admin/sub-picks/draws/7/cancel": draw({ state: "cancelled" })
    });
    vi.spyOn(globalThis, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    const panel = await openWheelTab();

    expect(screen.getByRole("tab", { name: "Wheel (draw open)" })).toBeInTheDocument();
    expect(within(panel).getByRole("heading", { name: "Game 10 10s Draw" })).toBeInTheDocument();
    expect(within(panel).getByRole("figure", { name: "Sub pick wheel for game 10: 3 entries across 2 games" })).toBeInTheDocument();
    expect(within(panel).getByText(/Until the first spin/)).toBeInTheDocument();
    const oddsRows = within(within(panel).getByRole("table")).getAllByRole("row");
    expect(oddsRows[1]).toHaveTextContent("Alpha267%");
    expect(oddsRows[2]).toHaveTextContent("Beta133%");

    fireEvent.click(within(panel).getByRole("button", { name: "Spin" }));
    await waitFor(() => expect(calls.map((call) => call.key)).toContain("POST /api/admin/sub-picks/draws/7/spin"));
    fireEvent.click(await within(panel).findByRole("button", { name: "Shuffle" }));
    await waitFor(() => expect(calls.map((call) => call.key)).toContain("POST /api/admin/sub-picks/draws/7/shuffle"));
    fireEvent.click(await within(panel).findByRole("button", { name: "Cancel Draw" }));
    expect(calls.map((call) => call.key)).not.toContain("POST /api/admin/sub-picks/draws/7/cancel");
    fireEvent.click(within(panel).getByRole("button", { name: "Cancel Draw" }));
    await waitFor(() => expect(calls.map((call) => call.key)).toContain("POST /api/admin/sub-picks/draws/7/cancel"));
    expect(canvasCalls.some((call) => call.startsWith("fillText:Alpha"))).toBe(true);
  });

  it("shows the result once revealed and accepts or respins it", async () => {
    const startedAt = new Date(Date.now() - 20_000).toISOString();
    const calls = adminRoutes(wheel(draw({ state: "awaiting_decision", locked: true, spinCount: 1, spin: spin(startedAt, "pending", true) })), {
      "POST /api/admin/sub-picks/draws/7/accept": [409, { message: "Game 10 has already been started" }],
      "POST /api/admin/sub-picks/draws/7/respin": draw({ locked: true })
    });
    const panel = await openWheelTab();

    const status = within(panel).getByRole("status");
    expect(within(panel).getByTestId("wheel-readout")).toHaveTextContent("WinnerBetaPicked by ViewerTwo · 33% chance");
    expect(status).toHaveTextContent("Accept or respinAccepting starts Beta as game 10. It had 1 of 3 entries (33% chance).");
    expect(within(panel).queryByRole("button", { name: "Spin" })).not.toBeInTheDocument();
    fireEvent.click(within(panel).getByRole("button", { name: "Accept Beta" }));
    expect(await within(panel).findByRole("alert")).toHaveTextContent("Game 10 has already been started");
    fireEvent.click(within(panel).getByRole("button", { name: "Respin" }));
    await waitFor(() => expect(calls.map((call) => call.key)).toContain("POST /api/admin/sub-picks/draws/7/respin"));
    expect(canvasCalls.some((call) => call.startsWith("stroke"))).toBe(true);
  });

  it("hides the controls and result while the wheel is spinning, then reloads at the reveal", async () => {
    let loads = 0;
    const startedAt = new Date().toISOString();
    adminRoutes(() => {
      loads++;
      return wheel(draw({ state: "spinning", locked: true, spinCount: 1, spin: { ...spin(startedAt), durationMs: 200, revealAt: new Date(Date.parse(startedAt) + 200).toISOString() } }));
    });
    const panel = await openWheelTab();

    expect(within(panel).getByText("Spinning...")).toBeInTheDocument();
    for (const name of ["Spin", "Shuffle", "Respin", "Cancel Draw"]) expect(within(panel).queryByRole("button", { name })).toBeNull();
    await waitFor(() => expect(loads).toBeGreaterThanOrEqual(2), { timeout: 2000 });
  });

  it("saves a new spin length", async () => {
    const calls = adminRoutes(wheel(null), { "PUT /api/admin/sub-picks/settings": { ...settings, spinDurationSeconds: 4 } });
    const panel = await openWheelTab();

    fireEvent.change(within(panel).getByLabelText("Seconds per spin"), { target: { value: "4" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Save Spin Length" }));

    expect(await within(panel).findByText("Spins now last 4 seconds.")).toBeInTheDocument();
    expect(calls).toContainEqual({ key: "PUT /api/admin/sub-picks/settings", body: { ...settings, spinDurationSeconds: 4 } });
  });

  it("shows a load error and a save error", async () => {
    adminRoutes([500, { message: "Wheel broke" }] as unknown as SubWheelDto, { "PUT /api/admin/sub-picks/settings": [400, { message: "Too long" }] });
    const panel = await openWheelTab();
    expect(await within(panel).findByText("Wheel broke")).toBeInTheDocument();
  });

  it("animates a spin to the winning slice and slides slices on a shuffle", () => {
    vi.useFakeTimers();
    const now = Date.now();
    const ready = draw();
    const { rerender } = render(<Wheel draw={ready} clockOffsetMs={0} label="Wheel" />);
    rerender(<Wheel draw={draw({ slices: [slices[2]!, slices[0]!, slices[1]!] })} clockOffsetMs={0} label="Wheel" />);
    act(() => vi.advanceTimersByTime(1500));
    rerender(<Wheel draw={draw({ state: "spinning", spin: spin(new Date(now).toISOString()) })} clockOffsetMs={0} label="Wheel" />);
    act(() => vi.advanceTimersByTime(11_000));
    rerender(<Wheel draw={draw({ state: "awaiting_decision", spin: spin(new Date(now).toISOString(), "pending", true) })} clockOffsetMs={0} label="Wheel" />);
    expect(canvasCalls.filter((call) => call === "arc:").length).toBeGreaterThan(20);
    expect(canvasCalls).toContain("fillText:Beta");
  });

  it("formats chances and labels", () => {
    expect(formatOdds(0.666)).toBe("67%");
    expect(formatOdds(0.054)).toBe("5.4%");
    expect(formatOdds(0)).toBe("0%");
    expect(wheelLabel(draw({ slices: [slices[0]!], odds: [odds[0]!] }))).toBe("Sub pick wheel for game 10: 1 entry across 1 game");
  });
});

describe("wheel overlay", () => {
  it("shows an open draw with the readout and every game's pickers and chance", async () => {
    mockFetch({ "GET /api/sub-picks/wheel": wheel(draw()) });
    render(<WheelOverlay />);

    expect(await screen.findByText("Sub Pick Draw: Game 10")).toBeInTheDocument();
    expect(screen.getByRole("figure", { name: /Sub pick wheel for game 10/ })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("wheel-readout")).toHaveTextContent("On the pointerAlphaPicked by ViewerOne"));
    const rows = screen.getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("AlphaViewerOne, ViewerThree267%");
    expect(rows[0]).toHaveClass("is-active");
    expect(rows[1]).toHaveTextContent("BetaViewerTwo133%");
    expect(screen.getByText("3 entries · 2 games")).toBeInTheDocument();
  });

  it("highlights the revealed winner", async () => {
    const startedAt = new Date(Date.now() - 20_000).toISOString();
    mockFetch({ "GET /api/sub-picks/wheel": wheel(draw({ state: "awaiting_decision", spin: spin(startedAt, "pending", true) })) });
    render(<WheelOverlay />);

    expect(await screen.findByTestId("wheel-readout")).toHaveTextContent("WinnerBetaPicked by ViewerTwo · 33% chance");
    expect(screen.getByText("Beta", { selector: "li strong" }).closest("li")).toHaveClass("is-winner");
  });

  it("lists the biggest games and keeps the winner in the list", async () => {
    const many = Array.from({ length: 15 }, (_, index) => ({ entryId: index + 1, gameId: 100 + index, gameTitle: `Game ${index + 1}`, twitchDisplayName: index === 3 ? null : "Viewer" }));
    const manyOdds = many.map((slice, index) => ({ gameId: slice.gameId, gameTitle: slice.gameTitle, entries: index === 14 ? 1 : 2, odds: 1 / 15 }));
    const winner = { ...many[14]!, entries: 1, odds: 1 / 15 };
    mockFetch({
      "GET /api/sub-picks/wheel": wheel(
        draw({ state: "accepted", slices: many, odds: manyOdds, winner, spin: { ...spin(new Date(Date.now() - 60_000).toISOString(), "accepted", true), result: winner, sliceCount: 15, winningSliceIndex: 14 }, finishedAt: new Date().toISOString() })
      )
    });
    render(<WheelOverlay />);

    expect(await screen.findByText("+3 more games (6 entries)")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(12);
    expect(screen.getByText("Game 15", { selector: "li strong" }).closest("li")).toHaveClass("is-winner");
    expect(screen.getByText("Game 4", { selector: "li strong" }).nextSibling).toHaveTextContent("Anonymous");
  });

  it("stays empty with no draw, an old result or an error", async () => {
    mockFetch({ "GET /api/sub-picks/wheel": wheel(draw({ state: "accepted", winner: result, finishedAt: "2026-01-01T00:00:00.000Z" })) });
    const { unmount } = render(<WheelOverlay />);
    await waitFor(() => expect(screen.getByTestId("wheel-overlay")).toBeEmptyDOMElement());
    unmount();

    mockFetch({ "GET /api/sub-picks/wheel": [500, { message: "Nope" }] });
    render(<WheelOverlay />);
    expect(await screen.findByText("Error loading the wheel")).toBeInTheDocument();
  });
});
