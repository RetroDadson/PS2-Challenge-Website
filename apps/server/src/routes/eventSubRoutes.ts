import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AppConfig } from "../config.js";
import { eventSubRouteSchemas, registerOpenApiSchemas } from "../openapi/schemas.js";
import { eventSubHeaders, verifyEventSubSignature, eventSubSecret } from "../services/eventSubSignature.js";
import type { EventSubService } from "../services/eventSubService.js";
import type { SubPicksNotifier } from "./subPickRoutes.js";

type EventSubHandler = Pick<EventSubService, "handleNotification" | "handleRevocation">;

type EventSubBody = {
  challenge?: unknown;
  subscription?: { type?: unknown; status?: unknown };
  event?: unknown;
};

export async function registerEventSubRoutes(
  app: FastifyInstance,
  eventSub: EventSubHandler,
  config: Pick<AppConfig, "twitchClientSecret">,
  realtimeHub: SubPicksNotifier,
  now: () => Date = () => new Date()
) {
  registerOpenApiSchemas(app);
  await app.register((scope, _options, done) => {
    scope.removeContentTypeParser("application/json");
    scope.addContentTypeParser("application/json", { parseAs: "buffer" }, (_request, body, done) => done(null, body));

    scope.post("/api/eventsub/webhook", { schema: eventSubRouteSchemas.webhook }, async (request, reply) => {
      const secret = eventSubSecret(config.twitchClientSecret);
      if (!secret) {
        return reply.status(503).send({ message: "Twitch EventSub is not configured" });
      }
      if (!Buffer.isBuffer(request.body)) {
        return reply.status(400).send({ message: "Expected a JSON body" });
      }
      const messageId = header(request, eventSubHeaders.messageId);
      const verification = verifyEventSubSignature({
        messageId,
        timestamp: header(request, eventSubHeaders.timestamp),
        signature: header(request, eventSubHeaders.signature),
        rawBody: request.body,
        secret,
        now: now()
      });
      if (verification !== "valid") {
        request.log.warn({ messageId, verification }, "Rejected Twitch EventSub message");
        return reply.status(403).send({ message: "Invalid signature" });
      }

      const body = parseBody(request.body);
      if (!body || !messageId) {
        return reply.status(400).send({ message: "Invalid EventSub message" });
      }
      return dispatch(request, reply, messageId, body, eventSub, realtimeHub);
    });
    done();
  });
}

async function dispatch(
  request: FastifyRequest,
  reply: FastifyReply,
  messageId: string,
  body: EventSubBody,
  eventSub: EventSubHandler,
  realtimeHub: SubPicksNotifier
) {
  const messageType = header(request, eventSubHeaders.messageType);
  const subscriptionType = typeof body.subscription?.type === "string" ? body.subscription.type : "unknown";

  if (messageType === "webhook_callback_verification") {
    if (typeof body.challenge !== "string") {
      return reply.status(400).send({ message: "Missing challenge" });
    }
    request.log.info({ subscriptionType }, "Verified Twitch EventSub subscription");
    return reply.status(200).type("text/plain").send(body.challenge);
  }

  if (messageType === "revocation") {
    await eventSub.handleRevocation(messageId, body.subscription ?? {});
    request.log.warn({ subscriptionType, status: body.subscription?.status }, "Twitch revoked an EventSub subscription");
    return reply.status(204).send();
  }

  if (messageType === "notification") {
    const event = body.event && typeof body.event === "object" ? (body.event as Record<string, unknown>) : {};
    const outcome = await eventSub.handleNotification(messageId, subscriptionType, event);
    request.log.info({ messageId, subscriptionType, outcome }, "Handled Twitch EventSub notification");
    if (outcome === "processed" || outcome === "needs_review") {
      realtimeHub.broadcastSubPicksUpdated();
    }
    return reply.status(204).send();
  }

  return reply.status(204).send();
}

function header(request: FastifyRequest, name: string): string | undefined {
  const value = request.headers[name];
  return typeof value === "string" ? value : undefined;
}

function parseBody(rawBody: Buffer): EventSubBody | null {
  try {
    const parsed: unknown = JSON.parse(rawBody.toString("utf8"));
    return parsed && typeof parsed === "object" ? (parsed as EventSubBody) : null;
  } catch {
    return null;
  }
}
