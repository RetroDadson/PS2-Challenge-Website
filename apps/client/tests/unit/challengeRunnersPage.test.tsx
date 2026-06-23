import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChallengeRunners } from "../../src/pages/ChallengeRunners.js";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("ChallengeRunners", () => {
  it("renders descriptions and available channel links without edit controls for visitors", async () => {
    mockApi({
      user: { isAuthenticated: false },
      runners: [
        runner({ youtubeUrl: "https://www.youtube.com/@runnerone" }),
        runner({ id: 2, name: "Runner Two", description: "A North American PS2 challenge.", twitchUrl: null, youtubeUrl: "https://www.youtube.com/@runnertwo", logoUrl: null })
      ]
    });

    render(<ChallengeRunners />);

    expect(await screen.findByRole("heading", { name: "Other Challenge Runners" })).toBeInTheDocument();
    expect(screen.getByText("Completing every PAL PS2 game.")).toBeInTheDocument();
    expect(screen.getByAltText("Runner One logo")).toHaveAttribute("src", "https://static-cdn.jtvnw.net/runnerone.png");
    expect(screen.getByLabelText("No logo available for Runner Two")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Twitch for Runner One" })).toHaveAttribute("href", "https://www.twitch.tv/runnerone");
    expect(screen.getByRole("link", { name: "YouTube for Runner Two" })).toHaveAttribute("href", "https://www.youtube.com/@runnertwo");
    expect(screen.getByText("Twitch not listed")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add Runner" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit Runner One" })).not.toBeInTheDocument();
  });

  it("lets admins add, edit, and delete runners from the runners page", async () => {
    const state: Runner[] = [];
    mockApi({ user: { isAuthenticated: true, role: "Admin" }, runners: state });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<ChallengeRunners />);

    expect(await screen.findByText("No challenge runners have been added yet.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add Runner" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Runner One" } });
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Original challenge description" } });
    fireEvent.change(screen.getByLabelText("Twitch URL"), { target: { value: "https://www.twitch.tv/runnerone" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Runner" }));

    fireEvent.click(await screen.findByRole("button", { name: "Edit Runner One" }));
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Updated challenge description" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Runner" }));
    await waitFor(() => expect(screen.getByText("Updated challenge description")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Edit Runner One" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(screen.getByText("No challenge runners have been added yet.")).toBeInTheDocument());
    expect(window.confirm).toHaveBeenCalled();
  });

  it("validates channel links and preserves failed or cancelled edits", async () => {
    const state = [runner()];
    const calls = mockApi({ user: { isAuthenticated: true, role: "Admin" }, runners: state, failUpdates: true });
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<ChallengeRunners />);

    fireEvent.click(await screen.findByRole("button", { name: "Add Runner" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Runner Two" } });
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Another challenge" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Runner" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Add at least one Twitch or YouTube URL.");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    fireEvent.click(screen.getByRole("button", { name: "Edit Runner One" }));
    fireEvent.click(screen.getByRole("button", { name: "Save Runner" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not save runner");
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(window.confirm).toHaveBeenCalled();
    expect(calls.some((call) => call.method === "DELETE")).toBe(false);
  });

  it("shows an empty state", async () => {
    mockApi({ user: { isAuthenticated: false }, runners: [] });
    render(<ChallengeRunners />);
    expect(await screen.findByText("No challenge runners have been added yet.")).toBeInTheDocument();
  });

  it("shows API failures", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const path = typeof input === "string" ? input : input instanceof URL ? input.pathname : new URL(input.url).pathname;
      return path === "/api/auth/user"
        ? json({ isAuthenticated: false })
        : json({ message: "Runner service unavailable" }, 503);
    }));
    render(<ChallengeRunners />);
    expect(await screen.findByText("Runner service unavailable")).toHaveClass("error");
  });
});

type Runner = {
  id: number;
  name: string;
  description: string;
  twitchUrl: string | null;
  youtubeUrl: string | null;
  logoUrl: string | null;
};

type ApiCall = { method: string; path: string };

function mockApi({ user, runners, failUpdates = false }: { user: Record<string, unknown>; runners: Runner[]; failUpdates?: boolean }) {
  const calls: ApiCall[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = typeof input === "string" ? input : input instanceof URL ? input.pathname : new URL(input.url).pathname;
    const method = (init?.method ?? "GET").toUpperCase();
    calls.push({ method, path });
    if (path === "/api/auth/user") return json(user);
    if (method === "GET" && path === "/api/challenge-runners") return json(runners);
    if (method === "POST") {
      const created = { id: 1, ...JSON.parse(String(init?.body)), logoUrl: "https://static-cdn.jtvnw.net/runnerone.png" } as Runner;
      runners.push(created);
      return json(created, 201);
    }
    if (method === "PUT") {
      if (failUpdates) return json({ message: "Could not save runner" }, 500);
      runners[0] = { id: 1, ...JSON.parse(String(init?.body)), logoUrl: "https://static-cdn.jtvnw.net/runnerone.png" } as Runner;
      return json(runners[0]);
    }
    if (method === "DELETE") {
      runners.splice(0, 1);
      return json({ message: "Challenge runner deleted" });
    }
    return json({ message: "Not Found" }, 404);
  }));
  return calls;
}

function runner(overrides: Partial<Runner> = {}): Runner {
  return {
    id: 1,
    name: "Runner One",
    description: "Completing every PAL PS2 game.",
    twitchUrl: "https://www.twitch.tv/runnerone",
    youtubeUrl: null,
    logoUrl: "https://static-cdn.jtvnw.net/runnerone.png",
    ...overrides
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
