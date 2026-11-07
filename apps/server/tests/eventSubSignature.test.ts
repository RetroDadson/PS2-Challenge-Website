import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { eventSubSignature, verifyEventSubSignature } from "../src/services/eventSubSignature.js";

const secret = "local-test-secret-123";
const rawBody = Buffer.from(JSON.stringify({ event: { user_id: "1" } }));
const now = new Date("2026-11-07T12:00:00Z");
const timestamp = "2026-11-07T11:59:30.123456789Z";

describe("EventSub signatures", () => {
  it("matches Twitch's HMAC-SHA256 over message id, timestamp and raw body", () => {
    const expected = `sha256=${crypto.createHmac("sha256", secret).update(`message-1${timestamp}${rawBody.toString()}`).digest("hex")}`;
    expect(eventSubSignature("message-1", timestamp, rawBody, secret)).toBe(expected);
  });

  it("accepts a valid recent signature", () => {
    const signature = eventSubSignature("message-1", timestamp, rawBody, secret);
    expect(verifyEventSubSignature({ messageId: "message-1", timestamp, signature, rawBody, secret, now })).toBe("valid");
  });

  it("rejects tampered bodies, wrong secrets, missing headers and malformed signatures", () => {
    const signature = eventSubSignature("message-1", timestamp, rawBody, secret);
    expect(verifyEventSubSignature({ messageId: "message-1", timestamp, signature, rawBody: Buffer.from("{}"), secret, now })).toBe("invalid");
    expect(verifyEventSubSignature({ messageId: "message-1", timestamp, signature, rawBody, secret: "another-secret-123", now })).toBe("invalid");
    expect(verifyEventSubSignature({ messageId: "message-2", timestamp, signature, rawBody, secret, now })).toBe("invalid");
    expect(verifyEventSubSignature({ messageId: undefined, timestamp, signature, rawBody, secret, now })).toBe("invalid");
    expect(verifyEventSubSignature({ messageId: "message-1", timestamp: undefined, signature, rawBody, secret, now })).toBe("invalid");
    expect(verifyEventSubSignature({ messageId: "message-1", timestamp, signature: undefined, rawBody, secret, now })).toBe("invalid");
    expect(verifyEventSubSignature({ messageId: "message-1", timestamp, signature: "sha256=short", rawBody, secret, now })).toBe("invalid");
  });

  it("rejects messages older or newer than ten minutes, or with unreadable timestamps", () => {
    const old = "2026-11-07T11:49:59Z";
    const future = "2026-11-07T12:10:01Z";
    const unreadable = "yesterday";
    for (const stamp of [old, future, unreadable]) {
      const signature = eventSubSignature("message-1", stamp, rawBody, secret);
      expect(verifyEventSubSignature({ messageId: "message-1", timestamp: stamp, signature, rawBody, secret, now })).toBe("stale");
    }
    const edge = "2026-11-07T11:50:00Z";
    expect(verifyEventSubSignature({ messageId: "message-1", timestamp: edge, signature: eventSubSignature("message-1", edge, rawBody, secret), rawBody, secret, now })).toBe("valid");
  });
});
