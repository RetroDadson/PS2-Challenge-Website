import crypto from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { AppConfig } from "../config.js";

export const authCookieName = ".PS2Challenge.Auth";
export const oauthStateCookieName = ".PS2Challenge.OAuthState";
export const sessionTtlSeconds = 60 * 60 * 24 * 30;
export const oauthStateTtlSeconds = 10 * 60;

export type SessionUser = {
  id: number;
  twitchId: string;
  username: string;
  role: string;
  profileImageUrl?: string | null;
};

type SessionPayload = SessionUser & { exp: number };

export type OAuthState = {
  returnUrl?: string;
  redirectUri?: string;
  nonce: string;
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

function signPayload(payload: string, secret: string): string {
  return `${payload}.${sign(payload, secret)}`;
}

function readSignedPayload(value: string | undefined, secret: string): unknown {
  if (!value) {
    return null;
  }

  const [payload, signature] = value.split(".");
  if (!payload || !signature || !signatureMatches(sign(payload, secret), signature)) {
    return null;
  }

  try {
    return JSON.parse(base64UrlDecode(payload));
  } catch {
    return null;
  }
}

export function createSessionCookie(user: SessionUser, secret: string, ttlSeconds = sessionTtlSeconds): string {
  const payload: SessionPayload = { ...user, exp: nowSeconds() + ttlSeconds };
  return signPayload(base64UrlEncode(JSON.stringify(payload)), secret);
}

export function readSessionCookie(value: string | undefined, secret: string): SessionUser | null {
  const payload = readSignedPayload(value, secret);
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const { exp, ...user } = payload as SessionPayload;
  if (typeof exp !== "number" || exp <= nowSeconds()) {
    return null;
  }
  return user;
}

export function createOAuthState(state: OAuthState, secret: string): string {
  return signPayload(base64UrlEncode(JSON.stringify(state)), secret);
}

export function readOAuthState(value: string | undefined, secret: string): OAuthState | null {
  const payload = readSignedPayload(value, secret);
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const state = payload as OAuthState;
  return typeof state.nonce === "string" && state.nonce ? state : null;
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
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
    maxAge: sessionTtlSeconds
  });
}

export function clearAuthCookie(reply: FastifyReply): void {
  reply.clearCookie(authCookieName, {
    path: "/",
    sameSite: "lax",
    httpOnly: true
  });
}

export function setOAuthStateCookie(reply: FastifyReply, nonce: string): void {
  reply.setCookie(oauthStateCookieName, nonce, {
    httpOnly: true,
    sameSite: "lax",
    secure: requestIsHttps(reply),
    path: "/",
    maxAge: oauthStateTtlSeconds
  });
}

export function clearOAuthStateCookie(reply: FastifyReply): void {
  reply.clearCookie(oauthStateCookieName, {
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
  let path: string;
  try {
    const url = new URL(decoded);
    path = `${url.pathname}${url.search}`;
  } catch {
    path = decoded;
  }
  if (!path.startsWith("/")) {
    path = `/${path}`;
  }
  // "//host" and "/\host" are treated as protocol-relative URLs by browsers,
  // which would turn the redirect into an open redirect to another site.
  if (path.length > 1 && (path[1] === "/" || path[1] === "\\")) {
    return "/";
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
