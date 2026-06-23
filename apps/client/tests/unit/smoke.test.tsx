import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { Home } from "../../src/pages/Home.js";

describe("Home", () => {
  it("renders the C# home content, navigation links, and social links", () => {
    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>
    );
    expect(screen.getByRole("heading", { name: "Welcome to Dadson's PS2 Challenge" })).toBeInTheDocument();
    expect(screen.getByText(/playing through all the PS2 games released in PAL/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View All Games" })).toHaveAttribute("href", "/games");
    expect(screen.getByRole("link", { name: "View Progress" })).toHaveAttribute("href", "/progress");
    expect(screen.getByRole("link", { name: "View Statistics" })).toHaveAttribute("href", "/statistics");
    expect(screen.getByRole("link", { name: "View Votes" })).toHaveAttribute("href", "/votes");
    expect(screen.getByRole("heading", { name: "Meet other console challenge runners" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Explore the runner directory/i })).toHaveAttribute("href", "/runners");
    expect(screen.getByRole("link", { name: "Twitch" })).toHaveAttribute("href", "https://twitch.tv/retrodadson");
    expect(screen.getByRole("link", { name: "YouTube" })).toHaveAttribute("href", "https://www.youtube.com/@dadson1996");
  });
});
