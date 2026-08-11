import { expect, test } from "./test.js";

const LARGE_GAME_COUNT = 3000;
const LONG_TASK_THRESHOLD_MS = 200;
const REGIONS = ["EU", "NA", "JP"];

test("Games page search stays responsive and does not crash the browser at production scale", async ({ page }) => {
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

  await page.route("**/api/games/page-data", async (route) => {
    await route.fulfill({ json: largeGamesPageData(LARGE_GAME_COUNT) });
  });

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/games");
  await expect(page.getByRole("heading", { name: "PS2 Games Library" })).toBeVisible();
  const resultsCount = page.getByText(/^Showing \d+ of/);
  await expect(resultsCount).toContainText(`Showing ${LARGE_GAME_COUNT} of ${LARGE_GAME_COUNT} games`);

  const searchBox = page.getByPlaceholder("Search games by title, developer, or publisher...");
  for (const character of "Game 42") {
    await searchBox.pressSequentially(character, { delay: 20 });
  }

  await expect(resultsCount).toContainText(`of ${LARGE_GAME_COUNT} games`);
  await expect(resultsCount).not.toContainText(`Showing ${LARGE_GAME_COUNT} of`);
  await expect(page.getByRole("row").first()).toBeVisible();

  const longTaskDurations = await page.evaluate(() => (window as unknown as { __longTasks: number[] }).__longTasks ?? []);
  const longestTaskMs = longTaskDurations.length ? Math.max(...longTaskDurations) : 0;
  expect(longestTaskMs, `Longest main-thread task while searching: ${longestTaskMs}ms`).toBeLessThan(LONG_TASK_THRESHOLD_MS);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("heading", { name: "PS2 Games Library" })).toBeVisible();
  await expect(page.getByRole("row").first()).toBeVisible();
  await expect(resultsCount).toContainText(`of ${LARGE_GAME_COUNT} games`);

  expect(crashed, "Page crashed while searching a large game list").toBe(false);
});

function largeGamesPageData(count: number) {
  const games = [];
  for (let id = 1; id <= count; id++) {
    games.push({
      id,
      title: `Game ${id}`,
      developer: `Developer ${id % 50}`,
      publisher: `Publisher ${id % 30}`,
      firstReleased: "2002-01-01",
      regionFirstReleasedIn: REGIONS[id % REGIONS.length],
      imageUrl: null,
      isExcluded: false,
      isOwned: id % 4 === 0
    });
  }
  return {
    games,
    ownedTypes: {},
    exclusionReasons: {},
    completionStatus: {},
    alternateTitles: {}
  };
}
