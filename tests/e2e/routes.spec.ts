import { expect, test } from "./test.js";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/auth/user", async (route) => {
    await route.fulfill({ json: { isAuthenticated: false } });
  });
});

test("serves primary routes", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Dadson's PS2 Challenge" })).toBeVisible();
  await expect(page).toHaveTitle("Home - Dadson's PS2 Challenge");

  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Login with Twitch" })).toBeVisible();
  await expect(page).toHaveTitle("Login - Dadson's PS2 Challenge");

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
  expect(pieBox?.width ?? 0).toBeGreaterThan(300);
});
