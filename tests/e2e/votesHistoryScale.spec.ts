import { expect, test } from "./test.js";

const VOTE_ROUND_COUNT = 60;

test("Vote history table header stays fixed while scrolling", async ({ page }) => {
  await page.route("**/api/votes/history", async (route) => {
    await route.fulfill({ json: largeVoteHistory(VOTE_ROUND_COUNT) });
  });
  await page.route("**/api/votes/current", async (route) => {
    await route.fulfill({ json: [] });
  });
  await page.route("**/api/games", async (route) => {
    await route.fulfill({ json: [] });
  });

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/votes");
  await expect(page.getByRole("heading", { name: "Votes", exact: true })).toBeVisible();
  await expect(page.getByText(`Showing ${VOTE_ROUND_COUNT} of ${VOTE_ROUND_COUNT} rounds`)).toBeVisible();

  const tableHeader = page.locator(".votes-history-table thead th").first();
  await page.mouse.wheel(0, 800);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  expect((await tableHeader.boundingBox())?.y).toBeCloseTo(0, 0);
  await page.mouse.wheel(0, 800);
  expect((await tableHeader.boundingBox())?.y).toBeCloseTo(0, 0);
});

function largeVoteHistory(count: number) {
  const rounds = [];
  for (let voteRound = 1; voteRound <= count; voteRound++) {
    rounds.push({
      voteRound,
      topGameTitle: `Top Game ${voteRound}`,
      topVotes: 10,
      topPosition: 1,
      secondGameTitle: `Second Game ${voteRound}`,
      secondVotes: 6,
      secondPosition: 2,
      lastGameTitle: `Last Game ${voteRound}`,
      lastVotes: 2,
      lastPosition: 3,
      notes: null
    });
  }
  return rounds;
}
