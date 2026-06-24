import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { Layout } from "../../src/components/Layout.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Layout", () => {
  it("shows the signed-in profile picture, username, role, and logout action in the sidebar", async () => {
    mockAuthUser({
      isAuthenticated: true,
      username: "AdminUser",
      role: "Admin",
      profileImageUrl: "https://example.com/avatar.png"
    });

    renderLayout();

    expect(await screen.findByRole("link", { name: "Open profile for AdminUser" })).toHaveAttribute("href", "/user");
    expect(screen.getByAltText("AdminUser")).toHaveAttribute("src", "https://example.com/avatar.png");
    expect(screen.getByRole("link", { name: /Logout/i })).toHaveAttribute("href", "/api/auth/logout");
    expect(screen.getByRole("link", { name: "Admin" })).toHaveAttribute("href", "/admin");
  });

  it("shows API docs and a social submenu in the sidebar", async () => {
    mockAuthUser({ isAuthenticated: false });

    renderLayout();

    expect(await screen.findByRole("link", { name: "Login" })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: "Challenge Runners" })).toHaveAttribute("href", "/runners");
    expect(within(screen.getByLabelText("Utilities")).getByRole("link", { name: "API Docs" })).toHaveAttribute("href", "/swagger");
    fireEvent.click(screen.getByText("Watch the Challenge"));
    expect(screen.getByRole("link", { name: "Twitch" })).toHaveAttribute("href", "https://www.twitch.tv/retrodadson");
    expect(screen.getByRole("link", { name: "YouTube" })).toHaveAttribute("href", "https://www.youtube.com/@dadson1996");
    expect(document.querySelector('img[src="/assets/glitch_flat_purple.svg"]')).toBeInTheDocument();
    expect(document.querySelector('img[src="/assets/yt_icon_red_digital.png"]')).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "X" })).not.toBeInTheDocument();
  });

  it("toggles the compact navigation drawer", async () => {
    mockAuthUser({ isAuthenticated: false });

    renderLayout();

    const openButton = await screen.findByRole("button", { name: "Open navigation" });
    expect(openButton).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(openButton);
    const closeButton = screen.getByRole("button", { name: "Close navigation" });
    expect(closeButton).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(closeButton);
    expect(screen.getByRole("button", { name: "Open navigation" })).toHaveAttribute("aria-expanded", "false");
  });

  it("waits for navigation auth before showing the compact drawer toggle", async () => {
    let resolveUser!: (response: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>((resolve) => {
        resolveUser = resolve;
      }))
    );

    renderLayout();

    expect(screen.queryByRole("button", { name: "Open navigation" })).not.toBeInTheDocument();

    resolveUser(new Response(JSON.stringify({ isAuthenticated: false }), { status: 200, headers: { "content-type": "application/json" } }));

    expect(await screen.findByRole("button", { name: "Open navigation" })).toBeInTheDocument();
  });
});

function renderLayout() {
  render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<div>Page body</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

function mockAuthUser(body: Record<string, unknown>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }))
  );
}
