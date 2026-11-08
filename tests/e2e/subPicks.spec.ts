import type { BrowserContext } from "@playwright/test";
import { authCookieName, createSessionCookie, type SessionUser } from "../../apps/server/src/auth/session.js";
import { eventSubSecret, eventSubSignature } from "../../apps/server/src/services/eventSubSignature.js";
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

  const stats = page.getByRole("region", { name: "Stats" });
  await expect(stats.getByText("Games Picked by Subs")).toBeVisible();
  await expect(stats.getByText("No games have been picked by subs yet.")).toBeVisible();

  await page.getByRole("link", { name: "Draw History" }).click();
  await expect(page).toHaveURL(/\/sub-picks\/history$/);
  await expect(page.getByRole("heading", { name: "Draw History" })).toBeVisible();
  await expect(page.getByText("No draws have finished yet.")).toBeVisible();

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

test("the wheel overlay shows when the next draw is between draws", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/wheel-overlay");
  const card = page.getByTestId("wheel-overlay-next-draw");
  await expect(card.getByText("Sub Pick Draw")).toBeVisible();
  await expect(card.getByText(/^Next 10s draw$/)).toBeVisible();
  await expect(card.getByText("Game 10")).toBeVisible();
  await expect(page.getByTestId("sub-wheel")).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath("wheel-overlay-next-draw.png") });
});

test("the sub picks overlay fills a solid 1242 by 97 strip with live numbers", async ({ page }) => {
  await page.setViewportSize({ width: 1242, height: 97 });
  await page.goto("/sub-picks-overlay");
  const overlay = page.getByTestId("sub-picks-overlay");
  await expect(overlay.getByText("Sub to add a game to the wheel. Every 10th game is picked by subs.")).toBeVisible();
  await expect(overlay.getByText("On the wheel")).toBeVisible();
  await expect(overlay).not.toHaveClass(/is-hidden/);
  const box = page.locator(".sub-picks-overlay-box");
  expect(await box.boundingBox()).toEqual({ x: 0, y: 0, width: 1242, height: 97 });
  expect(await box.evaluate((element) => getComputedStyle(element).backgroundColor)).toMatch(/^rgb\(/);
  expect(await box.evaluate((element) => getComputedStyle(element).backgroundImage)).not.toContain("rgba");
  if (process.env.SUB_PICKS_OVERLAY_SCREENSHOT) {
    await page.screenshot({ path: process.env.SUB_PICKS_OVERLAY_SCREENSHOT, omitBackground: true });
  }
});

test("a signed Twitch EventSub gift creates entries for the gifter", async ({ page, baseURL }) => {
  const body = JSON.stringify({
    subscription: { id: "e2e-sub", type: "channel.subscription.gift", version: "1", status: "enabled" },
    event: { user_id: "77001", user_login: "e2egifter", user_name: "E2EGifter", tier: "1000", total: 3, is_anonymous: false }
  });
  const messageId = "e2e-gift-message";
  const timestamp = new Date().toISOString();
  const headers = {
    "content-type": "application/json",
    "twitch-eventsub-message-id": messageId,
    "twitch-eventsub-message-timestamp": timestamp,
    "twitch-eventsub-message-type": "notification",
    "twitch-eventsub-message-signature": eventSubSignature(messageId, timestamp, Buffer.from(body), eventSubSecret("playwright-secret")!)
  };
  expect((await page.request.post("/api/eventsub/webhook", { data: body, headers })).status()).toBe(204);
  expect((await page.request.post("/api/eventsub/webhook", { data: body, headers })).status()).toBe(204);

  await signIn(page.context(), baseURL, admin);
  await page.goto("/admin/sub-picks");
  await page.getByRole("button", { name: "E2EGifter" }).click();
  await expect(page.getByRole("article", { name: /for E2EGifter/ })).toContainText("Tier 1 · Gifted subs ×3 · 3 entries");
  await expect(page.getByRole("article", { name: /for E2EGifter/ })).toContainText("From Twitch");
});

test("an admin creates the Twitch subscriptions from the Twitch tab", async ({ page, baseURL }) => {
  await signIn(page.context(), baseURL, admin);
  await page.goto("/admin/sub-picks?tab=twitch");
  await expect(page.getByRole("tab", { name: "Twitch", selected: true })).toBeVisible();
  await expect(page.getByText("retrodadson (Twitch ID 500)")).toBeVisible();
  await expect(page.getByText(`${baseURL}/api/eventsub/webhook`)).toBeVisible();
  await expect(page.getByRole("link", { name: "Authorise Subscriptions" })).toHaveAttribute("href", "/api/admin/eventsub/authorize");
  await expect(page.getByText("Missing", { exact: true })).toHaveCount(3);

  await page.getByRole("button", { name: "Create or Repair Subscriptions" }).click();
  await expect(page.getByText(/^Created 3\./)).toBeVisible();
  await expect(page.getByText("Active", { exact: true })).toHaveCount(3);

  await page.getByRole("button", { name: "Create or Repair Subscriptions" }).click();
  await expect(page.getByText("All three subscriptions are already in place.")).toBeVisible();
});

test("an admin gives an anonymous gift from the review queue to a viewer", async ({ page, baseURL }) => {
  const body = JSON.stringify({
    subscription: { id: "e2e-sub", type: "channel.subscription.gift", version: "1", status: "enabled" },
    event: { user_id: null, user_login: null, user_name: null, tier: "2000", total: 2, is_anonymous: true }
  });
  const messageId = "e2e-anonymous-gift";
  const timestamp = new Date().toISOString();
  const response = await page.request.post("/api/eventsub/webhook", {
    data: body,
    headers: {
      "content-type": "application/json",
      "twitch-eventsub-message-id": messageId,
      "twitch-eventsub-message-timestamp": timestamp,
      "twitch-eventsub-message-type": "notification",
      "twitch-eventsub-message-signature": eventSubSignature(messageId, timestamp, Buffer.from(body), eventSubSecret("playwright-secret")!)
    }
  });
  expect(response.status()).toBe(204);

  await signIn(page.context(), baseURL, admin);
  await page.goto("/admin/sub-picks");
  await page.getByRole("tab", { name: "Twitch (1 to review)" }).click();
  const gift = page.getByRole("listitem", { name: "Anonymous gift of 2 Tier 2 subs" });
  await gift.getByRole("button", { name: "Give to a Viewer" }).click();
  await gift.getByLabel("Twitch username").fill("PlaywrightSub");
  await gift.getByRole("button", { name: "Look Up" }).click();
  await gift.getByRole("button", { name: "Give to PlaywrightSub" }).click();
  await expect(page.getByText("Nothing to review.")).toBeVisible();
  await expect(page.getByRole("tab", { name: "Twitch", exact: true })).toBeVisible();

  await page.getByRole("tab", { name: "Entries" }).click();
  await page.getByRole("button", { name: "PlaywrightSub" }).click();
  await expect(page.getByRole("article", { name: /for PlaywrightSub/ }).filter({ hasText: "Anonymous gift given by PlaywrightAdmin" })).toContainText("Tier 2 · Gifted subs ×2 · 4 entries");
});
