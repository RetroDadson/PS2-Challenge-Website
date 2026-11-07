import { assignEventSubReviewRequestSchema } from "@ps2-challenge/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AppConfig } from "../config.js";
import { createRequireAdmin } from "../auth/guards.js";
import { eventSubAdminRouteSchemas, registerOpenApiSchemas } from "../openapi/schemas.js";
import type { UserRepository } from "../repositories/userRepository.js";
import { EventSubAdminError, type EventSubAdminService } from "../services/eventSubAdminService.js";
import { EventSubPayloadError, EventSubReviewError, type EventSubService } from "../services/eventSubService.js";
import { TwitchApiError } from "../services/twitchApiClient.js";
import { auditInfo } from "../utils/audit.js";
import { requestOrigin } from "../utils/requestOrigin.js";
import type { SubPicksNotifier } from "./subPickRoutes.js";

type EventSubAdmin = Pick<EventSubAdminService, "status" | "syncSubscriptions">;
type EventSubReview = Pick<EventSubService, "reviewQueue" | "assignReview" | "dismissReview" | "retryReview">;

export function registerEventSubAdminRoutes(
  app: FastifyInstance,
  eventSubAdmin: EventSubAdmin,
  eventSubReview: EventSubReview,
  userRepository: UserRepository,
  config: AppConfig,
  realtimeHub: SubPicksNotifier
) {
  registerOpenApiSchemas(app);
  const requireAdminOrStop = createRequireAdmin(userRepository, config);

  app.get("/api/admin/eventsub/status", { schema: eventSubAdminRouteSchemas.status }, async (request, reply) => {
    if (!(await requireAdminOrStop(request, reply))) return;
    return handle(request, reply, "Failed to load EventSub status", () => eventSubAdmin.status(callbackUrl(request, config)));
  });

  app.post("/api/admin/eventsub/subscriptions", { schema: eventSubAdminRouteSchemas.sync }, async (request, reply) => {
    const admin = await requireAdminOrStop(request, reply);
    if (!admin) return;
    return handle(request, reply, "Failed to sync EventSub subscriptions", async () => {
      const result = await eventSubAdmin.syncSubscriptions(admin, callbackUrl(request, config));
      auditInfo(request.log, admin, `AUDIT: Admin ${admin.username} synced Twitch EventSub subscriptions`, {
        created: result.created,
        removed: result.removed,
        errors: result.errors
      });
      return result;
    });
  });

  app.get("/api/admin/eventsub/review", { schema: eventSubAdminRouteSchemas.reviewQueue }, async (request, reply) => {
    if (!(await requireAdminOrStop(request, reply))) return;
    return handle(request, reply, "Failed to load the EventSub review queue", () => eventSubReview.reviewQueue());
  });

  app.post("/api/admin/eventsub/review/:messageId/assign", { schema: eventSubAdminRouteSchemas.assignReview }, async (request, reply) => {
    const admin = await requireAdminOrStop(request, reply);
    if (!admin) return;
    const body = assignEventSubReviewRequestSchema.safeParse(request.body ?? {});
    if (!body.success) {
      return reply.status(400).send({ message: body.error.issues[0]?.message ?? "Invalid viewer" });
    }
    return handle(request, reply, "Failed to assign the EventSub event", async () => {
      const result = await eventSubReview.assignReview(admin, messageId(request), body.data);
      realtimeHub.broadcastSubPicksUpdated();
      auditInfo(request.log, admin, `AUDIT: Admin ${admin.username} gave an anonymous gift to ${body.data.twitchDisplayName}`, { ...result });
      return result;
    });
  });

  app.post("/api/admin/eventsub/review/:messageId/dismiss", { schema: eventSubAdminRouteSchemas.dismissReview }, async (request, reply) => {
    const admin = await requireAdminOrStop(request, reply);
    if (!admin) return;
    return handle(request, reply, "Failed to dismiss the EventSub event", async () => {
      const result = await eventSubReview.dismissReview(admin, messageId(request));
      realtimeHub.broadcastSubPicksUpdated();
      auditInfo(request.log, admin, `AUDIT: Admin ${admin.username} dismissed an EventSub event`, { ...result });
      return result;
    });
  });

  app.post("/api/admin/eventsub/review/:messageId/retry", { schema: eventSubAdminRouteSchemas.retryReview }, async (request, reply) => {
    const admin = await requireAdminOrStop(request, reply);
    if (!admin) return;
    return handle(request, reply, "Failed to retry the EventSub event", async () => {
      const result = await eventSubReview.retryReview(admin, messageId(request));
      realtimeHub.broadcastSubPicksUpdated();
      auditInfo(request.log, admin, `AUDIT: Admin ${admin.username} retried an EventSub event`, { ...result });
      return result;
    });
  });
}

function messageId(request: FastifyRequest): string {
  return (request.params as { messageId: string }).messageId;
}

export function callbackUrl(request: FastifyRequest, config: Pick<AppConfig, "publicBaseUrl">): string {
  return `${requestOrigin(request, config.publicBaseUrl)}/api/eventsub/webhook`;
}

async function handle<T>(request: FastifyRequest, reply: FastifyReply, failureMessage: string, action: () => Promise<T>) {
  try {
    return await action();
  } catch (error) {
    if (error instanceof EventSubAdminError || error instanceof EventSubReviewError) {
      return reply.status(error.statusCode).send({ message: error.message });
    }
    if (error instanceof EventSubPayloadError) {
      return reply.status(400).send({ message: error.message });
    }
    request.log.error({ err: error }, failureMessage);
    if (error instanceof TwitchApiError) {
      return reply.status(502).send({ message: error.message });
    }
    return reply.status(500).send({ message: "Internal server error" });
  }
}
