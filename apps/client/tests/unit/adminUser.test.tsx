import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Admin } from "../../src/pages/Admin.js";
import { UserPage } from "../../src/pages/User.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Admin page", () => {
  it("shows the C# access denied state when admin APIs are forbidden", async () => {
    mockFetch({
      "GET /api/admin/users": new Response(null, { status: 403 }),
      "GET /api/admin/roles": new Response(null, { status: 403 })
    });

    render(<Admin />);

    expect(await screen.findByRole("heading", { name: "Access Denied" })).toBeInTheDocument();
    expect(screen.getByText("You need to be an administrator to access this page.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go Home" })).toHaveAttribute("href", "/");
  });

  it("renders overlay links, cover refresh status, and the C# user table shape", async () => {
    const calls = mockFetch({
      "GET /api/admin/users": [
        {
          id: 1,
          twitchId: "tw-admin",
          username: "AdminUser",
          role: "Admin",
          roleId: 1,
          profileImageUrl: "https://example.com/admin.png",
          createdAt: "2024-01-01T00:00:00Z",
          lastLoginAt: "2024-01-02T00:00:00Z"
        },
        {
          id: 2,
          twitchId: "tw-user",
          username: "NormalUser",
          role: "User",
          roleId: 2,
          profileImageUrl: null,
          createdAt: "2024-02-01T00:00:00Z",
          lastLoginAt: "2024-02-02T00:00:00Z"
        }
      ],
      "GET /api/admin/roles": [
        { id: 1, name: "Admin", description: "Administrator with full access" },
        { id: 2, name: "User", description: "Standard authenticated user" }
      ],
      "POST /api/admin/update-cover-images/stream": streamResponse([
        { type: "progress", status: "starting", total: 2, processed: 0, updated: 0, skipped: 0, errors: 0 },
        { type: "progress", status: "updated", total: 2, processed: 1, updated: 1, skipped: 0, errors: 0, currentGameTitle: "Game One" },
        { type: "progress", status: "skipped", total: 2, processed: 2, updated: 1, skipped: 1, errors: 0, currentGameTitle: "Game Two" },
        { type: "complete", message: "Cover image update completed", total: 2, updated: 1, skipped: 1, errors: 0 }
      ]),
      "POST /api/admin/update-howlongtobeat/stream": streamResponse([
        { type: "progress", status: "starting", total: 2, processed: 0, updated: 0, skipped: 0, errors: 0 },
        { type: "progress", status: "updated", total: 2, processed: 1, updated: 1, skipped: 0, errors: 0, currentGameTitle: "Game One" },
        { type: "progress", status: "updated", total: 2, processed: 2, updated: 2, skipped: 0, errors: 0, currentGameTitle: "Game Two" },
        { type: "complete", message: "HowLongToBeat update completed", total: 2, updated: 2, skipped: 0, errors: 0 }
      ]),
      "PUT /api/admin/users/2/role": { id: 2, username: "NormalUser", role: "Admin", message: "User role updated to Admin" }
    });

    render(<Admin />);

    expect(await screen.findByRole("heading", { name: "Admin Panel" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Votes Overlay/i })).toHaveAttribute("href", "/votes-overlay");
    expect(screen.getByRole("link", { name: /Vote Covers Overlay/i })).toHaveAttribute("href", "/vote-covers-overlay");
    expect(screen.getByText("AdminUser")).toBeInTheDocument();
    expect(screen.getByText("NormalUser")).toBeInTheDocument();
    expect(screen.getAllByText("Admin").length).toBeGreaterThan(0);
    expect(screen.getAllByText("User").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: /Update Cover Images Now/i }));
    expect(await screen.findByText("Update completed. Updated: 1, Skipped: 1, Errors: 0")).toBeInTheDocument();
    expect(screen.getByLabelText("Cover refresh progress")).toHaveAttribute("value", "2");
    expect(screen.getByLabelText("Cover refresh progress")).toHaveAttribute("max", "2");

    fireEvent.click(screen.getByRole("button", { name: /Update Times Now/i }));
    expect(await screen.findByText("Update completed. Updated: 2, Skipped: 0, Errors: 0")).toBeInTheDocument();
    expect(screen.getByLabelText("HowLongToBeat refresh progress")).toHaveAttribute("value", "2");
    expect(screen.getByLabelText("HowLongToBeat refresh progress")).toHaveAttribute("max", "2");

    fireEvent.change(screen.getByLabelText("Role for NormalUser"), { target: { value: "1" } });
    await waitFor(() => expect(calls.some((call) => call.method === "PUT" && call.path === "/api/admin/users/2/role")).toBe(true));
    expect(await screen.findByText("Role updated")).toBeInTheDocument();
  });
});

describe("User page", () => {
  it("shows the old not-logged-in state when /api/user is unauthorized", async () => {
    mockFetch({
      "GET /api/user": new Response(JSON.stringify({ message: "Unauthorized" }), { status: 401 })
    });

    render(<UserPage />);

    expect(await screen.findByRole("heading", { name: "Not Logged In" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Login with Twitch" })).toHaveAttribute("href", "/api/auth/login");
  });

  it("shows profile details and supports copy and regenerate API-key flows", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText }
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mockFetch({
      "GET /api/user": {
        isAuthenticated: true,
        twitchId: "tw-user",
        username: "NormalUser",
        role: "User",
        profileImageUrl: "https://example.com/user.png",
        createdAt: "2024-01-01T00:00:00Z",
        lastLoginAt: "2024-01-02T03:04:00Z",
        apiKey: "stored-hash"
      },
      "POST /api/user/api-key": { apiKey: "new-raw-key" }
    });

    render(<UserPage />);

    expect(await screen.findByRole("heading", { name: "NormalUser" })).toBeInTheDocument();
    expect(screen.getByText("tw-user")).toBeInTheDocument();
    expect(screen.getAllByText(/2024/).length).toBeGreaterThan(0);

    const apiKeyInput = screen.getByLabelText("API key") as HTMLInputElement;
    expect(apiKeyInput.type).toBe("password");
    expect(apiKeyInput.value).toBe("stored-hash");

    fireEvent.click(screen.getByRole("button", { name: "Show API key" }));
    expect(apiKeyInput.type).toBe("text");

    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("stored-hash"));

    fireEvent.click(screen.getByRole("button", { name: "Regenerate" }));
    await waitFor(() => expect(apiKeyInput.value).toBe("new-raw-key"));
  });
});

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
      if (route instanceof Response) {
        return route;
      }
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

function streamResponse(events: unknown[]) {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const event of events) {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        }
        controller.close();
      }
    }),
    { status: 200, headers: { "content-type": "application/x-ndjson" } }
  );
}
