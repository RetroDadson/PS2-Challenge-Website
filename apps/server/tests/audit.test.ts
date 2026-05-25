import type { FastifyBaseLogger } from "fastify";
import { describe, expect, it, vi } from "vitest";
import { auditError, auditInfo, auditWarn, type AuditActor } from "../src/utils/audit.js";

describe("audit logging", () => {
  const actor: AuditActor = {
    id: 42,
    twitchId: "twitch-42",
    username: "AdminUser",
    role: "Admin",
    authMethod: "ApiKey"
  };

  it("adds consistent structured actor fields to info audit events", () => {
    const logger = fakeLogger();

    auditInfo(logger, actor, "AUDIT: Admin AdminUser changed something", { gameId: 7 });

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        audit: true,
        adminUser: "AdminUser",
        adminId: 42,
        adminTwitchId: "twitch-42",
        adminRole: "Admin",
        authMethod: "ApiKey",
        gameId: 7
      }),
      "AUDIT: Admin AdminUser changed something"
    );
  });

  it("supports warning and error audit events without changing the payload shape", () => {
    const logger = fakeLogger();

    auditWarn(logger, actor, "warn audit", { targetUserId: 99 });
    auditError(logger, actor, "error audit", { error: "broken" });

    expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({ audit: true, targetUserId: 99 }), "warn audit");
    expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({ audit: true, error: "broken" }), "error audit");
  });
});

function fakeLogger(): FastifyBaseLogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  } as unknown as FastifyBaseLogger;
}
