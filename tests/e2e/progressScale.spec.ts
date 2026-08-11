import { expect, test } from "./test.js";

const LARGE_PROGRESS_COUNT = 3000;
const LONG_TASK_THRESHOLD_MS = 200;

test("Progress page search stays responsive and does not crash the browser at production scale", async ({ page }) => {
  let crashed = false;
  page.once("crash", () => {
    crashed = true;
  });

  await page.addInitScript(() => {
    (window as unknown as { __longTasks: number[] }).__longTasks = [];
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        (window as unknown as { __longTasks: number[] }).__longTasks.push(entry.duration);
      }
    }).observe({ entryTypes: ["longtask"] });
  });

  await page.route("**/api/games/progress", async (route) => {
    await route.fulfill({ json: largeProgressRows(LARGE_PROGRESS_COUNT) });
  });
  await page.route("**/api/games/page-data", async (route) => {
    await route.fulfill({ json: { games: [], ownedTypes: {}, exclusionReasons: {}, completionStatus: {}, alternateTitles: {} } });
  });

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/progress");
  await expect(page.getByRole("heading", { name: "Game Progress" })).toBeVisible();
  const resultsCount = page.getByText(/^Showing \d+ of/);
  await expect(resultsCount).toContainText(`Showing ${LARGE_PROGRESS_COUNT} of ${LARGE_PROGRESS_COUNT} games`);

  const searchBox = page.getByPlaceholder("Search by title, criteria, or review...");
  for (const character of "Game 42") {
    await searchBox.pressSequentially(character, { delay: 20 });
  }

  await expect(resultsCount).toContainText(`of ${LARGE_PROGRESS_COUNT} games`);
  await expect(resultsCount).not.toContainText(`Showing ${LARGE_PROGRESS_COUNT} of`);
  await expect(page.getByRole("row").first()).toBeVisible();

  const longTaskDurations = await page.evaluate(() => (window as unknown as { __longTasks: number[] }).__longTasks ?? []);
  const longestTaskMs = longTaskDurations.length ? Math.max(...longTaskDurations) : 0;
  expect(longestTaskMs, `Longest main-thread task while searching: ${longestTaskMs}ms`).toBeLessThan(LONG_TASK_THRESHOLD_MS);

  const tableHeader = page.locator("thead th").first();
  await page.mouse.wheel(0, 800);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  expect((await tableHeader.boundingBox())?.y).toBeCloseTo(0, 0);
  await page.mouse.wheel(0, 800);
  expect((await tableHeader.boundingBox())?.y).toBeCloseTo(0, 0);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("heading", { name: "Game Progress" })).toBeVisible();
  await expect(page.getByRole("row").first()).toBeVisible();
  await expect(resultsCount).toContainText(`of ${LARGE_PROGRESS_COUNT} games`);

  expect(crashed, "Page crashed while searching a large progress list").toBe(false);
});

function largeProgressRows(count: number) {
  const rows = [];
  for (let id = 1; id <= count; id++) {
    rows.push({
      progressId: id,
      gameId: id,
      gameTitle: `Game ${id}`,
      imageUrl: null,
      dateStarted: "2025-01-01",
      dateFinished: id % 3 === 0 ? "2025-01-10" : null,
      completionTime: null,
      beatenCriteria: "Credits",
      review: null,
      platform: "Physical"
    });
  }
  return rows;
}
