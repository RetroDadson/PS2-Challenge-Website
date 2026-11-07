import {
  createSubGrantRequestSchema,
  setSubEntryPickRequestSchema,
  twitchUserLookupRequestSchema,
  updateSubGrantRequestSchema,
  updateSubPickSettingsRequestSchema
} from "@ps2-challenge/shared";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { z } from "zod";
import type { AppConfig } from "../config.js";
import { createRequireAdmin } from "../auth/guards.js";
import { registerOpenApiSchemas, subPickAdminRouteSchemas } from "../openapi/schemas.js";
import type { UserRepository } from "../repositories/userRepository.js";
import type { SubPickService } from "../services/subPickService.js";
import type { TwitchUserLookup } from "../services/twitchApiClient.js";
import { auditInfo } from "../utils/audit.js";
import { handle, routeId, type SubPicksNotifier } from "./subPickRoutes.js";

type SubPickAdmin = Pick<
  SubPickService,
  "getSettings" | "updateSettings" | "listGrants" | "createGrant" | "updateGrant" | "deleteGrant" | "setPick" | "removeEntry" | "audit"
>;

export function registerSubPickAdminRoutes(
  app: FastifyInstance,
  subPicks: SubPickAdmin,
  twitchLookup: TwitchUserLookup,
  userRepository: UserRepository,
  config: AppConfig,
  realtimeHub: SubPicksNotifier
) {
  registerOpenApiSchemas(app);
  const requireAdminOrStop = createRequireAdmin(userRepository, config);

  app.get("/api/admin/sub-picks/settings", { schema: subPickAdminRouteSchemas.settings }, async (request, reply) => {
    if (!(await requireAdminOrStop(request, reply))) return;
    return handle(request, reply, "Failed to load sub pick settings", () => subPicks.getSettings());
  });

  app.put("/api/admin/sub-picks/settings", { schema: subPickAdminRouteSchemas.updateSettings }, async (request, reply) => {
    const admin = await requireAdminOrStop(request, reply);
    if (!admin) return;
    const body = parse(updateSubPickSettingsRequestSchema, request.body, reply);
    if (!body) return;
    return handle(request, reply, "Failed to update sub pick settings", async () => {
      const settings = await subPicks.updateSettings(admin, body);
      realtimeHub.broadcastSubPicksUpdated();
      auditInfo(request.log, admin, `AUDIT: Admin ${admin.username} updated sub pick settings`, { changes: body });
      return settings;
    });
  });

  app.post("/api/admin/sub-picks/twitch-lookup", { schema: subPickAdminRouteSchemas.twitchLookup }, async (request, reply) => {
    if (!(await requireAdminOrStop(request, reply))) return;
    const body = parse(twitchUserLookupRequestSchema, request.body, reply);
    if (!body) return;
    try {
      const user = await twitchLookup.getUserByLogin(body.login);
      if (!user) {
        return reply.status(404).send({ message: `No Twitch user called '${body.login}'` });
      }
      return user;
    } catch (error) {
      request.log.warn({ err: error, login: body.login }, "Twitch user lookup failed");
      return reply.status(502).send({ message: "Unable to reach Twitch to look up that user" });
    }
  });

  app.get("/api/admin/sub-picks/grants", { schema: subPickAdminRouteSchemas.listGrants }, async (request, reply) => {
    if (!(await requireAdminOrStop(request, reply))) return;
    return handle(request, reply, "Failed to list sub pick grants", () => subPicks.listGrants());
  });

  app.post("/api/admin/sub-picks/grants", { schema: subPickAdminRouteSchemas.createGrant }, async (request, reply) => {
    const admin = await requireAdminOrStop(request, reply);
    if (!admin) return;
    const body = parse(createSubGrantRequestSchema, request.body, reply);
    if (!body) return;
    return handle(request, reply, "Failed to create sub pick grant", async () => {
      const grant = await subPicks.createGrant(admin, body);
      realtimeHub.broadcastSubPicksUpdated();
      auditInfo(request.log, admin, `AUDIT: Admin ${admin.username} added ${grant.entryCount} sub pick entries for ${grant.twitchDisplayName}`, {
        grantId: grant.id,
        twitchUserId: grant.twitchUserId
      });
      return reply.status(201).send(grant);
    });
  });

  app.put("/api/admin/sub-picks/grants/:id", { schema: subPickAdminRouteSchemas.updateGrant }, async (request, reply) => {
    const admin = await requireAdminOrStop(request, reply);
    if (!admin) return;
    const body = parse(updateSubGrantRequestSchema, request.body, reply);
    if (!body) return;
    return handle(request, reply, "Failed to update sub pick grant", async () => {
      const grant = await subPicks.updateGrant(admin, routeId(request), body);
      realtimeHub.broadcastSubPicksUpdated();
      auditInfo(request.log, admin, `AUDIT: Admin ${admin.username} updated sub pick grant ${grant.id}`, { grantId: grant.id, changes: body });
      return grant;
    });
  });

  app.delete("/api/admin/sub-picks/grants/:id", { schema: subPickAdminRouteSchemas.deleteGrant }, async (request, reply) => {
    const admin = await requireAdminOrStop(request, reply);
    if (!admin) return;
    return handle(request, reply, "Failed to remove sub pick grant", async () => {
      const grantId = routeId(request);
      const result = await subPicks.deleteGrant(admin, grantId);
      realtimeHub.broadcastSubPicksUpdated();
      auditInfo(request.log, admin, `AUDIT: Admin ${admin.username} removed sub pick grant ${grantId}`, { grantId, ...result });
      return result;
    });
  });

  app.put("/api/admin/sub-picks/entries/:id/pick", { schema: subPickAdminRouteSchemas.setPick }, async (request, reply) => {
    const admin = await requireAdminOrStop(request, reply);
    if (!admin) return;
    const body = parse(setSubEntryPickRequestSchema, request.body, reply);
    if (!body) return;
    return handle(request, reply, "Failed to set sub pick", async () => {
      const entry = await subPicks.setPick(admin, routeId(request), body.gameId);
      realtimeHub.broadcastSubPicksUpdated();
      auditInfo(request.log, admin, `AUDIT: Admin ${admin.username} set the pick for sub pick entry ${entry.id}`, { entryId: entry.id, gameId: body.gameId });
      return entry;
    });
  });

  app.delete("/api/admin/sub-picks/entries/:id", { schema: subPickAdminRouteSchemas.removeEntry }, async (request, reply) => {
    const admin = await requireAdminOrStop(request, reply);
    if (!admin) return;
    return handle(request, reply, "Failed to remove sub pick entry", async () => {
      const entryId = routeId(request);
      const result = await subPicks.removeEntry(admin, entryId);
      realtimeHub.broadcastSubPicksUpdated();
      auditInfo(request.log, admin, `AUDIT: Admin ${admin.username} removed sub pick entry ${entryId}`, { entryId, ...result });
      return result;
    });
  });

  app.get("/api/admin/sub-picks/audit", { schema: subPickAdminRouteSchemas.audit }, async (request, reply) => {
    if (!(await requireAdminOrStop(request, reply))) return;
    return handle(request, reply, "Failed to load sub pick audit log", () => subPicks.audit());
  });
}

function parse<T extends z.ZodType>(schema: T, body: unknown, reply: FastifyReply): z.infer<T> | null {
  const parsed = schema.safeParse(body ?? {});
  if (parsed.success) return parsed.data;
  void reply.status(400).send({ message: parsed.error.issues[0]?.message ?? "Invalid request" });
  return null;
}
