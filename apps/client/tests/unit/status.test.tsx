import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Empty, ErrorMessage, Loading } from "../../src/components/Status.js";

describe("status components", () => {
  it("renders loading, error, and empty states", () => {
    render(
      <>
        <Loading />
        <ErrorMessage message="Something failed" />
        <Empty>No games found</Empty>
      </>
    );

    expect(screen.getByText("Loading...")).toHaveClass("status");
    expect(screen.getByText("Something failed")).toHaveClass("status", "error");
    expect(screen.getByText("No games found")).toHaveClass("status");
  });
});
