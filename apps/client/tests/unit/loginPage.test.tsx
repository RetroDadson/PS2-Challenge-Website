import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { Login } from "../../src/pages/Login.js";

describe("Login page", () => {
  it("preserves the C# returnUrl query string when starting Twitch login", () => {
    render(
      <MemoryRouter initialEntries={["/login?returnUrl=/admin"]}>
        <Login />
      </MemoryRouter>
    );

    expect(screen.getByRole("link", { name: "Login with Twitch" })).toHaveAttribute("href", "/api/auth/login?returnUrl=%2Fadmin");
  });

  it("falls back to home when no returnUrl is present", () => {
    render(
      <MemoryRouter initialEntries={["/login"]}>
        <Login />
      </MemoryRouter>
    );

    expect(screen.getByRole("link", { name: "Login with Twitch" })).toHaveAttribute("href", "/api/auth/login?returnUrl=%2F");
  });
});
