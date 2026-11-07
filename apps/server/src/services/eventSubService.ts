import { subTierSchema, type AssignEventSubReviewRequest, type EventSubReviewItemDto, type EventSubReviewResultDto } from "@ps2-challenge/shared";
import type { Kysely, Transaction } from "kysely";
import type { Database, EventSubMessageStatus } from "../db/kysely.js";
import type { EventSubGrantInput, SubPickService } from "./subPickService.js";

export const eventSubSubscriptionTypes = ["channel.subscribe", "channel.subscription.message", "channel.subscription.gift"] as const;

export type EventSubOutcome = Extract<EventSubMessageStatus, "processed" | "ignored" | "failed" | "needs_review"> | "duplicate";

export type EventSubDecision =
  | { kind: "grant"; grant: EventSubGrantInput }
  | { kind: "ignored"; reason: string }
  | { kind: "review"; reason: string };

type EventPayload = Record<string, unknown>;

export class EventSubPayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EventSubPayloadError";
  }
}

export class EventSubReviewError extends Error {
  constructor(message: string, readonly statusCode: number) {
    super(message);
    this.name = "EventSubReviewError";
  }
}

export type EventSubReviewActor = { id: number; username: string };

export class EventSubService {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly subPicks: Pick<SubPickService, "createEventSubGrant">
  ) {}

  async handleNotification(messageId: string, subscriptionType: string, event: EventPayload): Promise<EventSubOutcome> {
    if (await this.isDuplicate(messageId)) {
      return "duplicate";
    }
    try {
      return await this.db.transaction().execute(async (transaction) => {
        const decision = decideEventSubNotification(subscriptionType, event);
        const grantId = decision.kind === "grant" ? await this.subPicks.createEventSubGrant(transaction, decision.grant) : null;
        const status = outcomeStatus(decision);
        await transaction
          .insertInto("eventsub_messages")
          .values({
            message_id: messageId,
            message_type: "notification",
            subscription_type: subscriptionType,
            status,
            payload: status === "needs_review" ? event : null,
            error: decision.kind === "grant" ? null : decision.reason,
            grant_id: grantId
          })
          .execute();
        return status;
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        return "duplicate";
      }
      await this.db
        .insertInto("eventsub_messages")
        .values({
          message_id: messageId,
          message_type: "notification",
          subscription_type: subscriptionType,
          status: "failed",
          payload: event,
          error: error instanceof Error ? error.message : String(error)
        })
        .onConflict((oc) => oc.column("message_id").doNothing())
        .execute();
      return "failed";
    }
  }

  async handleRevocation(messageId: string, subscription: { type?: unknown; status?: unknown }): Promise<void> {
    const reason = typeof subscription.status === "string" ? subscription.status : "revoked";
    await this.db.transaction().execute(async (transaction) => {
      await transaction
        .insertInto("eventsub_messages")
        .values({
          message_id: messageId,
          message_type: "revocation",
          subscription_type: typeof subscription.type === "string" ? subscription.type : "unknown",
          status: "processed",
          error: reason
        })
        .onConflict((oc) => oc.column("message_id").doNothing())
        .execute();
      await transaction.updateTable("eventsub_state").set({ revoked_at: new Date(), revoked_reason: reason }).where("id", "=", 1).execute();
    });
  }

  async reviewQueue(): Promise<EventSubReviewItemDto[]> {
    const rows = await this.db
      .selectFrom("eventsub_messages")
      .select(["message_id", "subscription_type", "status", "error", "received_at", "payload"])
      .where("status", "in", ["needs_review", "failed"])
      .orderBy("received_at", "desc")
      .orderBy("message_id")
      .execute();
    return rows.map((row) => ({
      messageId: row.message_id,
      subscriptionType: row.subscription_type,
      status: row.status === "failed" ? "failed" : "needs_review",
      reason: row.error,
      receivedAt: row.received_at.toISOString(),
      tier: typeof row.payload?.tier === "string" ? row.payload.tier : null,
      total: typeof row.payload?.total === "number" ? row.payload.total : null,
      twitchDisplayName: typeof row.payload?.user_name === "string" && row.payload.user_name ? row.payload.user_name : null
    }));
  }

  assignReview(actor: EventSubReviewActor, messageId: string, viewer: AssignEventSubReviewRequest): Promise<EventSubReviewResultDto> {
    return this.db.transaction().execute(async (transaction) => {
      const row = await this.lockReviewItem(transaction, messageId);
      if (row.status !== "needs_review" || row.subscription_type !== "channel.subscription.gift") {
        throw new EventSubReviewError("Only anonymous gifts waiting for review can be given to a viewer", 409);
      }
      const payload = row.payload ?? {};
      const total = typeof payload.total === "number" && Number.isInteger(payload.total) && payload.total > 0 ? payload.total : 1;
      const grantId = await this.subPicks.createEventSubGrant(transaction, {
        ...viewer,
        tier: tier(payload),
        grantType: "gift",
        giftCount: total,
        notes: `Anonymous gift given by ${actor.username}`
      });
      await this.resolve(transaction, actor, messageId, { status: "resolved", grant_id: grantId, error: row.error }, "eventsub.review.assign", { twitchUserId: viewer.twitchUserId, grantId });
      return { messageId, status: "resolved", grantId, error: null };
    });
  }

  dismissReview(actor: EventSubReviewActor, messageId: string): Promise<EventSubReviewResultDto> {
    return this.db.transaction().execute(async (transaction) => {
      const row = await this.lockReviewItem(transaction, messageId);
      if (row.status !== "needs_review" && row.status !== "failed") {
        throw new EventSubReviewError("This event has already been dealt with", 409);
      }
      await this.resolve(transaction, actor, messageId, { status: "dismissed", grant_id: null, error: row.error }, "eventsub.review.dismiss", {});
      return { messageId, status: "dismissed", grantId: null, error: row.error };
    });
  }

  retryReview(actor: EventSubReviewActor, messageId: string): Promise<EventSubReviewResultDto> {
    return this.db.transaction().execute(async (transaction) => {
      const row = await this.lockReviewItem(transaction, messageId);
      if (row.status !== "failed") {
        throw new EventSubReviewError("Only failed events can be retried", 409);
      }
      let decision: EventSubDecision;
      try {
        decision = decideEventSubNotification(row.subscription_type, row.payload ?? {});
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await transaction.updateTable("eventsub_messages").set({ error: message }).where("message_id", "=", messageId).execute();
        return { messageId, status: "failed", grantId: null, error: message };
      }
      const grantId = decision.kind === "grant" ? await this.subPicks.createEventSubGrant(transaction, decision.grant) : null;
      const status = outcomeStatus(decision);
      const error = decision.kind === "grant" ? null : decision.reason;
      await this.resolve(transaction, actor, messageId, { status, grant_id: grantId, error, keepPayload: status === "needs_review" }, "eventsub.review.retry", { status, grantId });
      return { messageId, status, grantId, error };
    });
  }

  private async lockReviewItem(transaction: Transaction<Database>, messageId: string) {
    const row = await transaction
      .selectFrom("eventsub_messages")
      .select(["message_id", "subscription_type", "status", "payload", "error"])
      .where("message_id", "=", messageId)
      .forUpdate()
      .executeTakeFirst();
    if (!row) {
      throw new EventSubReviewError("Event not found", 404);
    }
    return row;
  }

  private async resolve(
    transaction: Transaction<Database>,
    actor: EventSubReviewActor,
    messageId: string,
    outcome: { status: EventSubMessageStatus; grant_id: number | null; error: string | null; keepPayload?: boolean },
    action: string,
    details: Record<string, unknown>
  ): Promise<void> {
    await transaction
      .updateTable("eventsub_messages")
      .set({
        status: outcome.status,
        grant_id: outcome.grant_id,
        error: outcome.error,
        ...(outcome.keepPayload ? {} : { payload: null }),
        resolved_by_user_id: outcome.keepPayload ? null : actor.id,
        resolved_at: outcome.keepPayload ? null : new Date()
      })
      .where("message_id", "=", messageId)
      .execute();
    await transaction
      .insertInto("sub_pick_audit")
      .values({ actor_user_id: actor.id, actor_username: actor.username, action, target_type: "eventsub_message", target_id: null, details: { messageId, ...details } })
      .execute();
  }

  private async isDuplicate(messageId: string): Promise<boolean> {
    const existing = await this.db.selectFrom("eventsub_messages").select("message_id").where("message_id", "=", messageId).executeTakeFirst();
    return existing !== undefined;
  }
}

const decisions: Record<(typeof eventSubSubscriptionTypes)[number], (event: EventPayload) => EventSubDecision> = {
  "channel.subscribe": decideNewSub,
  "channel.subscription.message": decideResub,
  "channel.subscription.gift": decideGift
};

export function decideEventSubNotification(subscriptionType: string, event: EventPayload): EventSubDecision {
  const decide = Object.hasOwn(decisions, subscriptionType) ? decisions[subscriptionType as keyof typeof decisions] : undefined;
  return decide ? decide(event) : { kind: "ignored", reason: `Unhandled subscription type ${subscriptionType}` };
}

function decideNewSub(event: EventPayload): EventSubDecision {
  if (event.is_gift === true) {
    return { kind: "ignored", reason: "Gift recipient; entries go to the gifter" };
  }
  return { kind: "grant", grant: { ...viewer(event), tier: tier(event), grantType: "new" } };
}

function decideResub(event: EventPayload): EventSubDecision {
  const months = typeof event.cumulative_months === "number" ? event.cumulative_months : null;
  return { kind: "grant", grant: { ...viewer(event), tier: tier(event), grantType: "resub", notes: months ? `Resub, ${months} months` : null } };
}

function decideGift(event: EventPayload): EventSubDecision {
  const total = typeof event.total === "number" && Number.isInteger(event.total) && event.total > 0 ? event.total : null;
  if (total === null) {
    throw new EventSubPayloadError("Gift event is missing a valid total");
  }
  if (event.is_anonymous === true || !event.user_id) {
    return { kind: "review", reason: `Anonymous gift of ${total} ${total === 1 ? "sub" : "subs"}` };
  }
  return { kind: "grant", grant: { ...viewer(event), tier: tier(event), grantType: "gift", giftCount: total } };
}

function viewer(event: EventPayload): Pick<EventSubGrantInput, "twitchUserId" | "twitchLogin" | "twitchDisplayName"> {
  const twitchUserId = event.user_id;
  if (typeof twitchUserId !== "string" || !/^\d{1,20}$/.test(twitchUserId)) {
    throw new EventSubPayloadError("Event is missing a valid user_id");
  }
  const login = typeof event.user_login === "string" && event.user_login ? event.user_login : twitchUserId;
  const displayName = typeof event.user_name === "string" && event.user_name ? event.user_name : login;
  return { twitchUserId, twitchLogin: login, twitchDisplayName: displayName };
}

function tier(event: EventPayload): EventSubGrantInput["tier"] {
  const parsed = subTierSchema.exclude(["prime"]).safeParse(event.tier);
  if (!parsed.success) {
    throw new EventSubPayloadError(`Unknown subscription tier ${String(event.tier)}`);
  }
  return parsed.data;
}

function outcomeStatus(decision: EventSubDecision): Exclude<EventSubOutcome, "duplicate" | "failed"> {
  if (decision.kind === "grant") return "processed";
  return decision.kind === "review" ? "needs_review" : "ignored";
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "23505";
}
