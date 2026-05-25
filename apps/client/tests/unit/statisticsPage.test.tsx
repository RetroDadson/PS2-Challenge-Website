import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Statistics } from "../../src/pages/Statistics.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Statistics page", () => {
  it("calculates challenge, yearly, collection, and ownership statistics like the C# page", async () => {
    mockFetch({
      "GET /api/games": [
        { id: 1, title: "Game One", isExcluded: false, isOwned: true },
        { id: 2, title: "Game Two", isExcluded: true, isOwned: true },
        { id: 3, title: "Game Three", isExcluded: false, isOwned: false },
        { id: 4, title: "Game Four", isExcluded: false, isOwned: true }
      ],
      "GET /api/games/progress": [
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
        },
        {
          progressId: 3,
          gameId: 4,
          gameTitle: "Game Four",
          dateStarted: "2025-04-01",
          dateFinished: null,
          completionTime: null,
          platform: "Physical"
        }
      ],
      "GET /api/games/owned-types": {
        1: "CIB",
        2: "Loose",
        4: "CIB"
      }
    });

    render(<Statistics />);

    expect(await screen.findByRole("heading", { name: "Challenge Status" })).toBeInTheDocument();
    expect(statValue("Games Completed")).toBe("2");
    expect(statValue("Games in Challenge")).toBe("3");
    expect(statValue("Games Remaining")).toBe("1");
    expect(statValue("Challenge Complete")).toBe("66.67%");
    expect(statValue("Average Game Duration")).toBe("8h");
    expect(statValue("Estimated Time Remaining")).toBe("8h");

    const durationChart = screen.getByRole("heading", { name: "Game Duration (hours)" }).closest(".duration-chart-card") as HTMLElement;
    expect(durationChart).toBeInTheDocument();
    expect(within(durationChart).getByText("Game Duration (hours)")).toBeInTheDocument();
    expect(within(durationChart).getByText("Game Completion Number")).toBeInTheDocument();
    expect(within(durationChart).getByRole("button", { name: "Zoom in" })).toBeInTheDocument();
    expect(within(durationChart).getByRole("button", { name: "Zoom out" })).toBeInTheDocument();
    expect(within(durationChart).getByRole("button", { name: "Reset Zoom" })).toBeInTheDocument();
    const firstPoint = within(durationChart).getByLabelText("Game #1 Game One duration 10h 30m completed 2024-03-05");
    expect(firstPoint).toBeInTheDocument();
    expect(within(durationChart).getByLabelText("Game #2 Game Three duration 5h 30m completed 2025-01-03")).toBeInTheDocument();
    expect(within(durationChart).queryByRole("list", { name: "Game duration data" })).not.toBeInTheDocument();
    fireEvent.mouseEnter(firstPoint);
    expect(within(durationChart).getByRole("tooltip")).toHaveTextContent("Game One");
    expect(within(durationChart).getByRole("tooltip")).toHaveTextContent("10h 30m");
    expect(within(durationChart).getByRole("tooltip")).toHaveTextContent("2024-03-05");

    expect(statValue("Games Collected in Challenge")).toBe("2");
    expect(statValue("Collected but Excluded")).toBe("1");
    expect(statValue("Total Games Owned")).toBe("3");
    expect(statValue("Challenge Collection Rate")).toBe("66.67%");
    expect(statValue("Total Collection Rate")).toBe("75.00%");

    const collectionSection = screen.getByRole("region", { name: "Collection Statistics" });
    expect(within(collectionSection).getByText("Challenge Collection Progress")).toBeInTheDocument();
    expect(within(collectionSection).getByText("2 / 3 games")).toBeInTheDocument();
    expect(within(collectionSection).getByText("66.7%")).toBeInTheDocument();
    expect(within(collectionSection).getByText("Total Collection Progress")).toBeInTheDocument();
    expect(within(collectionSection).getByText("3 / 4 games")).toBeInTheDocument();
    expect(within(collectionSection).getByText("75.0%")).toBeInTheDocument();

    const yearlySection = screen.getByRole("heading", { name: "Game Completion by Year" }).closest(".panel") as HTMLElement;
    expect(yearlySection).toBeInTheDocument();
    expect(within(yearlySection).getByRole("row", { name: /2025 2 1 33.33%/i })).toBeInTheDocument();
    expect(within(yearlySection).getByRole("row", { name: /2024 1 1 33.33%/i })).toBeInTheDocument();
    expect(within(yearlySection).getByRole("row", { name: /Total 3 2 66.67%/i })).toBeInTheDocument();

    const ownershipSection = screen.getByRole("heading", { name: "Ownership Type Distribution" }).closest(".ownership-breakdown") as HTMLElement;
    expect(ownershipSection).toBeInTheDocument();
    expect(within(ownershipSection).getByText("CIB")).toBeInTheDocument();
    expect(within(ownershipSection).getByText("2 (66.7%)")).toBeInTheDocument();
    expect(within(ownershipSection).getByText("Loose")).toBeInTheDocument();
    expect(within(ownershipSection).getByText("1 (33.3%)")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "More Statistics Coming Soon" })).toBeInTheDocument();
  });
});

function statValue(label: string) {
  const card = screen.getAllByRole("article").find((article) => within(article).queryByText(label));
  if (!card) throw new Error(`Could not find stat card for ${label}`);
  return within(card).getByTestId("stat-value").textContent;
}

function mockFetch(routes: Record<string, unknown>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const rawUrl = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const path = rawUrl.startsWith("http") ? new URL(rawUrl).pathname : rawUrl;
      const route = routes[`GET ${path}`];
      if (route === undefined) {
        return new Response(JSON.stringify({ message: "Not Found" }), { status: 404 });
      }
      return new Response(JSON.stringify(route), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    })
  );
}
