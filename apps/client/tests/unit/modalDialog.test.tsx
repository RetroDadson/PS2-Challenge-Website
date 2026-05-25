import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ModalDialog } from "../../src/components/ModalDialog.js";

describe("ModalDialog", () => {
  it("uses a native dialog and closes on cancel or backdrop clicks", () => {
    const onClose = vi.fn();

    render(
      <ModalDialog title="Confirm Action" onClose={onClose}>
        <p>Dialog content</p>
      </ModalDialog>
    );

    const dialog = screen.getByRole("dialog", { name: "Confirm Action" });
    expect(dialog.tagName).toBe("DIALOG");
    expect(dialog).toHaveAttribute("open");

    fireEvent.click(screen.getByText("Dialog content"));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent(dialog, new Event("cancel", { cancelable: true }));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Close dialog backdrop" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
