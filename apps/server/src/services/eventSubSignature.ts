import crypto from "node:crypto";

export const eventSubHeaders = {
  messageId: "twitch-eventsub-message-id",
  timestamp: "twitch-eventsub-message-timestamp",
  signature: "twitch-eventsub-message-signature",
  messageType: "twitch-eventsub-message-type"
} as const;

const maxMessageAgeMs = 10 * 60 * 1000;
const derivedSecretPurpose = "ps2-challenge-eventsub-webhook";

export function eventSubSecret(clientSecret: string): string | null {
  return clientSecret ? crypto.createHmac("sha256", clientSecret).update(derivedSecretPurpose).digest("hex") : null;
}

export function eventSubSecretFingerprint(secret: string): string {
  return crypto.createHash("sha256").update(secret).digest("hex").slice(0, 16);
}

export type EventSubSignatureInput = {
  messageId: string | undefined;
  timestamp: string | undefined;
  signature: string | undefined;
  rawBody: Buffer;
  secret: string;
  now?: Date;
};

export type EventSubSignatureResult = "valid" | "invalid" | "stale";

export function verifyEventSubSignature({ messageId, timestamp, signature, rawBody, secret, now = new Date() }: EventSubSignatureInput): EventSubSignatureResult {
  if (!messageId || !timestamp || !signature) {
    return "invalid";
  }
  const expected = eventSubSignature(messageId, timestamp, rawBody, secret);
  const provided = Buffer.from(signature);
  const computed = Buffer.from(expected);
  if (provided.length !== computed.length || !crypto.timingSafeEqual(provided, computed)) {
    return "invalid";
  }
  const sentAt = Date.parse(timestamp);
  if (Number.isNaN(sentAt) || Math.abs(now.getTime() - sentAt) > maxMessageAgeMs) {
    return "stale";
  }
  return "valid";
}

export function eventSubSignature(messageId: string, timestamp: string, rawBody: Buffer, secret: string): string {
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(messageId);
  hmac.update(timestamp);
  hmac.update(rawBody);
  return `sha256=${hmac.digest("hex")}`;
}
