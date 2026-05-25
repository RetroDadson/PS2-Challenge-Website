import type { FastifyBaseLogger } from "fastify";
import type { SessionUser } from "../auth/session.js";

export type AuditActor = Pick<SessionUser, "id" | "username" | "twitchId" | "role"> & {
  authMethod?: "Cookie" | "ApiKey";
};

type AuditDetails = Record<string, unknown>;

function auditFields(actor: AuditActor, details: AuditDetails): AuditDetails {
  return {
    audit: true,
    adminUser: actor.username,
    adminId: actor.id,
    adminTwitchId: actor.twitchId,
    adminRole: actor.role,
    ...(actor.authMethod ? { authMethod: actor.authMethod } : {}),
    ...details
  };
}

export function auditInfo(logger: FastifyBaseLogger, actor: AuditActor, message: string, details: AuditDetails = {}): void {
  logger.info(auditFields(actor, details), message);
}

export function auditWarn(logger: FastifyBaseLogger, actor: AuditActor, message: string, details: AuditDetails = {}): void {
  logger.warn(auditFields(actor, details), message);
}

export function auditError(logger: FastifyBaseLogger, actor: AuditActor, message: string, details: AuditDetails = {}): void {
  logger.error(auditFields(actor, details), message);
}
