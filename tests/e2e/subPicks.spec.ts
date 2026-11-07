import type { BrowserContext } from "@playwright/test";
import { authCookieName, createSessionCookie, type SessionUser } from "../../apps/server/src/auth/session.js";
import { expect, test } from "./test.js";

const cookieSecret = process.env.PLAYWRIGHT_COOKIE_SECRET ?? "playwright-cookie-secret";
const admin: SessionUser = { id: 1, twitchId: "playwright-admin", username: "PlaywrightAdmin", role: "Admin", profileImageUrl: "/assets/glitch_flat_purple.svg" };
const sub: SessionUser = { id: 3, twitchId: "424242", username: "PlaywrightSub", role: "User", profileImageUrl: null };

test.describe.configure({ mode: "serial" });

test("anonymous visitors see the pools but must log in to pick", async ({ page }) => {
  await page.goto("/sub-picks");
  await expect(page.getByRole("heading", { name: "Sub Picks" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sub Picks" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByText(/Tier 1 and Prime: 1 entry/)).toBeVisible();

  await page.goto("/sub-picks/mine");
  await expect(page.getByRole("heading", { name: "Not Logged In" })).toBeVisible();

  const adminWrite = await page.request.post("/api/admin/sub-picks/grants", { data: {}, failOnStatusCode: false });
  expect(adminWrite.status()).toBe(401);
});

test("an admin adds entries, the sub picks games, and the public pool updates", async ({ browser, page, baseURL }) => {
  await signIn(page.context(), baseURL, admin);
  await page.goto("/admin");
  await page.getByRole("navigation", { name: "Admin sections" }).getByRole("link", { name: "Sub Picks" }).click();
  await expect(page).toHaveURL(/\/admin\/sub-picks$/);
  await expect(page.getByRole("heading", { name: "Sub Picks" })).toBeVisible();

  await page.getByRole("button", { name: "Add Entries" }).click();
  await page.getByLabel("Twitch username").fill("PlaywrightSub");
  await page.getByRole("button", { name: "Look Up" }).click();
  await expect(page.getByText("Found PlaywrightSub (Twitch ID 424242)")).toBeVisible();
  await page.getByLabel("Tier").selectOption({ label: "Tier 2" });
  await expect(page.getByLabel("Number of entries")).toHaveValue("2");
  await page.getByRole("button", { name: "Save Entries" }).click();
  await expect(page.getByText("Added 2 entries for PlaywrightSub")).toBeVisible();

  const attention = page.getByRole("region", { name: "Needs Attention" });
  await expect(attention.getByText("PlaywrightSub")).toHaveCount(2);
  await attention.getByRole("button", { name: /Set pick for entry/ }).first().click();
  await attention.getByLabel("Search games").fill("Frequency");
  await attention.getByLabel("Game", { exact: true }).selectOption({ label: "Frequency" });
  await attention.getByRole("button", { name: "Save Pick" }).click();
  await expect(attention.getByText("PlaywrightSub")).toHaveCount(1);

  await page.getByRole("button", { name: "PlaywrightSub" }).click();
  const subEntries = page.getByRole("list", { name: "Entries for PlaywrightSub" });
  await expect(subEntries.getByText("Frequency")).toBeVisible();
  await expect(subEntries.getByText("In the next draw")).toBeVisible();

  const subContext = await browser.newContext(baseURL ? { baseURL } : {});
  await signIn(subContext, baseURL, sub);
  const subPage = await subContext.newPage();
  await subPage.goto("/sub-picks/mine");
  await expect(subPage.getByRole("heading", { name: "My Entries" })).toBeVisible();
  await expect(subPage.locator(".stat", { hasText: "Entries Earned" }).getByTestId("stat-value")).toHaveText("2");
  await subPage.getByRole("button", { name: /Pick game for entry/ }).click();
  await subPage.getByLabel("Search games").fill("Ecco");
  await subPage.getByLabel("Game", { exact: true }).selectOption({ label: "Ecco the Dolphin: Defender of the Future" });
  await subPage.getByRole("button", { name: "Save Pick" }).click();
  await expect(subPage.getByText(/is now on Ecco the Dolphin/)).toBeVisible();
  await expect(subPage.locator(".stat", { hasText: "Chance in the Next Draw" }).getByTestId("stat-value")).toHaveText("100%");

  await subPage.goto("/sub-picks");
  const pool = subPage.getByRole("region", { name: /Next Draw Pool/ });
  await expect(pool.getByRole("row", { name: "Frequency 1 50%" })).toBeVisible();
  await expect(pool.getByRole("row", { name: "Ecco the Dolphin: Defender of the Future 1 50%" })).toBeVisible();
  await expect(subPage.getByRole("link", { name: "My Entries" })).toBeVisible();
  await subContext.close();

  await page.getByRole("tab", { name: "Audit Log" }).click();
  await expect(page.getByRole("row", { name: /PlaywrightSub entry\.pick\.viewer/ })).toBeVisible();
  await expect(page.getByRole("row", { name: /PlaywrightAdmin entry\.pick\.admin/ })).toBeVisible();
  await expect(page.getByRole("row", { name: /PlaywrightAdmin grant\.create/ })).toBeVisible();

  await page.getByRole("tab", { name: "Settings" }).click();
  await page.getByLabel("Tier 3 entries").fill("6");
  await page.getByRole("button", { name: "Save Settings" }).click();
  await expect(page.getByText(/Settings saved/)).toBeVisible();
});

async function signIn(context: BrowserContext, baseURL: string | undefined, user: SessionUser) {
  if (!baseURL) {
    throw new Error("Playwright baseURL is required for authenticated full-stack tests");
  }
  await context.addCookies([
    { name: authCookieName, value: createSessionCookie(user, cookieSecret), url: baseURL, httpOnly: true, sameSite: "Lax", secure: false }
  ]);
}

test("the sub picks overlay renders on a transparent background with live numbers", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 400 });
  await page.goto("/sub-picks-overlay");
  const overlay = page.getByTestId("sub-picks-overlay");
  await expect(overlay.getByText("Sub to add a game to the wheel. Every 10th game is picked by subs.")).toBeVisible();
  await expect(overlay.getByText("On the wheel")).toBeVisible();
  await expect(overlay).not.toHaveClass(/is-hidden/);
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
  if (process.env.SUB_PICKS_OVERLAY_SCREENSHOT) {
    await page.screenshot({ path: process.env.SUB_PICKS_OVERLAY_SCREENSHOT, omitBackground: true });
  }
});
