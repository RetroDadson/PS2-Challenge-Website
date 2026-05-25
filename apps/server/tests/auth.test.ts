import crypto from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { resolveAuthUser } from "../src/auth/guards.js";
import { createSessionCookie, normalizeReturnUrl, readSessionCookie, sanitizeReturnUrl } from "../src/auth/session.js";
import { hashApiKey } from "../src/repositories/userRepository.js";

describe("auth helpers", () => {
  it("hashes raw API keys with SHA-256 so existing keys remain valid", () => {
    expect(hashApiKey("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef")).toBe(
      "a8ae6e6ee929abea3afcfc5258c8ccd6f85273e0d4626d26c7279f3250f77c8e"
    );
  });

  it("round-trips signed session cookies", () => {
    const cookie = createSessionCookie({ id: 1, twitchId: "tw-1", username: "Dadson", role: "Admin" }, "secret");
    expect(readSessionCookie(cookie, "secret")?.username).toBe("Dadson");
    expect(readSessionCookie(cookie, "different")).toBeNull();
    expect(readSessionCookie(undefined, "secret")).toBeNull();
    expect(readSessionCookie("not-a-cookie", "secret")).toBeNull();
    const invalidPayload = Buffer.from("not-json").toString("base64url");
    const invalidSignature = crypto.createHmac("sha256", "secret").update(invalidPayload).digest("base64url");
    expect(readSessionCookie(`${invalidPayload}.${invalidSignature}`, "secret")).toBeNull();
  });

  it("guards restricted return URLs after login", () => {
    expect(normalizeReturnUrl()).toBe("/");
    expect(normalizeReturnUrl("votes")).toBe("/votes");
    expect(normalizeReturnUrl("https://example.com/progress?tab=done")).toBe("/progress?tab=done");
    expect(sanitizeReturnUrl("/votes/history?round=3")).toBe("/votes/history?round=3");
    expect(sanitizeReturnUrl("/login?returnUrl=/admin")).toBe("/");
    expect(sanitizeReturnUrl("/admin")).toBe("/");
  });

  it("logs API key authentication success without logging the raw key", async () => {
    const logger = fakeLogger();
    const request = fakeRequest("secret-api-key", logger);
    const repository = {
      getByApiKey: vi.fn(async () => ({
        id: 5,
        twitchId: "tw-5",
        twitchUsername: "AdminUser",
        roleName: "Admin",
        profileImageUrl: null
      }))
    };

    const user = await resolveAuthUser(request as never, repository as never, fakeConfig());

    expect(user?.username).toBe("AdminUser");
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 5, username: "AdminUser", authMethod: "ApiKey" }),
      "User AdminUser authenticated via API key"
    );
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain("secret-api-key");
  });

  it("logs invalid API keys without including the raw key", async () => {
    const logger = fakeLogger();
    const request = fakeRequest("bad-api-key", logger);
    const repository = { getByApiKey: vi.fn(async () => null) };

    await expect(resolveAuthUser(request as never, repository as never, fakeConfig())).resolves.toBeNull();

    expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({ authMethod: "ApiKey" }), "Invalid API key provided");
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain("bad-api-key");
  });

  it("supports bearer API keys and logs repository lookup failures", async () => {
    const bearerLogger = fakeLogger();
    const bearerRequest = {
      headers: { authorization: "Bearer bearer-api-key" },
      cookies: {},
      log: bearerLogger
    };
    const repository = {
      getByApiKey: vi.fn(async () => ({
        id: 6,
        twitchId: "tw-6",
        twitchUsername: "BearerUser",
        roleName: null,
        profileImageUrl: "https://example.com/avatar.png"
      }))
    };

    const user = await resolveAuthUser(bearerRequest as never, repository as never, fakeConfig());

    expect(repository.getByApiKey).toHaveBeenCalledWith("bearer-api-key");
    expect(user).toMatchObject({ username: "BearerUser", role: "User", authMethod: "ApiKey" });

    const errorLogger = fakeLogger();
    await expect(
      resolveAuthUser(
        {
          headers: { "x-api-key": "explode" },
          cookies: {},
          log: errorLogger
        } as never,
        { getByApiKey: vi.fn(async () => { throw new Error("database offline"); }) } as never,
        fakeConfig()
      )
    ).resolves.toBeNull();
    expect(errorLogger.error).toHaveBeenCalledWith(expect.objectContaining({ err: expect.any(Error) }), "Error validating API key");
  });
});

function fakeLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  };
}

function fakeRequest(apiKey: string, log: ReturnType<typeof fakeLogger>) {
  return {
    headers: { "x-api-key": apiKey },
    cookies: {},
    log
  };
}

function fakeConfig() {
  return {
    cookieSecret: "test-secret"
  } as never;
}
