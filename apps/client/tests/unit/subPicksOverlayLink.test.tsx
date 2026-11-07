import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SubPicksOverlayLink, subPicksOverlayPath } from "../../src/components/SubPicksOverlayLink.js";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("SubPicksOverlayLink", () => {
  it("builds the overlay path from the optional timing settings", () => {
    expect(subPicksOverlayPath("", "")).toBe("/sub-picks-overlay");
    expect(subPicksOverlayPath(" 20 ", "900")).toBe("/sub-picks-overlay?show=20&every=900");
    expect(subPicksOverlayPath("", "120")).toBe("/sub-picks-overlay?every=120");
    expect(subPicksOverlayPath("30", " ")).toBe("/sub-picks-overlay?show=30");
  });

  it("updates the link as timings are entered and copies the full URL", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(<SubPicksOverlayLink />);

    const link = screen.getByLabelText("Sub Picks overlay link");
    expect(link).toHaveValue(`${globalThis.location.origin}/sub-picks-overlay`);
    expect(screen.getByRole("link", { name: "Open" })).toHaveAttribute("href", "/sub-picks-overlay");

    fireEvent.change(screen.getByLabelText("Seconds on screen (show)"), { target: { value: "20" } });
    fireEvent.change(screen.getByLabelText("Seconds between appearances (every)"), { target: { value: "900" } });
    expect(link).toHaveValue(`${globalThis.location.origin}/sub-picks-overlay?show=20&every=900`);
    expect(screen.getByRole("link", { name: "Open" })).toHaveAttribute("href", "/sub-picks-overlay?show=20&every=900");

    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    expect(await screen.findByText("Copied")).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith(`${globalThis.location.origin}/sub-picks-overlay?show=20&every=900`);

    fireEvent.change(screen.getByLabelText("Seconds on screen (show)"), { target: { value: "" } });
    expect(screen.queryByText("Copied")).not.toBeInTheDocument();
  });

  it("explains when copying fails", async () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } });
    render(<SubPicksOverlayLink />);
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    expect(await screen.findByText(/Copy failed/)).toBeInTheDocument();
  });
});
