import { describe, expect, it, vi } from "vitest";
import { RealtimeHub } from "../src/realtime/hub.js";

describe("realtime hub logging", () => {
  it("logs debug connection and ping events without affecting websocket messages", () => {
    const logger = { debug: vi.fn() };
    const socket = fakeSocket();
    const hub = new RealtimeHub(logger as never);

    hub.register("votes", socket);
    socket.emit("message", "Ping");

    expect(logger.debug).toHaveBeenCalledWith(expect.objectContaining({ hub: "votes", connectionId: "votes-1" }), "VotesHub connection requested: votes-1");
    expect(logger.debug).toHaveBeenCalledWith(expect.objectContaining({ hub: "votes", connectionId: "votes-1" }), "VotesHub ping from: votes-1");
    expect(socket.sent).toEqual([JSON.stringify({ type: "Pong" })]);
  });
});

function fakeSocket() {
  const handlers: Partial<Record<"message" | "close", (message: { toString(): string }) => void>> = {};
  return {
    OPEN: 1,
    readyState: 1,
    sent: [] as string[],
    send(payload: string) {
      this.sent.push(payload);
    },
    on(event: "message" | "close", callback: (message: { toString(): string }) => void) {
      handlers[event] = callback;
    },
    emit(event: "message" | "close", value = "") {
      handlers[event]?.({ toString: () => value });
    }
  };
}
