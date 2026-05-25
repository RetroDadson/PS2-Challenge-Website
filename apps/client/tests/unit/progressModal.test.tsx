import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { GameProgressDto } from "@ps2-challenge/shared";
import { describe, expect, it, vi } from "vitest";
import { ProgressModal } from "../../src/components/ProgressModal.js";

describe("ProgressModal", () => {
  it("splits day-based completion times and saves trimmed edit payloads", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();

    render(<ProgressModal progress={progress} titles={["Game One"]} onClose={onClose} onSave={onSave} />);

    expect(screen.getByRole("dialog", { name: "Edit Game Progress" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Edit Game Progress" })).toBeInTheDocument();
    expect(screen.getByLabelText("hours")).toHaveValue(26);
    expect(screen.getByLabelText("minutes")).toHaveValue(3);
    expect(screen.getByLabelText("seconds")).toHaveValue(4);

    fireEvent.change(screen.getByLabelText("Beaten Criteria"), { target: { value: "  Credits  " } });
    fireEvent.change(screen.getByLabelText("Review"), { target: { value: "  Loved it  " } });
    fireEvent.click(screen.getByRole("button", { name: "Update" }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        title: "Game One",
        dateStarted: "2024-01-01",
        dateFinished: "2024-01-05",
        completionTime: "26:03:04",
        beatenCriteria: "Credits",
        review: "Loved it",
        platform: "Physical"
      })
    );
  });

  it("builds add payloads with clamped time fields and supports cancel/close actions", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();

    render(<ProgressModal progress={null} titles={["New Game"]} onClose={onClose} onSave={onSave} />);

    expect(screen.getByRole("dialog", { name: "Add New Game Progress" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Add New Game Progress" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Game Title"), { target: { value: " New Game " } });
    fireEvent.change(screen.getByLabelText("Started"), { target: { value: "2026-05-13" } });
    fireEvent.change(screen.getByLabelText("Finished (optional)"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Platform"), { target: { value: "Emulated" } });
    fireEvent.change(screen.getByLabelText("hours"), { target: { value: "-4" } });
    fireEvent.change(screen.getByLabelText("minutes"), { target: { value: "99" } });
    fireEvent.change(screen.getByLabelText("seconds"), { target: { value: "not-a-number" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        title: "New Game",
        dateStarted: "2026-05-13",
        dateFinished: null,
        completionTime: "00:59:00",
        beatenCriteria: null,
        review: null,
        platform: "Emulated"
      })
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByLabelText("Close"));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

const progress: GameProgressDto = {
  progressId: 1,
  gameId: 1,
  gameTitle: "Game One",
  imageUrl: null,
  dateStarted: "2024-01-01",
  dateFinished: "2024-01-05",
  completionTime: "1.02:03:04",
  beatenCriteria: "Any%",
  review: "Good",
  platform: "Physical"
};
