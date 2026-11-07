import type { Page } from "@playwright/test";
import { sliceColourIndex, wheelPalette } from "../../apps/client/src/wheelMath.js";
import { authCookieName, createSessionCookie, type SessionUser } from "../../apps/server/src/auth/session.js";
import { expect, test } from "./test.js";

const cookieSecret = process.env.PLAYWRIGHT_COOKIE_SECRET ?? "playwright-cookie-secret";
const admin: SessionUser = { id: 1, twitchId: "playwright-admin", username: "PlaywrightAdmin", role: "Admin", profileImageUrl: null };
const spinMs = 1500;
const slices = [
  { entryId: 1, gameId: 50, gameTitle: "Amplitude", twitchDisplayName: "ViewerOne" },
  { entryId: 2, gameId: 51, gameTitle: "Frequency", twitchDisplayName: "ViewerTwo" },
  { entryId: 3, gameId: 50, gameTitle: "Amplitude", twitchDisplayName: "ViewerThree" }
];
const odds = [
  { gameId: 50, gameTitle: "Amplitude", entries: 2, odds: 2 / 3 },
  { gameId: 51, gameTitle: "Frequency", entries: 1, odds: 1 / 3 }
];
const result = { ...slices[1]!, entries: 1, odds: 1 / 3 };

type Phase = "due" | "ready" | "spun" | "accepted";
type Slice = (typeof slices)[number];

async function mockWheel(page: Page, initial: Phase, spunAt = 0, wheelSlices: Slice[] = slices, wheelOdds: typeof odds = odds) {
  const state = { phase: initial, startedAt: spunAt };
  const draw = () => {
    const now = Date.now();
    const revealed = state.phase === "accepted" || (state.phase === "spun" && now >= state.startedAt + spinMs);
    const spin = state.startedAt
      ? {
          spinNumber: 1,
          startedAt: new Date(state.startedAt).toISOString(),
          durationMs: spinMs,
          revealAt: new Date(state.startedAt + spinMs).toISOString(),
          sliceCount: wheelSlices.length,
          winningSliceIndex: 1,
          stopOffset: 0.2,
          decision: state.phase === "accepted" ? "accepted" : "pending",
          result: revealed ? result : null
        }
      : null;
    let drawState = "ready";
    if (state.phase === "accepted") drawState = "accepted";
    else if (state.phase === "spun") drawState = revealed ? "awaiting_decision" : "spinning";
    return {
      id: 7,
      kind: "10s",
      gameNumber: 10,
      state: drawState,
      locked: state.startedAt > 0,
      slices: wheelSlices,
      odds: wheelOdds,
      shuffleCount: 0,
      spinCount: spin ? 1 : 0,
      spin,
      winner: state.phase === "accepted" ? result : null,
      createdAt: new Date(now - 60_000).toISOString(),
      finishedAt: state.phase === "accepted" ? new Date(now).toISOString() : null
    };
  };

  await page.route("**/api/sub-picks/wheel", (route) =>
    route.fulfill({
      json: {
        draw: state.phase === "due" ? null : draw(),
        due: state.phase === "due" ? { gameNumber: 10, kind: "10s", entryCount: 3 } : null,
        spinDurationSeconds: spinMs / 1000,
        serverNow: new Date().toISOString()
      }
    })
  );
  await page.route("**/api/admin/sub-picks/draws", (route) => {
    state.phase = "ready";
    return route.fulfill({ json: draw() });
  });
  await page.route("**/api/admin/sub-picks/draws/7/*", (route) => {
    const action = new URL(route.request().url()).pathname.split("/").at(-1);
    if (action === "spin") {
      state.phase = "spun";
      state.startedAt = Date.now();
    }
    if (action === "accept") state.phase = "accepted";
    return route.fulfill({ json: draw() });
  });
}

function pixelAt(page: Page, x: number, y: number) {
  return page.getByTestId("sub-wheel").evaluate(
    (canvas, point) => [...(canvas as HTMLCanvasElement).getContext("2d")!.getImageData(point.x, point.y, 1, 1).data],
    { x, y }
  );
}

function hexToRgb(hex: string): number[] {
  return [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16));
}

test("an admin opens a draw, spins the wheel and accepts the result", async ({ page, baseURL }) => {
  await page.context().addCookies([
    { name: authCookieName, value: createSessionCookie(admin, cookieSecret), url: baseURL!, httpOnly: true, sameSite: "Lax", secure: false }
  ]);
  await mockWheel(page, "due");
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto("/admin/sub-picks?tab=wheel");

  await expect(page.getByRole("tab", { name: "Wheel (draw due)" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("Game 10 is a 10s draw. 3 entries are waiting.")).toBeVisible();
  await page.getByRole("button", { name: "Open Draw" }).click();

  await expect(page.getByRole("heading", { name: "Game 10 10s Draw" })).toBeVisible();
  await expect(page.getByRole("figure", { name: "Sub pick wheel for game 10: 3 entries across 2 games" })).toBeVisible();
  expect((await pixelAt(page, 360, 360))[3]).toBe(255);

  await page.getByRole("button", { name: "Spin", exact: true }).click();
  await expect(page.getByText("Spinning...")).toBeVisible();
  await expect(page.getByRole("button", { name: /Accept/ })).toHaveCount(0);
  const early = (await pixelAt(page, 360, 160)).join();
  await expect.poll(async () => (await pixelAt(page, 360, 160)).join(), { timeout: spinMs }).not.toBe(early);

  await expect(page.getByRole("button", { name: "Accept Frequency" })).toBeVisible({ timeout: 5000 });
  await expect(page.locator(".sub-wheel-status")).toContainText("Accepting starts Frequency as game 10. It had 1 of 3 entries (33% chance).");
  expect((await pixelAt(page, 360, 160)).slice(0, 3)).toEqual(hexToRgb(wheelPalette[sliceColourIndex(1, 3, wheelPalette.length)]!));
  await page.screenshot({ path: test.info().outputPath("wheel-awaiting-decision.png") });

  await page.getByRole("button", { name: "Accept Frequency" }).click();
  await expect(page.getByText(/Last result: game 10 went to/)).toContainText("Last result: game 10 went to Frequency, picked by ViewerTwo.");
});

test("the wheel overlay shows the result on a transparent background", async ({ page }) => {
  await mockWheel(page, "spun", Date.now() - 10_000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/wheel-overlay");

  await expect(page.getByText("Sub Pick Draw: Game 10")).toBeVisible();
  await expect(page.getByTestId("wheel-readout")).toContainText("Frequency");
  await expect(page.getByTestId("wheel-readout")).toContainText("Picked by ViewerTwo · 33% chance");
  await expect(page.locator(".wheel-overlay-list li.is-winner")).toContainText("Frequency");
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
  expect((await pixelAt(page, 500, 220)).slice(0, 3)).toEqual(hexToRgb(wheelPalette[sliceColourIndex(1, 3, wheelPalette.length)]!));
  await page.screenshot({ path: test.info().outputPath("wheel-overlay.png") });
});

test("a crowded wheel keeps its labels inside the slices and lists the biggest games", async ({ page }) => {
  const titles = ["Grand Theft Auto: San Andreas", "Who Wants To Be A Millionaire: Party Edition", "Tom Clancy's Ghost Recon", "Franklin: A Birthday Surprise", "Van Helsing", "Zathura", "Blood Omen 2", "Ty the Tasmanian Tiger", "Resident Evil Code: Veronica X", "The Incredibles: Rise of the Underminer", "Commandos 2: Men of Courage", "FIFA 14: Legacy Edition", "Sky Odyssey", "Space Invaders: Invasion Day"];
  const pickers = ["retrodadson", "MemoryCardMolly", "Slim_Slot_Sam", "EyeToy_Ellie", "DualShockDan", "Pixel_Pete", "MultitapMo", "FatPS2Fiona"];
  const crowded = Array.from({ length: 60 }, (_, index) => {
    const game = index % 3 === 0 ? 0 : index % titles.length;
    return { entryId: index + 1, gameId: 100 + game, gameTitle: titles[game]!, twitchDisplayName: pickers[index % pickers.length]! };
  });
  const counts = new Map<number, number>();
  for (const slice of crowded) counts.set(slice.gameId, (counts.get(slice.gameId) ?? 0) + 1);
  const crowdedOdds = [...counts]
    .map(([gameId, entries]) => ({ gameId, gameTitle: titles[gameId - 100]!, entries, odds: entries / crowded.length }))
    .sort((left, right) => right.entries - left.entries);
  await mockWheel(page, "ready", 0, crowded, crowdedOdds);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/wheel-overlay");

  await expect(page.getByText("60 entries · 14 games")).toBeVisible();
  await expect(page.getByText("+2 more games (4 entries)")).toBeVisible();
  await expect(page.getByTestId("wheel-readout")).toContainText("On the pointer");
  await page.screenshot({ path: test.info().outputPath("wheel-overlay-crowded.png") });
});
