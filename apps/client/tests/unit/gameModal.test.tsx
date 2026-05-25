import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { GameDto } from "@ps2-challenge/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GameModal } from "../../src/components/GameModal.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GameModal", () => {
  it("loads and manages serials, alternate titles, ownership, and exclusion fields", async () => {
    const calls = mockFetch({
      "GET /api/games/ownership-types": [{ typeOwned: "Base" }, { typeOwned: "Platinum" }],
      "GET /api/games/owned-types": { 1: "Platinum" },
      "GET /api/games/1/serial-numbers": [
        { serialId: 1, gameId: 1, serialNumber: "SLUS-10000", region: "NTSC-U", notes: "Original" }
      ],
      "GET /api/games/1/alternate-titles": [
        { alternateTitleId: 1, gameId: 1, title: "Regional Name", notes: "PAL" }
      ],
      "POST /api/games/serial-numbers": {
        serialId: 2,
        gameId: 1,
        gameTitle: "Edited Game",
        serialNumber: "SCES-20000",
        region: "PAL",
        notes: "European",
        message: "Serial number 'SCES-20000' added successfully to 'Edited Game'"
      },
      "POST /api/games/1/alternate-titles": {
        alternateTitleId: 2,
        gameId: 1,
        title: "Alt Two",
        notes: "Second",
        message: "Alternate title 'Alt Two' added successfully to 'Edited Game'"
      },
      "PUT /api/games/1/ownership": { message: "Game 'Edited Game' has been marked as owned" },
      "PUT /api/games/1/exclusion": { message: "Game 'Edited Game' has been excluded" }
    });
    const onSave = vi.fn().mockResolvedValue({ ...game, title: "Edited Game" });
    const onClose = vi.fn();

    render(<GameModal game={game} onClose={onClose} onSave={onSave} />);

    expect(screen.getByRole("dialog", { name: "Edit Edited Game" })).toBeInTheDocument();
    expect(await screen.findByText("SLUS-10000")).toBeInTheDocument();
    expect(screen.getByLabelText("First Released")).toHaveValue("2004-01-01");
    expect(screen.getByText("Regional Name")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Serial Number"), { target: { value: "SCES-20000" } });
    fireEvent.change(screen.getByLabelText("Region"), { target: { value: "PAL" } });
    fireEvent.change(screen.getAllByLabelText("Notes", { selector: "input" })[0]!, { target: { value: "European" } });
    fireEvent.click(screen.getByRole("button", { name: "Add Serial Number" }));
    expect(await screen.findByText("SCES-20000")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Alternate Title"), { target: { value: "Alt Two" } });
    fireEvent.change(screen.getAllByLabelText("Notes", { selector: "input" })[1]!, { target: { value: "Second" } });
    fireEvent.click(screen.getByRole("button", { name: "Add Alternate Title" }));
    expect(await screen.findByText("Alt Two")).toBeInTheDocument();

    await screen.findByRole("option", { name: "Platinum" });
    expect(screen.getByLabelText("Type Owned")).toHaveValue("Platinum");
    fireEvent.change(screen.getByLabelText("Type Owned"), { target: { value: "Platinum" } });
    fireEvent.change(screen.getByLabelText("Exclusion Reason"), { target: { value: "Duplicate compilation" } });

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ method: "POST", path: "/api/games/serial-numbers", body: expect.objectContaining({ serialNumber: "SCES-20000" }) }),
        expect.objectContaining({ method: "POST", path: "/api/games/1/alternate-titles", body: expect.objectContaining({ title: "Alt Two" }) }),
        expect.objectContaining({ method: "PUT", path: "/api/games/1/ownership", body: { ownPhysicalCopy: true, typeOwned: "Platinum" } }),
        expect.objectContaining({
          method: "PUT",
          path: "/api/games/1/exclusion",
          body: { isExcluded: true, reason: "Duplicate compilation" }
        })
      ])
    );
  });

  it("preserves the existing ownership type when saving an owned game unchanged", async () => {
    const calls = mockFetch({
      "GET /api/games/ownership-types": [{ typeOwned: "Base" }, { typeOwned: "Platinum" }],
      "GET /api/games/owned-types": { 1: "Platinum" },
      "GET /api/games/1/serial-numbers": [],
      "GET /api/games/1/alternate-titles": [],
      "PUT /api/games/1/ownership": { message: "Game 'Edited Game' has been marked as owned" },
      "PUT /api/games/1/exclusion": { message: "Game 'Edited Game' has been included" }
    });
    const onSave = vi.fn().mockResolvedValue(game);
    const onClose = vi.fn();

    render(<GameModal game={{ ...game, isExcluded: false }} onClose={onClose} onSave={onSave} />);

    await waitFor(() => expect(screen.getByLabelText("Type Owned")).toHaveValue("Platinum"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(calls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            method: "PUT",
            path: "/api/games/1/ownership",
            body: { ownPhysicalCopy: true, typeOwned: "Platinum" }
          })
        ])
      )
    );
    expect(onClose).toHaveBeenCalled();
  });

  it("saves ownership removal from the latest checkbox value", async () => {
    const calls = mockFetch({
      "GET /api/games/ownership-types": [{ typeOwned: "Base" }, { typeOwned: "Platinum" }],
      "GET /api/games/owned-types": { 1: "Base" },
      "GET /api/games/1/serial-numbers": [],
      "GET /api/games/1/alternate-titles": [],
      "PUT /api/games/1/ownership": { message: "Ownership removed" },
      "PUT /api/games/1/exclusion": { message: "Included" }
    });
    const onSave = vi.fn().mockResolvedValue(game);
    const onClose = vi.fn();

    render(<GameModal game={{ ...game, isExcluded: false }} onClose={onClose} onSave={onSave} />);

    await waitFor(() => expect(screen.getByLabelText("Type Owned")).toHaveValue("Base"));
    fireEvent.click(screen.getByLabelText("Own Physical Copy"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(calls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            method: "PUT",
            path: "/api/games/1/ownership",
            body: { ownPhysicalCopy: false, typeOwned: "" }
          })
        ])
      )
    );
    expect(onClose).toHaveBeenCalled();
  });

  it("waits for the parent refresh hook before closing after a save", async () => {
    mockFetch({
      "GET /api/games/ownership-types": [{ typeOwned: "Base" }],
      "GET /api/games/owned-types": { 1: "Base" },
      "GET /api/games/1/serial-numbers": [],
      "GET /api/games/1/alternate-titles": [],
      "PUT /api/games/1/ownership": { message: "Owned" },
      "PUT /api/games/1/exclusion": { message: "Excluded" }
    });
    const order: string[] = [];
    const onSaved = vi.fn(async () => {
      order.push("saved");
    });
    const onClose = vi.fn(() => {
      order.push("closed");
    });

    render(<GameModal game={game} onClose={onClose} onSaved={onSaved} onSave={vi.fn().mockResolvedValue(game)} />);

    await screen.findByText("Ownership Status");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(order).toEqual(["saved", "closed"]);
  });

  it("builds create-mode relationship payloads after saving the new game", async () => {
    const calls = mockFetch({
      "GET /api/games/ownership-types": [{ typeOwned: "Base" }],
      "PUT /api/games/99/ownership": { message: "Ownership removed" },
      "PUT /api/games/99/exclusion": { message: "Included" },
      "POST /api/games/serial-numbers": { serialId: 1, gameId: 99, gameTitle: "New Game", serialNumber: "SLUS-99999" },
      "POST /api/games/99/alternate-titles": { alternateTitleId: 1, gameId: 99, title: "Alt Name" }
    });
    const onSave = vi.fn().mockResolvedValue({ id: 99, title: "New Game" });
    const onClose = vi.fn();

    render(<GameModal game={null} onClose={onClose} onSave={onSave} />);

    expect(await screen.findByRole("heading", { name: "Add New Game" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "New Game" } });
    fireEvent.change(screen.getByLabelText("Developer"), { target: { value: "Dev" } });
    fireEvent.change(screen.getByLabelText("Publisher"), { target: { value: "Pub" } });
    fireEvent.change(screen.getByLabelText("Region First Released"), { target: { value: "NA" } });
    fireEvent.change(screen.getByLabelText("Serial Number"), { target: { value: "SLUS-99999" } });
    fireEvent.click(screen.getByRole("button", { name: "Add Serial Number" }));
    expect(await screen.findByText("SLUS-99999")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Serial Number"), { target: { value: "slus-99999" } });
    fireEvent.click(screen.getByRole("button", { name: "Add Serial Number" }));
    expect(await screen.findByText("Serial number 'slus-99999' is already in the list.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Alternate Title"), { target: { value: "Alt Name" } });
    fireEvent.click(screen.getByRole("button", { name: "Add Alternate Title" }));
    expect(await screen.findByText("Alt Name")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ method: "PUT", path: "/api/games/99/ownership", body: { ownPhysicalCopy: false, typeOwned: "" } }),
        expect.objectContaining({ method: "PUT", path: "/api/games/99/exclusion", body: { isExcluded: false } }),
        expect.objectContaining({ method: "POST", path: "/api/games/serial-numbers", body: expect.objectContaining({ title: "New Game", serialNumber: "SLUS-99999" }) }),
        expect.objectContaining({ method: "POST", path: "/api/games/99/alternate-titles", body: { title: "Alt Name", notes: null } })
      ])
    );
  });

  it("wires the delete action for existing games", async () => {
    mockFetch({
      "GET /api/games/ownership-types": [],
      "GET /api/games/owned-types": {},
      "GET /api/games/1/serial-numbers": [],
      "GET /api/games/1/alternate-titles": []
    });
    const onDelete = vi.fn().mockResolvedValue(undefined);

    render(<GameModal game={game} onClose={vi.fn()} onSave={vi.fn()} onDelete={onDelete} />);

    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));

    expect(onDelete).toHaveBeenCalledWith(1);
  });
});

const game: GameDto = {
  id: 1,
  title: "Edited Game",
  developer: "Dev",
  publisher: "Pub",
  firstReleased: "2004-01-01T00:00:00.000Z",
  regionFirstReleasedIn: "NA",
  releasedInEuPalOrNa: true,
  imageUrl: null,
  isOwned: true,
  isExcluded: true
};

type FetchCall = {
  method: string;
  path: string;
  body: unknown;
};

function mockFetch(routes: Record<string, unknown>) {
  const calls: FetchCall[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const rawUrl = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const path = rawUrl.startsWith("http") ? new URL(rawUrl).pathname : rawUrl;
      const method = (init?.method ?? "GET").toUpperCase();
      calls.push({
        method,
        path,
        body: init?.body ? JSON.parse(String(init.body)) : null
      });
      const route = routes[`${method} ${path}`];
      if (route === undefined) {
        return new Response(JSON.stringify({ message: "Not Found" }), { status: 404 });
      }
      return new Response(JSON.stringify(route), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    })
  );
  return calls;
}
