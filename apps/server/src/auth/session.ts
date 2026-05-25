import crypto from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { AppConfig } from "../config.js";

export const authCookieName = ".PS2Challenge.Auth";

export type SessionUser = {
  id: number;
  twitchId: string;
  username: string;
  role: string;
  profileImageUrl?: string | null;
};

function base64UrlEncode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(value: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url"); // NOSONAR - HMAC-SHA256 signs auth cookies and is verified with timingSafeEqual.
}

function signatureMatches(expectedSignature: string, providedSignature: string): boolean {
  const expected = Buffer.from(expectedSignature, "base64url");
  const provided = Buffer.from(providedSignature, "base64url");
  return expected.length === provided.length && crypto.timingSafeEqual(expected, provided);
}

export function createSessionCookie(user: SessionUser, secret: string): string {
  const payload = base64UrlEncode(JSON.stringify(user));
  return `${payload}.${sign(payload, secret)}`;
}

export function readSessionCookie(value: string | undefined, secret: string): SessionUser | null {
  if (!value) {
    return null;
  }

  const [payload, signature] = value.split(".");
  if (!payload || !signature || !signatureMatches(sign(payload, secret), signature)) {
    return null;
  }

  try {
    return JSON.parse(base64UrlDecode(payload)) as SessionUser;
  } catch {
    return null;
  }
}

export function getCookieUser(request: FastifyRequest, config: AppConfig): SessionUser | null {
  return readSessionCookie(request.cookies[authCookieName], config.cookieSecret);
}

export function setAuthCookie(reply: FastifyReply, user: SessionUser, config: AppConfig): void {
  reply.setCookie(authCookieName, createSessionCookie(user, config.cookieSecret), {
    httpOnly: true,
    sameSite: "lax",
    secure: requestIsHttps(reply),
    path: "/",
    maxAge: 60 * 60 * 24 * 30
  });
}

export function clearAuthCookie(reply: FastifyReply): void {
  reply.clearCookie(authCookieName, {
    path: "/",
    sameSite: "lax",
    httpOnly: true
  });
}

function requestIsHttps(reply: FastifyReply): boolean {
  return reply.request.protocol === "https" || reply.request.headers["x-forwarded-proto"] === "https";
}

export function normalizeReturnUrl(returnUrl?: string): string {
  if (!returnUrl) {
    return "/";
  }
  const decoded = safeDecodeURIComponent(returnUrl);
  let path = decoded;
  try {
    const url = new URL(decoded);
    path = `${url.pathname}${url.search}`;
  } catch {
    path = decoded;
  }
  if (!path.startsWith("/")) {
    path = `/${path}`;
  }
  return path;
}

export function sanitizeReturnUrl(returnUrl?: string): string {
  const path = normalizeReturnUrl(returnUrl);
  const normalized = (path.split("?")[0] ?? "").toLocaleLowerCase("en-GB");
  return ["/admin", "/user", "/login"].some((restricted) => normalized.startsWith(restricted)) ? "/" : path;
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
