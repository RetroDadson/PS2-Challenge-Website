import type { EventSubStatusDto, EventSubSubscriptionDto, EventSubSyncResultDto } from "@ps2-challenge/shared";
import type { Kysely } from "kysely";
import type { AppConfig } from "../config.js";
import type { Database } from "../db/kysely.js";
import { eventSubSecret, eventSubSecretFingerprint } from "./eventSubSignature.js";
import { eventSubSubscriptionTypes } from "./eventSubService.js";
import { TwitchApiError, twitchApiBaseUrl, type TwitchApiClient } from "./twitchApiClient.js";

export type EventSubAdminActor = { id: number; username: string };

type TwitchSubscription = {
  id?: string;
  type?: string;
  status?: string;
  created_at?: string;
  condition?: { broadcaster_user_id?: string };
  transport?: { method?: string; callback?: string };
};

type TwitchSubscriptionsResponse = {
  data?: TwitchSubscription[];
  pagination?: { cursor?: string };
};

const healthyStatuses = new Set(["enabled", "webhook_callback_verification_pending"]);
const subscribedTypes: readonly string[] = eventSubSubscriptionTypes;

export class EventSubAdminError extends Error {
  constructor(message: string, readonly statusCode: number) {
    super(message);
    this.name = "EventSubAdminError";
  }
}

export class EventSubAdminService {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly twitch: Pick<TwitchApiClient, "get" | "post" | "delete" | "getUserByLogin">,
    private readonly config: Pick<AppConfig, "twitchChannelLogin" | "twitchClientSecret">
  ) {}

  async broadcasterUserId(): Promise<string | null> {
    const stored = await this.db.selectFrom("eventsub_state").select("broadcaster_user_id").where("id", "=", 1).executeTakeFirst();
    if (stored?.broadcaster_user_id) {
      return stored.broadcaster_user_id;
    }
    const user = await this.twitch.getUserByLogin(this.config.twitchChannelLogin);
    if (!user) {
      return null;
    }
    await this.db.updateTable("eventsub_state").set({ broadcaster_user_id: user.twitchUserId }).where("id", "=", 1).execute();
    return user.twitchUserId;
  }

  async recordAuthorization(broadcasterUserId: string, actor: EventSubAdminActor): Promise<void> {
    await this.db.transaction().execute(async (transaction) => {
      await transaction
        .updateTable("eventsub_state")
        .set({ broadcaster_user_id: broadcasterUserId, authorized_at: new Date(), authorized_by_user_id: actor.id, revoked_at: null, revoked_reason: null })
        .where("id", "=", 1)
        .execute();
      await transaction
        .insertInto("sub_pick_audit")
        .values({ actor_user_id: actor.id, actor_username: actor.username, action: "eventsub.authorize", target_type: "eventsub", target_id: null, details: { broadcasterUserId } })
        .execute();
    });
  }

  async status(callbackUrl: string): Promise<EventSubStatusDto> {
    const state = await this.db
      .selectFrom("eventsub_state as s")
      .leftJoin("users as u", "u.id", "s.authorized_by_user_id")
      .select(["s.broadcaster_user_id", "s.authorized_at", "s.revoked_at", "s.revoked_reason", "s.secret_fingerprint", "u.twitch_username as authorized_by"])
      .where("s.id", "=", 1)
      .executeTakeFirstOrThrow();
    let subscriptions: EventSubSubscriptionDto[] = [];
    let subscriptionsError: string | null = null;
    let broadcasterUserId = state.broadcaster_user_id;
    try {
      broadcasterUserId ??= await this.broadcasterUserId();
      subscriptions = broadcasterUserId ? await this.listSubscriptions(broadcasterUserId, callbackUrl) : [];
    } catch (error) {
      subscriptionsError = error instanceof Error ? error.message : String(error);
    }
    return {
      secretConfigured: this.secret() !== null,
      secretChanged: this.secretChanged(state.secret_fingerprint),
      channelLogin: this.config.twitchChannelLogin,
      broadcasterUserId,
      callbackUrl,
      authorizedAt: state.authorized_at?.toISOString() ?? null,
      authorizedBy: state.authorized_by,
      revokedAt: state.revoked_at?.toISOString() ?? null,
      revokedReason: state.revoked_reason,
      subscriptions,
      missingTypes: eventSubSubscriptionTypes.filter((type) => !subscriptions.some((subscription) => subscription.type === type && subscription.healthy)),
      subscriptionsError
    };
  }

  async syncSubscriptions(actor: EventSubAdminActor, callbackUrl: string): Promise<EventSubSyncResultDto> {
    const secret = this.secret();
    if (!secret) {
      throw new EventSubAdminError("Set TWITCH_CLIENT_SECRET before creating subscriptions", 400);
    }
    const broadcasterUserId = await this.broadcasterUserId();
    if (!broadcasterUserId) {
      throw new EventSubAdminError(`Couldn't find the Twitch channel ${this.config.twitchChannelLogin}`, 400);
    }

    const state = await this.db.selectFrom("eventsub_state").select("secret_fingerprint").where("id", "=", 1).executeTakeFirst();
    const replaceAll = this.secretChanged(state?.secret_fingerprint ?? null);
    const listed = await this.listSubscriptions(broadcasterUserId, callbackUrl);
    const existing = replaceAll ? listed.map((subscription) => ({ ...subscription, healthy: false })) : listed;
    const stale = existing.filter((subscription) => !subscription.healthy);
    await Promise.all(stale.map((subscription) => this.twitch.delete(subscriptionUrl({ id: subscription.id }))));

    const missing = eventSubSubscriptionTypes.filter((type) => !existing.some((subscription) => subscription.type === type && subscription.healthy));
    const results = await Promise.all(
      missing.map(async (type) => {
        try {
          await this.twitch.post(subscriptionUrl(), {
            type,
            version: "1",
            condition: { broadcaster_user_id: broadcasterUserId },
            transport: { method: "webhook", callback: callbackUrl, secret }
          });
          return { type, error: null };
        } catch (error) {
          return { type, error: describeCreateError(type, error) };
        }
      })
    );

    const created = results.filter((result) => result.error === null).map((result) => result.type);
    const errors = results.flatMap((result) => (result.error ? [result.error] : []));
    if (errors.length === 0) {
      await this.db.updateTable("eventsub_state").set({ secret_fingerprint: eventSubSecretFingerprint(secret) }).where("id", "=", 1).execute();
    }
    await this.db
      .insertInto("sub_pick_audit")
      .values({
        actor_user_id: actor.id,
        actor_username: actor.username,
        action: "eventsub.sync",
        target_type: "eventsub",
        target_id: null,
        details: { created, removed: stale.length, errors, callbackUrl }
      })
      .execute();
    return { created, removed: stale.length, errors, status: await this.status(callbackUrl) };
  }

  private secret(): string | null {
    return eventSubSecret(this.config.twitchClientSecret);
  }

  private secretChanged(storedFingerprint: string | null): boolean {
    const secret = this.secret();
    return Boolean(storedFingerprint && secret && storedFingerprint !== eventSubSecretFingerprint(secret));
  }

  private async listSubscriptions(broadcasterUserId: string, callbackUrl: string): Promise<EventSubSubscriptionDto[]> {
    const subscriptions: TwitchSubscription[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 5; page++) {
      const url = subscriptionUrl({ user_id: broadcasterUserId, ...(cursor ? { after: cursor } : {}) });
      const body = await this.twitch.get<TwitchSubscriptionsResponse>(url);
      subscriptions.push(...(body.data ?? []));
      cursor = body.pagination?.cursor;
      if (!cursor) break;
    }
    return subscriptions
      .filter(
        (subscription) =>
          subscribedTypes.includes(subscription.type ?? "") &&
          subscription.condition?.broadcaster_user_id === broadcasterUserId &&
          subscription.transport?.method === "webhook"
      )
      .map((subscription) => ({
        id: subscription.id ?? "",
        type: subscription.type ?? "",
        status: subscription.status ?? "unknown",
        callback: subscription.transport?.callback ?? null,
        createdAt: subscription.created_at ?? null,
        healthy: healthyStatuses.has(subscription.status ?? "") && subscription.transport?.callback === callbackUrl
      }));
  }
}

function subscriptionUrl(params: Record<string, string> = {}): URL {
  const url = new URL(`${twitchApiBaseUrl}/eventsub/subscriptions`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url;
}

function describeCreateError(type: string, error: unknown): string {
  if (error instanceof TwitchApiError && error.status === 403) {
    return `${type}: the channel hasn't authorised subscription access yet`;
  }
  if (error instanceof TwitchApiError && error.status === 409) {
    return `${type}: Twitch already has this subscription`;
  }
  return `${type}: ${error instanceof Error ? error.message : String(error)}`;
}
