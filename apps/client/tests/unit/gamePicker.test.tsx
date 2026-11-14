import type { EligibleGameDto } from "@ps2-challenge/shared";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GamePicker } from "../../src/components/GamePicker.js";

const games: EligibleGameDto[] = Array.from({ length: 1500 }, (_, index) => ({
  id: index + 1,
  title: `Game ${String(index + 1).padStart(4, "0")}`,
  imageUrl: null
}));

describe("GamePicker", () => {
  it("lists every eligible game and saves one from the end of the list", () => {
    const onSave = vi.fn();
    render(<GamePicker games={games} currentGameId={null} busy={false} onSave={onSave} onCancel={vi.fn()} />);

    expect(screen.getAllByRole("option")).toHaveLength(1500);
    fireEvent.change(screen.getByLabelText("Game"), { target: { value: "1500" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Pick" }));

    expect(onSave).toHaveBeenCalledWith(1500);
  });

  it("filters by search across the whole list", () => {
    render(<GamePicker games={games} currentGameId={null} busy={false} onSave={vi.fn()} onCancel={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Search games"), { target: { value: "game 14" } });

    expect(screen.getAllByRole("option")).toHaveLength(100);
    expect(screen.getByRole("option", { name: "Game 1499" })).toBeInTheDocument();
  });

  it("does not show a lone search match as selected before it is chosen", () => {
    const onSave = vi.fn();
    render(<GamePicker games={games} currentGameId={null} busy={false} onSave={onSave} onCancel={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Search games"), { target: { value: "game 0042" } });

    const option = screen.getByRole<HTMLOptionElement>("option", { name: "Game 0042" });
    expect(option.selected).toBe(false);
    expect(screen.getByRole("button", { name: "Save Pick" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Game"), { target: { value: "42" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Pick" }));

    expect(onSave).toHaveBeenCalledWith(42);
  });

  it("does not save a choice that the search has filtered out", () => {
    render(<GamePicker games={games} currentGameId={null} busy={false} onSave={vi.fn()} onCancel={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Game"), { target: { value: "7" } });
    fireEvent.change(screen.getByLabelText("Search games"), { target: { value: "game 0042" } });

    expect(screen.getByRole("button", { name: "Save Pick" })).toBeDisabled();
  });
});
