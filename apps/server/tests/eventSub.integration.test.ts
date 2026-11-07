import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDbClient } from "../src/db/client.js";
import { RealtimeHub } from "../src/realtime/hub.js";
import { buildApp } from "../src/server.js";
import { eventSubSecret, eventSubSignature } from "../src/services/eventSubSignature.js";
import { seedUser, startIntegrationDatabase, type IntegrationDatabase } from "./helpers/postgres.js";

const secret = eventSubSecret("test-secret")!;
const admin = { "x-api-key": "admin-api-key" };

class CountingHub extends RealtimeHub {
  subPickUpdates = 0;

  override broadcastSubPicksUpdated(): void {
    this.subPickUpdates++;
    super.broadcastSubPicksUpdated();
  }
}

const realtimeHub = new CountingHub();
let messageSequence = 0;

describe("Twitch EventSub webhook", () => {
  let db: IntegrationDatabase;
  let app: FastifyInstance;

  beforeAll(async () => {
    db = await startIntegrationDatabase();
    app = await buildApp(
      {
        nodeEnv: "Testing",
        port: 0,
        databaseConnectionString: db.connectionString,
        twitchClientId: "test-client",
        twitchClientSecret: "test-secret",
        twitchChannelLogin: "retrodadson",
        publicBaseUrl: "http://localhost",
        cookieSecret: "test-cookie-secret",
        logLevel: "silent",
        trustProxy: true
      },
      { dbClient: createDbClient({ databaseConnectionString: db.connectionString }), realtimeHub, twitchUserLookup: { getUserByLogin: async () => null } }
    );
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await db?.stop();
  });

  beforeEach(async () => {
    await db.reset();
    realtimeHub.subPickUpdates = 0;
    await seedUser(db.pool, "Admin", "admin-api-key", { twitchId: "9000", username: "StreamAdmin" });
  });

  function send(body: unknown, options: { type?: string; messageId?: string; timestamp?: string; signingSecret?: string; contentType?: string } = {}) {
    const raw = JSON.stringify(body);
    const messageId = options.messageId ?? `message-${++messageSequence}`;
    const timestamp = options.timestamp ?? new Date().toISOString();
    return app.inject({
      method: "POST",
      url: "/api/eventsub/webhook",
      payload: raw,
      headers: {
        "content-type": options.contentType ?? "application/json",
        "twitch-eventsub-message-id": messageId,
        "twitch-eventsub-message-timestamp": timestamp,
        "twitch-eventsub-message-type": options.type ?? "notification",
        "twitch-eventsub-message-signature": eventSubSignature(messageId, timestamp, Buffer.from(raw), options.signingSecret ?? secret)
      }
    });
  }

  function notification(type: string, event: Record<string, unknown>) {
    return { subscription: { id: "sub-1", type, version: "1", status: "enabled" }, event };
  }

  async function grants() {
    return (await app.inject({ method: "GET", url: "/api/admin/sub-picks/grants", headers: admin })).json();
  }

  async function messages() {
    return (await db.pool.query("SELECT message_id, message_type, subscription_type, status, payload, error, grant_id FROM eventsub_messages ORDER BY received_at, message_id")).rows;
  }

  it("echoes verification challenges as plain text", async () => {
    const response = await send({ challenge: "pogchamp-kappa-360noscope", subscription: { type: "channel.subscribe" } }, { type: "webhook_callback_verification" });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toMatch(/^text\/plain/);
    expect(response.body).toBe("pogchamp-kappa-360noscope");

    expect((await send({ subscription: {} }, { type: "webhook_callback_verification" })).statusCode).toBe(400);
  });

  it("rejects bad signatures, stale timestamps and unreadable bodies", async () => {
    const event = notification("channel.subscribe", { user_id: "1001", user_login: "viewerone", user_name: "ViewerOne", tier: "1000", is_gift: false });
    expect((await send(event, { signingSecret: "someone-elses-secret" })).statusCode).toBe(403);
    expect((await send(event, { timestamp: new Date(Date.now() - 11 * 60 * 1000).toISOString() })).statusCode).toBe(403);

    const timestamp = new Date().toISOString();
    const unreadable = await app.inject({
      method: "POST",
      url: "/api/eventsub/webhook",
      payload: "not json",
      headers: {
        "content-type": "application/json",
        "twitch-eventsub-message-id": "bad-body",
        "twitch-eventsub-message-timestamp": timestamp,
        "twitch-eventsub-message-type": "notification",
        "twitch-eventsub-message-signature": eventSubSignature("bad-body", timestamp, Buffer.from("not json"), secret)
      }
    });
    expect(unreadable.statusCode).toBe(400);
    const plainText = await send(event, { contentType: "text/plain" });
    expect(plainText.statusCode).toBe(400);
    expect(plainText.json()).toEqual({ message: "Expected a JSON body" });
    expect(await grants()).toEqual([]);
  });

  it("creates entries for new subs, resubs and gifts, credited to the gifter", async () => {
    expect((await send(notification("channel.subscribe", { user_id: "1001", user_login: "viewerone", user_name: "ViewerOne", tier: "3000", is_gift: false }))).statusCode).toBe(204);
    await send(notification("channel.subscription.message", { user_id: "1002", user_login: "viewertwo", user_name: "ViewerTwo", tier: "1000", cumulative_months: 7 }));
    await send(notification("channel.subscription.gift", { user_id: "1003", user_login: "gifter", user_name: "Gifter", tier: "2000", total: 3, is_anonymous: false }));
    await send(notification("channel.subscribe", { user_id: "1004", user_login: "recipient", user_name: "Recipient", tier: "2000", is_gift: true }));

    const created = await grants();
    expect(created.map((grant: Record<string, unknown>) => [grant.twitchDisplayName, grant.grantType, grant.tier, grant.entryCount, grant.source, grant.createdBy])).toEqual([
      ["Gifter", "gift", "2000", 6, "eventsub", null],
      ["ViewerTwo", "resub", "1000", 1, "eventsub", null],
      ["ViewerOne", "new", "3000", 5, "eventsub", null]
    ]);
    expect(created[1].notes).toBe("Resub, 7 months");
    expect((await messages()).map((row) => [row.subscription_type, row.status, row.grant_id !== null, row.payload])).toEqual([
      ["channel.subscribe", "processed", true, null],
      ["channel.subscription.message", "processed", true, null],
      ["channel.subscription.gift", "processed", true, null],
      ["channel.subscribe", "ignored", false, null]
    ]);
    expect(realtimeHub.subPickUpdates).toBe(3);

    const audit = (await app.inject({ method: "GET", url: "/api/admin/sub-picks/audit", headers: admin })).json();
    expect(audit[0]).toMatchObject({ actor: "Twitch", action: "grant.eventsub", targetType: "grant" });
  });

  it("ignores repeated deliveries of the same message", async () => {
    const event = notification("channel.subscribe", { user_id: "1001", user_login: "viewerone", user_name: "ViewerOne", tier: "1000", is_gift: false });
    expect((await send(event, { messageId: "repeat-me" })).statusCode).toBe(204);
    expect((await send(event, { messageId: "repeat-me" })).statusCode).toBe(204);
    expect(await grants()).toHaveLength(1);
    expect(await messages()).toHaveLength(1);
    expect(realtimeHub.subPickUpdates).toBe(1);
  });

  it("keeps anonymous gifts and failed events for review with their payload", async () => {
    const anonymous = { user_id: null, user_login: null, user_name: null, tier: "1000", total: 2, is_anonymous: true };
    await send(notification("channel.subscription.gift", anonymous));
    const broken = { user_id: "1001", user_login: "viewerone", user_name: "ViewerOne", tier: "9000", is_gift: false };
    expect((await send(notification("channel.subscribe", broken))).statusCode).toBe(204);

    expect(await grants()).toEqual([]);
    expect((await messages()).map((row) => [row.status, row.payload, row.error])).toEqual([
      ["needs_review", anonymous, "Anonymous gift of 2 subs"],
      ["failed", broken, "Unknown subscription tier 9000"]
    ]);
    expect(realtimeHub.subPickUpdates).toBe(1);
  });

  it("lets admins give anonymous gifts to a viewer, dismiss events and retry failures", async () => {
    await seedUser(db.pool, "User", "viewer-api-key", { twitchId: "1001", username: "ViewerOne" });
    const anonymous = { user_id: null, user_login: null, user_name: null, tier: "2000", total: 2, is_anonymous: true };
    await send(notification("channel.subscription.gift", anonymous), { messageId: "anon-1" });
    await send(notification("channel.subscribe", { user_id: "1001", user_login: "viewerone", user_name: "ViewerOne", tier: "9000", is_gift: false }), { messageId: "broken-1" });
    await send(notification("channel.subscribe", { user_id: "1002", user_login: "other", user_name: "Other", tier: "7000", is_gift: false }), { messageId: "broken-2" });
    realtimeHub.subPickUpdates = 0;

    expect((await app.inject({ method: "GET", url: "/api/admin/eventsub/review", headers: { "x-api-key": "viewer-api-key" } })).statusCode).toBe(403);
    const queue = (await app.inject({ method: "GET", url: "/api/admin/eventsub/review", headers: admin })).json();
    expect(queue.map((item: Record<string, unknown>) => [item.messageId, item.status, item.tier, item.total, item.twitchDisplayName, item.reason])).toEqual(
      expect.arrayContaining([
        ["anon-1", "needs_review", "2000", 2, null, "Anonymous gift of 2 subs"],
        ["broken-1", "failed", "9000", null, "ViewerOne", "Unknown subscription tier 9000"],
        ["broken-2", "failed", "7000", null, "Other", "Unknown subscription tier 7000"]
      ])
    );

    const viewer = { twitchUserId: "1001", twitchLogin: "viewerone", twitchDisplayName: "ViewerOne" };
    const review = (id: string, action: string, payload?: unknown) =>
      app.inject({ method: "POST", url: `/api/admin/eventsub/review/${id}/${action}`, headers: admin, ...(payload === undefined ? {} : { payload }) });

    expect((await review("anon-1", "assign", { twitchUserId: "abc" })).statusCode).toBe(400);
    expect((await review("missing", "assign", viewer)).statusCode).toBe(404);
    expect((await review("broken-1", "assign", viewer)).statusCode).toBe(409);
    expect((await review("anon-1", "retry")).statusCode).toBe(409);

    const assigned = await review("anon-1", "assign", viewer);
    expect(assigned.json()).toMatchObject({ messageId: "anon-1", status: "resolved", error: null });
    const gift = (await grants()).find((grant: { id: number }) => grant.id === assigned.json().grantId);
    expect(gift).toMatchObject({ twitchDisplayName: "ViewerOne", grantType: "gift", tier: "2000", giftCount: 2, entryCount: 4, notes: "Anonymous gift given by StreamAdmin" });
    expect((await review("anon-1", "assign", viewer)).statusCode).toBe(409);

    const stillBroken = await review("broken-1", "retry");
    expect(stillBroken.json()).toEqual({ messageId: "broken-1", status: "failed", grantId: null, error: "Unknown subscription tier 9000" });
    await db.pool.query("UPDATE eventsub_messages SET payload = jsonb_set(payload, '{tier}', '\"3000\"') WHERE message_id = 'broken-1'");
    const retried = await review("broken-1", "retry");
    expect(retried.json()).toMatchObject({ messageId: "broken-1", status: "processed", error: null });
    expect((await grants()).find((grant: { id: number }) => grant.id === retried.json().grantId)).toMatchObject({ tier: "3000", entryCount: 5 });

    expect((await review("broken-2", "dismiss")).json()).toEqual({ messageId: "broken-2", status: "dismissed", grantId: null, error: "Unknown subscription tier 7000" });
    expect((await review("broken-2", "dismiss")).statusCode).toBe(409);

    expect((await app.inject({ method: "GET", url: "/api/admin/eventsub/review", headers: admin })).json()).toEqual([]);
    const stored = (await db.pool.query("SELECT message_id, status, payload, resolved_by_user_id FROM eventsub_messages WHERE message_id IN ('anon-1', 'broken-1', 'broken-2') ORDER BY message_id")).rows;
    expect(stored.map((row) => [row.message_id, row.status, row.payload, row.resolved_by_user_id !== null])).toEqual([
      ["anon-1", "resolved", null, true],
      ["broken-1", "processed", null, true],
      ["broken-2", "dismissed", null, true]
    ]);
    const audit = (await app.inject({ method: "GET", url: "/api/admin/sub-picks/audit", headers: admin })).json();
    expect(audit.filter((row: { action: string }) => row.action.startsWith("eventsub.review")).map((row: { actor: string; action: string }) => [row.actor, row.action])).toEqual([
      ["StreamAdmin", "eventsub.review.dismiss"],
      ["StreamAdmin", "eventsub.review.retry"],
      ["StreamAdmin", "eventsub.review.assign"]
    ]);
    expect(realtimeHub.subPickUpdates).toBe(4);
  });

  it("keeps a retried event in review when it turns out to be an anonymous gift", async () => {
    await db.pool.query(
      "INSERT INTO eventsub_messages (message_id, message_type, subscription_type, status, payload, error) VALUES ('late-anon', 'notification', 'channel.subscription.gift', 'failed', $1, 'boom')",
      [{ user_id: null, tier: "1000", total: 1, is_anonymous: true }]
    );
    const retried = await app.inject({ method: "POST", url: "/api/admin/eventsub/review/late-anon/retry", headers: admin });
    expect(retried.json()).toEqual({ messageId: "late-anon", status: "needs_review", grantId: null, error: "Anonymous gift of 1 sub" });
    const row = (await db.pool.query("SELECT payload, resolved_by_user_id FROM eventsub_messages WHERE message_id = 'late-anon'")).rows[0];
    expect(row.payload).toMatchObject({ is_anonymous: true });
    expect(row.resolved_by_user_id).toBeNull();
  });

  it("records revocations and accepts unknown message types", async () => {
    const response = await send({ subscription: { type: "channel.subscribe", status: "authorization_revoked" } }, { type: "revocation", messageId: "revoked-1" });
    expect(response.statusCode).toBe(204);
    expect(await messages()).toEqual([
      expect.objectContaining({ message_id: "revoked-1", message_type: "revocation", subscription_type: "channel.subscribe", status: "processed", error: "authorization_revoked" })
    ]);
    const state = (await db.pool.query("SELECT revoked_at, revoked_reason FROM eventsub_state")).rows[0];
    expect(state.revoked_reason).toBe("authorization_revoked");
    expect(state.revoked_at).toBeInstanceOf(Date);

    await send({ subscription: {} }, { type: "revocation", messageId: "revoked-2" });
    expect((await db.pool.query("SELECT revoked_reason FROM eventsub_state")).rows[0].revoked_reason).toBe("revoked");
    expect((await send({}, { type: "something_new" })).statusCode).toBe(204);
  });
});

describe("Twitch EventSub webhook without a secret", () => {
  it("refuses messages until the secret is configured", async () => {
    const fastify = (await import("fastify")).default;
    const { registerEventSubRoutes } = await import("../src/routes/eventSubRoutes.js");
    const app = fastify();
    await registerEventSubRoutes(app, {} as never, {}, { broadcastSubPicksUpdated: () => undefined });
    const response = await app.inject({ method: "POST", url: "/api/eventsub/webhook", payload: "{}", headers: { "content-type": "application/json" } });
    expect(response.statusCode).toBe(503);
    await app.close();
  });
});
