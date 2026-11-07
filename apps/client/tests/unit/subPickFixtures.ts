import type { SubEntryDto } from "@ps2-challenge/shared";
import { vi } from "vitest";

export function mockFetch(routes: Record<string, unknown>) {
  const calls: Array<{ key: string; body: unknown }> = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = typeof input === "string" ? input : input instanceof URL ? input.pathname : new URL(input.url).pathname;
    const key = `${(init?.method ?? "GET").toUpperCase()} ${path}`;
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ key, body });
    const handler = routes[key];
    if (handler === undefined) return json({ message: "Not Found" }, 404);
    if (typeof handler === "function") return json(handler(body));
    if (Array.isArray(handler) && handler.length === 2 && typeof handler[0] === "number") return json(handler[1], handler[0]);
    return json(handler);
  }));
  return calls;
}

export function entry(overrides: Partial<SubEntryDto> = {}): SubEntryDto {
  return {
    id: 1,
    grantId: 1,
    twitchUserId: "1001",
    twitchDisplayName: "ViewerOne",
    gameId: null,
    gameTitle: null,
    status: "undrawn",
    pool: "awaiting_pick",
    canChangePick: true,
    playedGameNumber: null,
    createdAt: "2026-11-07T12:00:00.000Z",
    ...overrides
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
