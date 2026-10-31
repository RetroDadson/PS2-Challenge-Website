import { expect, test } from "./test.js";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/auth/user", async (route) => {
    await route.fulfill({ json: { isAuthenticated: false } });
  });
});

test("serves primary routes", async ({ page }) => {
  await page.route("**/api/challenge-runners", async (route) => {
    await route.fulfill({ json: [{ id: 1, name: "Runner One", description: "Completing every PAL PS2 game.", twitchUrl: "https://www.twitch.tv/runnerone", youtubeUrl: null, logoUrl: "https://static-cdn.jtvnw.net/runnerone.png" }] });
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Dadson's PS2 Challenge" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Explore the runner directory/i })).toHaveAttribute("href", "/runners");
  await expect(page).toHaveTitle("Home - Dadson's PS2 Challenge");

  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Login with Twitch" })).toBeVisible();
  await expect(page).toHaveTitle("Login - Dadson's PS2 Challenge");

  await page.goto("/runners");
  await expect(page.getByRole("heading", { name: "Other Challenge Runners" })).toBeVisible();
  await expect(page.getByText("Completing every PAL PS2 game.")).toBeVisible();
  await expect(page).toHaveTitle("Challenge Runners - Dadson's PS2 Challenge");

  await page.goto("/missing-route");
  await expect(page.getByRole("alert")).toHaveText("Sorry, there's nothing at this address.");
  await expect(page).toHaveTitle("Not found");
});

test("serves request-aware search-engine files", async ({ page }) => {
  const robotsResponse = await page.goto("/robots.txt");
  await expect(robotsResponse?.text()).resolves.toContain("Disallow: /api/");
  await expect(robotsResponse?.text()).resolves.toContain("Sitemap: http://127.0.0.1:4173/sitemap.xml");

  const sitemapResponse = await page.goto("/sitemap.xml");
  await expect(sitemapResponse?.text()).resolves.toContain("http://127.0.0.1:4173/statistics");
});

test("renders the statistics duration chart", async ({ page }) => {
  await page.route("**/api/games", async (route) => {
    await route.fulfill({
      json: [
        { id: 1, title: "Game One", isExcluded: false, isOwned: true },
        { id: 2, title: "Game Two", isExcluded: true, isOwned: true },
        { id: 3, title: "Game Three", isExcluded: false, isOwned: false },
        { id: 4, title: "Game Four", isExcluded: false, isOwned: true }
      ]
    });
  });
  await page.route("**/api/games/progress", async (route) => {
    await route.fulfill({
      json: [
        {
          progressId: 1,
          gameId: 1,
          gameTitle: "Game One",
          dateStarted: "2024-03-01",
          dateFinished: "2024-03-05",
          completionTime: "10:30:00",
          platform: "Physical"
        },
        {
          progressId: 2,
          gameId: 3,
          gameTitle: "Game Three",
          dateStarted: "2025-01-01",
          dateFinished: "2025-01-03",
          completionTime: "05:30:00",
          platform: "Emulated"
        }
      ]
    });
  });
  await page.route("**/api/games/owned-types", async (route) => {
    await route.fulfill({ json: { 1: "CIB", 2: "Loose", 4: "CIB" } });
  });

  await page.goto("/statistics");

  await expect(page.getByRole("heading", { name: "Challenge Statistics" })).toBeVisible();
  const durationCard = page.locator(".duration-chart-card");
  await expect(durationCard).toBeVisible();
  await expect(page.getByRole("img", { name: "Game duration line chart" })).toBeVisible();
  const durationBox = await page.getByRole("img", { name: "Game duration line chart" }).boundingBox();
  const durationCardBox = await durationCard.boundingBox();
  expect((durationBox?.x ?? 0) + (durationBox?.width ?? 0)).toBeLessThanOrEqual((durationCardBox?.x ?? 0) + (durationCardBox?.width ?? 0) + 1);
  await expect(page.getByRole("button", { name: "Zoom in" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Zoom out" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reset Zoom" })).toBeVisible();
  const highDurationPoint = page.getByLabel("Game #1 Game One duration 10h 30m completed 2024-03-05");
  await highDurationPoint.hover();
  const tooltip = page.getByRole("tooltip");
  await expect(tooltip).toContainText("Game One");
  await expect(tooltip).toContainText("10h 30m");
  await expect(tooltip).toHaveClass(/duration-tooltip-below/);
  const pointBox = await highDurationPoint.boundingBox();
  const tooltipBox = await tooltip.boundingBox();
  expect(tooltipBox?.y ?? 0).toBeGreaterThan((pointBox?.y ?? 0) - 1);
  await expect(page.getByText("Challenge Collection Progress")).toBeVisible();
  await expect(page.getByText("Total Collection Progress")).toBeVisible();
  const pieBox = await page.getByRole("img", { name: "Ownership type breakdown" }).boundingBox();
  const viewportWidth = page.viewportSize()?.width ?? 0;
  expect(pieBox?.width ?? 0).toBeGreaterThan(Math.min(300, viewportWidth * 0.7));
});

test("scales statistics death bars by count regardless of label length", async ({ page }) => {
  await page.route("**/api/games", async (route) => {
    await route.fulfill({
      json: [
        { id: 1, title: "Game One", isExcluded: false, isOwned: true },
        { id: 2, title: "Game Two", isExcluded: false, isOwned: true },
        { id: 3, title: "Game Three", isExcluded: false, isOwned: true }
      ]
    });
  });
  await page.route("**/api/games/progress", async (route) => {
    await route.fulfill({
      json: [
        { progressId: 1, gameId: 1, gameTitle: "Game One", dateStarted: "2024-03-01", dateFinished: null, completionTime: null, platform: "Physical", deaths: 100, deathLabel: "Deaths" },
        { progressId: 2, gameId: 2, gameTitle: "Game Two", dateStarted: "2024-03-01", dateFinished: null, completionTime: null, platform: "Physical", deaths: 50, deathLabel: "failures before first completion" },
        { progressId: 3, gameId: 3, gameTitle: "Game Three", dateStarted: "2024-03-01", dateFinished: null, completionTime: null, platform: "Physical", deaths: 25, deathLabel: "Deaths" }
      ]
    });
  });
  await page.route("**/api/games/owned-types", async (route) => {
    await route.fulfill({ json: { 1: "CIB", 2: "CIB", 3: "CIB" } });
  });

  await page.goto("/statistics");

  const bars = page.getByRole("figure", { name: "Top 3 Games by Deaths / Fails" }).locator(".deaths-chart-bar");
  await expect(bars).toHaveCount(3);
  const [most, middle, least] = await bars.evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().width));
  expect(middle! / most!).toBeCloseTo(0.5, 1);
  expect(least! / most!).toBeCloseTo(0.25, 1);
});
