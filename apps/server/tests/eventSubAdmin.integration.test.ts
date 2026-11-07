import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { closeDbClient, createDbClient } from "../src/db/client.js";
import { buildApp } from "../src/server.js";
import { EventSubAdminService } from "../src/services/eventSubAdminService.js";
import { eventSubSecret } from "../src/services/eventSubSignature.js";
import { TwitchApiError } from "../src/services/twitchApiClient.js";
import { seedUser, startIntegrationDatabase, type IntegrationDatabase } from "./helpers/postgres.js";

const admin = { "x-api-key": "admin-api-key" };
const viewer = { "x-api-key": "viewer-api-key" };
const publicHost = { "x-forwarded-proto": "https", "x-forwarded-host": "ps2.example" };
const callback = "https://ps2.example/api/eventsub/webhook";

type FakeSubscription = { id: string; type: string; status: string; created_at: string; condition: { broadcaster_user_id: string }; transport: { method: string; callback: string } };

class FakeTwitch {
  subscriptions: FakeSubscription[] = [];
  secrets: string[] = [];
  authorised = true;
  failListing = false;
  lookups = 0;
  private sequence = 0;

  async getUserByLogin(login: string) {
    this.lookups++;
    return login === "retrodadson" ? { twitchUserId: "500", login, displayName: "RetroDadson", profileImageUrl: null } : null;
  }

  async get<T>(url: URL): Promise<T> {
    if (this.failListing) throw new TwitchApiError(500, "Helix is down");
    const userId = url.searchParams.get("user_id");
    return { data: this.subscriptions.filter((subscription) => subscription.condition.broadcaster_user_id === userId) } as T;
  }

  async post<T>(_url: URL, body: { type: string; condition: { broadcaster_user_id: string }; transport: { callback: string; secret: string } }): Promise<T> {
    if (!this.authorised) throw new TwitchApiError(403, "subscription missing proper authorization");
    this.secrets.push(body.transport.secret);
    this.subscriptions.push({
      id: `sub-${++this.sequence}`,
      type: body.type,
      status: "webhook_callback_verification_pending",
      created_at: "2026-11-07T12:00:00Z",
      condition: body.condition,
      transport: { method: "webhook", callback: body.transport.callback }
    });
    return { data: [] } as T;
  }

  async delete(url: URL): Promise<void> {
    this.subscriptions = this.subscriptions.filter((subscription) => subscription.id !== url.searchParams.get("id"));
  }

  existing(type: string, status: string, callbackUrl = callback, broadcaster = "500") {
    this.subscriptions.push({
      id: `old-${++this.sequence}`,
      type,
      status,
      created_at: "2026-01-01T00:00:00Z",
      condition: { broadcaster_user_id: broadcaster },
      transport: { method: "webhook", callback: callbackUrl }
    });
  }
}

const twitch = new FakeTwitch();

describe("Twitch EventSub admin", () => {
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
      { dbClient: createDbClient({ databaseConnectionString: db.connectionString }), twitchApi: twitch }
    );
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await db?.stop();
  });

  beforeEach(async () => {
    await db.reset();
    twitch.subscriptions = [];
    twitch.authorised = true;
    twitch.failListing = false;
    twitch.lookups = 0;
    await seedUser(db.pool, "Admin", "admin-api-key", { twitchId: "9000", username: "StreamAdmin" });
    await seedUser(db.pool, "User", "viewer-api-key", { twitchId: "1001", username: "ViewerOne" });
  });

  const status = async () => (await app.inject({ method: "GET", url: "/api/admin/eventsub/status", headers: { ...admin, ...publicHost } })).json();
  const sync = () => app.inject({ method: "POST", url: "/api/admin/eventsub/subscriptions", headers: { ...admin, ...publicHost } });

  it("is admin only", async () => {
    expect((await app.inject({ method: "GET", url: "/api/admin/eventsub/status" })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/api/admin/eventsub/status", headers: viewer })).statusCode).toBe(403);
    expect((await app.inject({ method: "POST", url: "/api/admin/eventsub/subscriptions", headers: viewer })).statusCode).toBe(403);
  });

  it("reports the channel, callback and missing subscriptions, caching the broadcaster ID", async () => {
    const first = await status();
    expect(first).toEqual({
      secretConfigured: true,
      secretChanged: false,
      channelLogin: "retrodadson",
      broadcasterUserId: "500",
      callbackUrl: callback,
      authorizedAt: null,
      authorizedBy: null,
      revokedAt: null,
      revokedReason: null,
      subscriptions: [],
      missingTypes: ["channel.subscribe", "channel.subscription.message", "channel.subscription.gift"],
      subscriptionsError: null
    });
    await status();
    expect(twitch.lookups).toBe(1);
  });

  it("creates the three subscriptions against this site's webhook and records who did it", async () => {
    const response = await sync();
    expect(response.statusCode).toBe(200);
    const result = response.json();
    expect(result).toMatchObject({ created: ["channel.subscribe", "channel.subscription.message", "channel.subscription.gift"], removed: 0, errors: [] });
    expect(result.status.missingTypes).toEqual([]);
    expect(result.status.subscriptions.map((subscription: { type: string; healthy: boolean; callback: string }) => [subscription.type, subscription.healthy, subscription.callback])).toEqual([
      ["channel.subscribe", true, callback],
      ["channel.subscription.message", true, callback],
      ["channel.subscription.gift", true, callback]
    ]);

    const audit = (await app.inject({ method: "GET", url: "/api/admin/sub-picks/audit", headers: admin })).json();
    expect(audit[0]).toMatchObject({ actor: "StreamAdmin", action: "eventsub.sync", details: { removed: 0, callbackUrl: callback } });

    expect((await sync()).json()).toMatchObject({ created: [], removed: 0, errors: [] });
  });

  it("replaces failed or moved subscriptions and ignores other channels", async () => {
    twitch.existing("channel.subscribe", "enabled");
    twitch.existing("channel.subscription.message", "authorization_revoked");
    twitch.existing("channel.subscription.gift", "enabled", "https://old-host.example/api/eventsub/webhook");
    twitch.existing("channel.subscribe", "enabled", callback, "999");

    const before = await status();
    expect(before.subscriptions.map((subscription: { status: string; healthy: boolean }) => [subscription.status, subscription.healthy])).toEqual([
      ["enabled", true],
      ["authorization_revoked", false],
      ["enabled", false]
    ]);
    expect(before.missingTypes).toEqual(["channel.subscription.message", "channel.subscription.gift"]);

    const result = (await sync()).json();
    expect(result).toMatchObject({ created: ["channel.subscription.message", "channel.subscription.gift"], removed: 2, errors: [] });
    expect(twitch.subscriptions.filter((subscription) => subscription.condition.broadcaster_user_id === "999")).toHaveLength(1);
  });

  it("explains when the channel hasn't authorised access and when Twitch can't be reached", async () => {
    twitch.authorised = false;
    const result = (await sync()).json();
    expect(result.created).toEqual([]);
    expect(result.errors).toEqual([
      "channel.subscribe: the channel hasn't authorised subscription access yet",
      "channel.subscription.message: the channel hasn't authorised subscription access yet",
      "channel.subscription.gift: the channel hasn't authorised subscription access yet"
    ]);

    twitch.failListing = true;
    expect((await status()).subscriptionsError).toBe("Twitch API request failed: 500 (Helix is down)");
    const failedSync = await sync();
    expect(failedSync.statusCode).toBe(502);
    expect(failedSync.json().message).toBe("Twitch API request failed: 500 (Helix is down)");
  });

  it("signs subscriptions with a secret derived from the client secret and replaces them when it changes", async () => {
    const client = createDbClient({ databaseConnectionString: db.connectionString });
    const actor = { id: 1, username: "StreamAdmin" };
    const original = new EventSubAdminService(client.db, twitch, { twitchChannelLogin: "retrodadson", twitchClientSecret: "test-secret" });
    twitch.secrets = [];
    expect(await original.syncSubscriptions(actor, callback)).toMatchObject({ created: expect.arrayContaining(["channel.subscribe"]), errors: [] });
    expect(new Set(twitch.secrets)).toEqual(new Set([eventSubSecret("test-secret")]));
    expect(eventSubSecret("test-secret")).toMatch(/^[0-9a-f]{64}$/);
    expect(eventSubSecret("test-secret")).not.toContain("test-secret");
    expect(eventSubSecret("")).toBeNull();
    expect((await original.status(callback)).secretChanged).toBe(false);

    const rotated = new EventSubAdminService(client.db, twitch, { twitchChannelLogin: "retrodadson", twitchClientSecret: "rotated-secret" });
    expect((await rotated.status(callback)).secretChanged).toBe(true);
    twitch.secrets = [];
    const repaired = await rotated.syncSubscriptions(actor, callback);
    expect(repaired).toMatchObject({ removed: 3, errors: [] });
    expect(repaired.created).toHaveLength(3);
    expect(new Set(twitch.secrets)).toEqual(new Set([eventSubSecret("rotated-secret")]));
    expect(repaired.status.secretChanged).toBe(false);
    await closeDbClient(client);
  });

  it("shows authorisation and revocation state", async () => {
    const client = createDbClient({ databaseConnectionString: db.connectionString });
    const service = new EventSubAdminService(client.db, twitch, {
      twitchChannelLogin: "retrodadson",
      twitchClientSecret: "test-secret"
    });
    await db.pool.query("UPDATE eventsub_state SET revoked_at = CURRENT_TIMESTAMP, revoked_reason = 'user_removed'");
    expect(await status()).toMatchObject({ revokedReason: "user_removed", authorizedAt: null });

    await service.recordAuthorization("500", { id: 1, username: "StreamAdmin" });
    const after = await status();
    expect(after).toMatchObject({ authorizedBy: "StreamAdmin", revokedAt: null, revokedReason: null });
    expect(Date.parse(after.authorizedAt)).not.toBeNaN();
    await closeDbClient(client);
  });
});

describe("EventSubAdminService without setup", () => {
  it("refuses to sync without a secret or a findable channel", async () => {
    const db = { selectFrom: () => ({ select: () => ({ where: () => ({ executeTakeFirst: async () => ({ broadcaster_user_id: null }) }) }) }), updateTable: () => ({}) };
    const noSecret = new EventSubAdminService(db as never, twitch, { twitchChannelLogin: "retrodadson", twitchClientSecret: "" });
    await expect(noSecret.syncSubscriptions({ id: 1, username: "A" }, callback)).rejects.toThrow("Set TWITCH_CLIENT_SECRET before creating subscriptions");

    const unknownChannel = new EventSubAdminService(db as never, twitch, { twitchChannelLogin: "nobody", twitchClientSecret: "test-secret" });
    await expect(unknownChannel.syncSubscriptions({ id: 1, username: "A" }, callback)).rejects.toThrow("Couldn't find the Twitch channel nobody");
  });
});
