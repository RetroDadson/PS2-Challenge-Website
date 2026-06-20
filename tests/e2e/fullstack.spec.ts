import type { BrowserContext } from "@playwright/test";
import { authCookieName, createSessionCookie } from "../../apps/server/src/auth/session.js";
import { expect, expectNoUnexpectedBrowserErrors, test, watchForUnexpectedBrowserErrors } from "./test.js";

const cookieSecret = process.env.PLAYWRIGHT_COOKIE_SECRET ?? "playwright-cookie-secret";

test.describe.configure({ mode: "serial" });

test("public pages load seeded data through Fastify and Postgres", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/games");

  await expect(page.getByRole("heading", { name: "PS2 Games Library" })).toBeVisible();
  await expect(page.getByText(/Showing 5 of 6 games \| Owned: 5 \| Excluded: 1 \| Completed: 1 \| In Progress: 1 \| Not Started: 3/)).toBeVisible();
  await expect(page.getByLabel("Amplitude. Alternate titles: Amplitude: Special Edition")).toBeVisible();
  await expect(page.getByRole("cell", { name: "Boogie" })).toBeHidden();

  await page.getByLabel("Show Excluded Games").check();
  await expect(page.getByRole("cell", { name: "Boogie" })).toBeVisible();
  await expect(page.getByText("Excluded", { exact: true }).first()).toBeVisible();
  await expect(page).toHaveScreenshot("games-seeded.png", { animations: "disabled", fullPage: false, maxDiffPixelRatio: 0.08 });

  await page.getByRole("button", { name: "Customise Columns" }).click();
  const columnDialog = page.getByRole("dialog", { name: "Customise Game Columns" });
  await columnDialog.getByLabel("Drag Status column").dragTo(columnDialog.getByLabel("Drag How Long To Beat Time column"));
  await columnDialog.getByRole("button", { name: "Done" }).click();
  await expect(page.locator(".games-table thead th").nth(0)).toHaveText("Cover");
  await expect(page.locator(".games-table thead th").nth(1)).toContainText("Title");
  await expect(page.locator(".games-table thead th").nth(2)).toHaveText("Status");
  await page.reload();
  await expect(page.locator(".games-table thead th").nth(2)).toHaveText("Status");

  await page.goto("/statistics");
  await expect(page.getByRole("heading", { name: "Challenge Statistics" })).toBeVisible();
  await expect(page.getByText("Challenge Collection Progress")).toBeVisible();
  await expect(page.getByRole("img", { name: "Game duration line chart" })).toBeVisible();
  await page.getByLabel("Game #1 Amplitude duration 4h 30m completed 2024-01-03").hover();
  const durationTooltip = page.getByRole("tooltip");
  await expect(durationTooltip).toContainText("Game #1");
  await expect(durationTooltip).toContainText("Amplitude");
  await expect(durationTooltip).toContainText("4h 30m");
  await expect(durationTooltip).toHaveClass(/duration-tooltip-below/);
  const durationPointBox = await page.getByLabel("Game #1 Amplitude duration 4h 30m completed 2024-01-03").boundingBox();
  const durationTooltipBox = await durationTooltip.boundingBox();
  expect(durationTooltipBox).not.toBeNull();
  expect(durationPointBox).not.toBeNull();
  expect(durationTooltipBox!.y).toBeGreaterThan(durationPointBox!.y);
  const tooltipZIndex = await durationTooltip.evaluate((element) => Number(getComputedStyle(element).zIndex));
  const chartFrameOverflow = await page.locator(".duration-chart-frame").evaluate((element) => getComputedStyle(element).overflow);
  expect(tooltipZIndex).toBeGreaterThan(2);
  expect(chartFrameOverflow).toBe("visible");
  const statusCards = page.locator("section[aria-labelledby='challenge-status-heading'] article.stat");
  await expect(statusCards).toHaveCount(8);
  await expect(statusCards.locator(".stat-icon svg")).toHaveCount(8);
  await expect(statusCards.filter({ hasText: "Games Completed" }).locator("[data-testid='stat-value']")).toHaveText("1");
  await expect(statusCards.filter({ hasText: "Games in Challenge" }).locator("[data-testid='stat-value']")).toHaveText("5");
  await expect(statusCards.filter({ hasText: "Games Remaining" }).locator("[data-testid='stat-value']")).toHaveText("4");
  await expect(statusCards.filter({ hasText: "Challenge Complete" }).locator("[data-testid='stat-value']")).toHaveText("20.00%");
  await expect(statusCards.filter({ hasText: "Average Game Duration" }).locator("[data-testid='stat-value']")).toHaveText("4h 30m");
  await expect(statusCards.filter({ hasText: "Estimated Game Time Remaining" }).locator("[data-testid='stat-value']")).toHaveText("18h");
  await expect(statusCards.filter({ hasText: "Average Weekly Stream Time" }).locator("[data-testid='stat-value']")).toHaveText("0m");
  await expect(statusCards.filter({ hasText: "Estimated Streaming Time Remaining" }).locator("[data-testid='stat-value']")).toHaveText("N/A");
  await expect(page).toHaveScreenshot("statistics-seeded.png", { animations: "disabled", fullPage: false, maxDiffPixelRatio: 0.08 });
  const collectionCards = page.locator("section[aria-labelledby='collection-statistics-heading'] article.stat");
  await expect(collectionCards).toHaveCount(5);
  await expect(collectionCards.locator(".stat-icon svg")).toHaveCount(5);
  await expect(collectionCards.filter({ hasText: "Games Collected in Challenge" }).locator("[data-testid='stat-value']")).toHaveText("5");
  await expect(collectionCards.filter({ hasText: "Collected but Excluded" }).locator("[data-testid='stat-value']")).toHaveText("0");
  await expect(collectionCards.filter({ hasText: "Total Games Owned" }).locator("[data-testid='stat-value']")).toHaveText("5");
  await expect(collectionCards.filter({ hasText: "Challenge Collection Rate" }).locator("[data-testid='stat-value']")).toHaveText("100.00%");
  await expect(collectionCards.filter({ hasText: "Total Collection Rate" }).locator("[data-testid='stat-value']")).toHaveText("83.33%");

  await page.goto("/votes");
  await expect(page.getByRole("heading", { name: "Votes", exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Amplitude", exact: true }).first()).toBeVisible();
  await expect(page.getByText("Amplitude: 4 (80.0%)")).toBeVisible();
  await expect(page).toHaveScreenshot("votes-seeded.png", { animations: "disabled", fullPage: false, maxDiffPixelRatio: 0.08 });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/votes");
  await expect(page.getByRole("heading", { name: "Votes", exact: true })).toBeVisible();
  await expect(page).toHaveScreenshot("votes-mobile-seeded.png", { animations: "disabled", fullPage: false, maxDiffPixelRatio: 0.12 });
  await page.setViewportSize({ width: 1280, height: 900 });

  await page.goto("/progress-overlay");
  await expect(page.getByText("Games Completed")).toBeVisible();
  await expect(page.getByText("1 / 5")).toBeVisible();
  await expect(page.locator(".progress-overlay-frame")).toHaveScreenshot("progress-overlay-seeded.png", { animations: "disabled", maxDiffPixelRatio: 0.08 });

  await page.goto("/swagger");
  await expect(page.getByText("PS2 Challenge API")).toBeVisible();
});

test("permissions protect admin screens and mutations for anonymous and non-admin users", async ({ page, baseURL }) => {
  const anonymousCreate = await page.request.post("/api/games", { data: validGamePayload("Anonymous Blocked Game") });
  expect(anonymousCreate.status()).toBe(401);

  await signInAsUser(page.context(), baseURL);

  const forbiddenCreate = await page.request.post("/api/games", { data: validGamePayload("User Blocked Game") });
  expect(forbiddenCreate.status()).toBe(403);

  const forbiddenVoteUpdate = await page.request.put("/api/votes/current/by-game-number", { data: { gameNumber: 1, voteCount: 99 } });
  expect(forbiddenVoteUpdate.status()).toBe(403);

  const adminPage = await page.context().newPage();
  await adminPage.goto("/admin");
  await expect(adminPage.getByRole("heading", { name: "Access Denied" })).toBeVisible();
  await adminPage.close();

  await page.goto("/games");
  await expect(page.getByRole("button", { name: "Add New Game" })).toHaveCount(0);
  await page.getByRole("button", { name: "Customise Columns" }).click();
  const columnDialog = page.getByRole("dialog", { name: "Customise Game Columns" });
  await columnDialog.getByLabel("Drag Status column").dragTo(columnDialog.getByLabel("Drag How Long To Beat Time column"));
  await columnDialog.getByRole("button", { name: "Done" }).click();
  await expect.poll(async () => {
    const response = await page.request.get("/api/user/preferences/game-table-columns");
    const body = await response.json() as { preferences?: { order?: string[] } };
    return body.preferences?.order?.slice(0, 3);
  }).toEqual(["cover", "title", "status"]);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator(".games-table thead th").nth(2)).toHaveText("Status");

  await page.goto("/votes");
  await expect(page.getByRole("button", { name: "Add" })).toHaveCount(0);
  await expect(page.getByLabel("Votes for Amplitude")).toHaveCount(0);
});

test("admin maintenance and user profile journeys use the real API", async ({ page, baseURL }) => {
  await signInAsAdmin(page.context(), baseURL);

  await page.goto("/user");
  await expect(page.getByRole("heading", { name: "PlaywrightAdmin" })).toBeVisible();
  await expect(page).toHaveScreenshot("user-profile-seeded.png", { animations: "disabled", fullPage: false, maxDiffPixelRatio: 0.08 });
  const apiKey = page.getByRole("textbox", { name: "API key" });
  const previousApiKey = await apiKey.inputValue();
  await page.getByRole("button", { name: "Show API key" }).click();
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "Regenerate" }).click();
  await expect.poll(() => apiKey.inputValue()).not.toBe(previousApiKey);
  await expect(page.getByRole("button", { name: "Hide API key" })).toBeVisible();

  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Admin Panel" })).toBeVisible();
  await page.getByLabel("Role for PlaywrightUser").selectOption({ label: "Admin" });
  await expect(page.getByText("Role updated")).toBeVisible();
  await expect(page.getByRole("row", { name: /PlaywrightUser.*Admin/ })).toBeVisible();

  await page.getByRole("button", { name: "Update Cover Images Now" }).click();
  const coverProgress = page.getByLabel("Cover refresh progress");
  await expect(coverProgress).toHaveAttribute("value", "6", { timeout: 10_000 });
  await expect(coverProgress).toHaveAttribute("max", "6");
  await expect(page.getByText("Update completed. Updated: 2, Skipped: 4, Errors: 0")).toBeVisible();
  await expect(page).toHaveScreenshot("admin-cover-refresh-complete.png", { animations: "disabled", fullPage: false, maxDiffPixelRatio: 0.08 });
});

test("admin API validation returns parity errors for invalid writes", async ({ page, baseURL }) => {
  await signInAsAdmin(page.context(), baseURL);

  const duplicateGame = await page.request.post("/api/games", { data: validGamePayload("Amplitude") });
  expect(duplicateGame.status()).toBe(409);
  expect(await duplicateGame.json()).toEqual({ error: "A game with the title 'Amplitude' already exists with ID 1" });

  const missingExclusionReason = await page.request.put("/api/games/1/exclusion", { data: { isExcluded: true } });
  expect(missingExclusionReason.status()).toBe(400);
  expect(await missingExclusionReason.json()).toEqual({ message: "Reason is required when excluding a game" });

  const invalidProgress = await page.request.post("/api/games/progress", { data: { title: "", dateStarted: "2024-01-01", platform: "" } });
  expect(invalidProgress.status()).toBe(400);
  expect(await invalidProgress.json()).toEqual({ errors: ["Title is required", "Platform is required"] });

  const badVoteNumber = await page.request.put("/api/votes/current/by-game-number", { data: { gameNumber: 4, voteCount: 1 } });
  expect(badVoteNumber.status()).toBe(400);
  expect(await badVoteNumber.json()).toEqual({ message: "Game number must be between 1 and 3" });

  const negativeVoteCount = await page.request.put("/api/votes/current/by-game-number", { data: { gameNumber: 1, voteCount: -1 } });
  expect(negativeVoteCount.status()).toBe(400);
  expect(await negativeVoteCount.json()).toEqual({ message: "Vote count cannot be negative" });

  const createdSerial = await page.request.post("/api/games/serial-numbers", {
    data: { title: "Amplitude", serialNumber: "SLUS-DUPE", region: "NTSC-U", notes: "Validation fixture" }
  });
  expect(createdSerial.status()).toBe(200);

  const duplicateSerial = await page.request.post("/api/games/serial-numbers", {
    data: { title: "Burnout 3: Takedown", serialNumber: "SLUS-DUPE", region: "PAL", notes: "Duplicate fixture" }
  });
  expect(duplicateSerial.status()).toBe(409);
  expect(await duplicateSerial.json()).toEqual({
    error: "Serial number 'SLUS-DUPE' already exists",
    existingGameId: 1,
    existingGameTitle: "Amplitude",
    serialNumber: "SLUS-DUPE"
  });
});

test("admin vote updates, archiving, and fill-random flow through API and websocket overlay", async ({ page, baseURL }) => {
  await signInAsAdmin(page.context(), baseURL);

  const overlay = await page.context().newPage();
  const overlayFailures = watchForUnexpectedBrowserErrors(overlay);
  await overlay.goto("/votes-overlay");
  await expect(overlay.getByText("Game 1: 4")).toBeVisible();

  await page.goto("/votes");
  await expect(page.getByText("PlaywrightAdmin")).toBeVisible();

  const amplitudeVotes = page.getByLabel("Votes for Amplitude");
  await expect(amplitudeVotes).toHaveValue("4");
  await amplitudeVotes.fill("9");

  await expect(amplitudeVotes).toHaveValue("9");
  await expect(overlay.getByText("Game 1: 9")).toBeVisible({ timeout: 5_000 });

  await page.getByRole("button", { name: "Archive to History" }).click();
  const archiveDialog = page.getByRole("dialog");
  await archiveDialog.getByLabel("Notes").fill("E2E archive");
  await archiveDialog.getByRole("button", { name: "Archive", exact: true }).click();
  await expect(archiveDialog).toBeHidden();
  await expect(page.getByText("No current votes configured. Add games below.")).toBeVisible();
  await expect(overlay.getByText("No current votes")).toBeVisible({ timeout: 5_000 });
  await expect(page.getByText("E2E archive").first()).toBeVisible();

  await page.getByRole("button", { name: "Fill with Random Games" }).click();
  await expect(page.locator(".current-votes-left tbody tr")).toHaveCount(3);
  await expect(overlay.locator(".vote-game-box")).toHaveCount(3, { timeout: 5_000 });

  await page.getByRole("button", { name: /^Remove / }).first().click();
  await expect(page.locator(".current-votes-left tbody tr")).toHaveCount(2);
  await expect(overlay.locator(".vote-game-box")).toHaveCount(2, { timeout: 5_000 });

  expectNoUnexpectedBrowserErrors(overlayFailures);
  await overlay.close();
});

test("admin progress journey creates and edits real progress records", async ({ page, baseURL }) => {
  await signInAsAdmin(page.context(), baseURL);

  await page.goto("/progress");
  await page.getByRole("button", { name: "Add New Game" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Game Title").fill("Bomberman Hardball");
  await dialog.getByLabel("Started").fill("2024-03-01");
  await dialog.getByLabel("Finished (optional)").fill("2024-03-04");
  await dialog.getByLabel("Platform").selectOption("Physical");
  await dialog.getByLabel("Beaten Criteria").fill("Credits");
  await dialog.getByLabel("Review").fill("Full-stack progress review");
  await dialog.getByLabel("hours").fill("6");
  await dialog.getByLabel("minutes").fill("15");
  await dialog.getByLabel("seconds").fill("30");
  await dialog.getByRole("button", { name: "Add" }).click();

  await expect(page.getByRole("cell", { name: "Bomberman Hardball", exact: true })).toBeVisible();
  await expect(page.getByText("06:15:30")).toBeVisible();
  await expect(page.getByText("Full-stack progress review")).toBeVisible();

  await page.getByRole("button", { name: "Edit Bomberman Hardball" }).click();
  await dialog.getByLabel("Review").fill("Updated from Playwright");
  await dialog.getByRole("button", { name: "Update" }).click();
  await expect(page.getByText("Updated from Playwright")).toBeVisible();
  await expect(page).toHaveScreenshot("progress-updated.png", { animations: "disabled", fullPage: false, maxDiffPixelRatio: 0.08 });
});

test("admin game management covers create, ownership, exclusion, serials, and alternate titles", async ({ page, baseURL }) => {
  await signInAsAdmin(page.context(), baseURL);

  await page.goto("/games");
  await page.getByLabel("Show Excluded Games").check();
  await page.getByRole("button", { name: "Add New Game" }).click();

  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Title", { exact: true }).fill("Full Stack Fixture");
  await dialog.getByLabel("Developer").fill("Fixture Developer");
  await dialog.getByLabel("Publisher").fill("Fixture Publisher");
  await dialog.getByLabel("First Released", { exact: true }).fill("2005-05-05");
  await dialog.getByLabel("Region First Released", { exact: true }).fill("EU");
  await dialog.getByLabel("Released in EU/PAL or NA").check();

  const serialSection = dialog.locator(".modal-section").filter({ hasText: "Serial Numbers" });
  await serialSection.getByLabel("Serial Number").fill("SLUS-99999");
  await serialSection.getByLabel("Region").fill("NTSC-U");
  await serialSection.getByLabel("Notes").fill("E2E serial");
  await serialSection.getByRole("button", { name: "Add Serial Number" }).click();

  const alternateSection = dialog.locator(".modal-section").filter({ hasText: "Alternate Titles" });
  await alternateSection.getByLabel("Alternate Title").fill("Full Stack Fixture Alt");
  await alternateSection.getByLabel("Notes").fill("E2E alternate");
  await alternateSection.getByRole("button", { name: "Add Alternate Title" }).click();

  await dialog.getByLabel("Own Physical Copy").check();
  await dialog.getByLabel("Type Owned").selectOption("Base");
  await dialog.getByLabel("Exclude from Challenge").check();
  await dialog.getByLabel("Exclusion Reason").fill("E2E excluded");
  await dialog.getByRole("button", { name: "Save" }).click();

  await expect(dialog).toBeHidden();
  await page.getByPlaceholder("Search games by title, developer, or publisher...").fill("Full Stack Fixture");
  await expect(page.getByRole("row", { name: /Full Stack Fixture.*Fixture Developer.*Fixture Publisher.*Excluded.*Base/ })).toBeVisible();

  await page.getByRole("button", { name: "Edit Full Stack Fixture" }).click();
  await expect(dialog.getByText("SLUS-99999")).toBeVisible();
  await expect(dialog.getByText("Full Stack Fixture Alt")).toBeVisible();
  await dialog.getByRole("button", { name: "Remove SLUS-99999" }).click();
  await dialog.getByRole("button", { name: "Remove Full Stack Fixture Alt" }).click();
  await expect(dialog.getByText("SLUS-99999")).toBeHidden();
  await expect(dialog.getByText("Full Stack Fixture Alt")).toBeHidden();
  await dialog.getByRole("button", { name: "Save" }).click();

  await page.getByRole("button", { name: "Edit Full Stack Fixture" }).click();
  await expect(dialog.getByText("No serial numbers added yet.")).toBeVisible();
  await expect(dialog.getByText("No alternate titles added yet.")).toBeVisible();
  await expect(dialog.getByLabel("Own Physical Copy")).toBeChecked();
  await dialog.getByLabel("Own Physical Copy").uncheck();
  await dialog.getByLabel("Exclude from Challenge").uncheck();
  await dialog.getByRole("button", { name: "Save" }).click();

  await expect(dialog).toBeHidden();
  await expect(page.getByRole("row", { name: /Full Stack Fixture.*Included.*To Purchase/ })).toBeVisible();

  await page.getByRole("button", { name: "Edit Full Stack Fixture" }).click();
  await dialog.getByRole("button", { name: "Delete" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("No games found.")).toBeVisible();

});

async function signInAsAdmin(context: BrowserContext, baseURL: string | undefined) {
  await signIn(context, baseURL, {
    id: 1,
    twitchId: "playwright-admin",
    username: "PlaywrightAdmin",
    role: "Admin",
    profileImageUrl: "/assets/glitch_flat_purple.svg"
  });
}

async function signInAsUser(context: BrowserContext, baseURL: string | undefined) {
  await signIn(context, baseURL, {
    id: 2,
    twitchId: "playwright-user",
    username: "PlaywrightUser",
    role: "User",
    profileImageUrl: null
  });
}

async function signIn(
  context: BrowserContext,
  baseURL: string | undefined,
  user: {
    id: number;
    twitchId: string;
    username: string;
    role: string;
    profileImageUrl: string | null;
  }
) {
  if (!baseURL) {
    throw new Error("Playwright baseURL is required for authenticated full-stack tests");
  }

  await context.addCookies([
    {
      name: authCookieName,
      value: createSessionCookie(user, cookieSecret),
      url: baseURL,
      httpOnly: true,
      sameSite: "Lax",
      secure: false
    }
  ]);
}

function validGamePayload(title: string) {
  return {
    title,
    developer: "Validation Developer",
    publisher: "Validation Publisher",
    firstReleased: "2005-01-01",
    regionFirstReleasedIn: "NA",
    releasedInEuPalOrNa: true,
    imageUrl: null
  };
}
