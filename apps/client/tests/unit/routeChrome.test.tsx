import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DocumentTitle } from "../../src/components/DocumentTitle.js";
import { NotFound } from "../../src/pages/NotFound.js";

describe("route chrome", () => {
  it("updates the browser title for the active route", async () => {
    render(
      <DocumentTitle title="Games - Dadson's PS2 Challenge">
        <div>Route body</div>
      </DocumentTitle>
    );

    await waitFor(() => expect(document.title).toBe("Games - Dadson's PS2 Challenge"));
  });

  it("keeps the old not-found message", () => {
    render(<NotFound />);

    expect(screen.getByRole("alert")).toHaveTextContent("Sorry, there's nothing at this address.");
  });
});
