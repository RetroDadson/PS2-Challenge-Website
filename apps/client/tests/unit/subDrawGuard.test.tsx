import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, subDrawDueFrom } from "../../src/api.js";
import { ProgressModal } from "../../src/components/ProgressModal.js";
import { Votes } from "../../src/pages/Votes.js";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const draw = { gameNumber: 10, kind: "10s" as const, entryCount: 3 };
const dueMessage = "Game 10 is a sub pick game and 3 entries are waiting for the 10s draw. Run the draw, or start this game anyway.";

function dueResponse() {
  return new Response(JSON.stringify({ message: dueMessage, code: "sub_draw_due", subDraw: draw }), {
    status: 409,
    headers: { "content-type": "application/json" }
  });
}

describe("sub pick draw guard", () => {
  it("only reads draw details from draw-due API errors", () => {
    expect(subDrawDueFrom(new ApiError(dueMessage, 409, "sub_draw_due", draw))).toEqual(draw);
    expect(subDrawDueFrom(new ApiError("Nope", 409, "other", draw))).toBeNull();
    expect(subDrawDueFrom(new Error(dueMessage))).toBeNull();
  });

  it("offers to start a new game anyway from the progress modal", async () => {
    const onSave = vi
      .fn()
      .mockRejectedValueOnce(new ApiError(dueMessage, 409, "sub_draw_due", draw))
      .mockRejectedValueOnce(new Error("Database unavailable"))
      .mockResolvedValueOnce(undefined);
    render(<ProgressModal titles={["Chosen"]} onClose={vi.fn()} onSave={onSave} />);

    fireEvent.change(screen.getByPlaceholderText("Game title"), { target: { value: "Chosen" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    const notice = await screen.findByRole("alert");
    expect(notice).toHaveTextContent(dueMessage);
    expect(notice).toHaveTextContent("Starting game 10 anyway skips this 10s draw and is recorded in the sub picks audit log.");
    expect(within(notice).getByRole("link", { name: "Go to Sub Picks" })).toHaveAttribute("href", "/admin/sub-picks");
    expect(onSave.mock.calls[0]![0]).not.toHaveProperty("overrideSubDraw");

    fireEvent.click(within(notice).getByRole("button", { name: "Start Anyway" }));
    expect(await screen.findByText("Database unavailable")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start Anyway" })).not.toBeInTheDocument();
    expect(onSave.mock.calls[1]![0]).toMatchObject({ title: "Chosen", overrideSubDraw: true });

    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });

  it("archives votes and starts the winner anyway after a draw-due refusal", async () => {
    const archiveBodies: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
        const method = (init?.method ?? "GET").toUpperCase();
        const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
        if (method === "POST" && path === "/api/votes/archive") {
          archiveBodies.push(JSON.parse(String(init?.body)));
          return archiveBodies.length === 1 ? dueResponse() : json({ message: "Current votes archived successfully", round: 1, archivedCount: 1 });
        }
        if (path === "/api/auth/user") return json({ isAuthenticated: true, username: "AdminUser", role: "Admin" });
        if (path === "/api/votes/current") return json([{ gameId: 1, gameTitle: "Game One", voteCount: 10, gameNumber: 1 }]);
        if (path === "/api/games/page-data") return json({ games: [], ownedTypes: {}, exclusionReasons: {}, completionStatus: {}, alternateTitles: {} });
        return json([]);
      })
    );
    render(<Votes />);

    fireEvent.click(await screen.findByRole("button", { name: "Archive to History" }));
    const dialog = await screen.findByRole("dialog", { name: "Archive Current Votes to History" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Archive" }));

    const notice = await within(dialog).findByRole("alert");
    expect(notice).toHaveTextContent(dueMessage);
    fireEvent.click(within(notice).getByRole("button", { name: "Archive and Start Anyway" }));

    await waitFor(() => expect(archiveBodies).toHaveLength(2));
    expect(archiveBodies[0]).not.toHaveProperty("overrideSubDraw");
    expect(archiveBodies[1]).toMatchObject({ overrideSubDraw: true });
  });
});
