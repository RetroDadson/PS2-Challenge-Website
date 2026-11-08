import cookie from "@fastify/cookie";
import fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSessionCookie, oauthStateCookieName } from "../src/auth/session.js";
import { registerAuthRoutes, type EventSubAuthorization } from "../src/routes/authRoutes.js";

const config = {
  nodeEnv: "Testing",
  port: 0,
  databaseConnectionString: "postgres://localhost/test",
  twitchClientId: "test-client",
  twitchClientSecret: "test-secret",
  publicBaseUrl: "http://localhost",
  cookieSecret: "test-cookie-secret"
};

describe("auth routes", () => {
  let app: ReturnType<typeof fastify> | undefined;

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    await app?.close();
    app = undefined;
  });

  it("redirects callback requests without a code, with a forged state, or without a Twitch user", async () => {
    app = await authApp({
      getByTwitchId: vi.fn()
    });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({ access_token: "token" }))
        .mockResolvedValueOnce(jsonResponse({ data: [] }))
    );

    const missingCode = await app.inject({ method: "GET", url: "/api/auth/callback" });
    expect(missingCode.statusCode).toBe(302);
    expect(missingCode.headers.location).toBe("/");

    const forgedState = await app.inject({ method: "GET", url: "/api/auth/callback?code=abc&state=not-base64" });
    expect(forgedState.statusCode).toBe(302);
    expect(forgedState.headers.location).toBe("/");
    expect(fetch).not.toHaveBeenCalled();

    const login = await startLogin(app, "/votes");
    const missingNonce = await app.inject({ method: "GET", url: `/api/auth/callback?code=abc&state=${encodeURIComponent(login.state)}` });
    expect(missingNonce.statusCode).toBe(302);
    expect(missingNonce.headers.location).toBe("/");
    expect(fetch).not.toHaveBeenCalled();

    const noUser = await app.inject({
      method: "GET",
      url: `/api/auth/callback?code=abc&state=${encodeURIComponent(login.state)}`,
      cookies: { [oauthStateCookieName]: login.nonce }
    });
    expect(noUser.statusCode).toBe(302);
    expect(noUser.headers.location).toBe("/");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("creates a new Twitch user, updates profile data, sets the auth cookie, and sanitizes restricted return URLs", async () => {
    const repository = {
      getByTwitchId: vi.fn(async () => null),
      createUser: vi.fn(async () => ({
        id: 7,
        twitchId: "tw-7",
        twitchUsername: "Dadson",
        roleName: "User",
        profileImageUrl: null
      })),
      updateLastLogin: vi.fn(async () => undefined),
      updateProfileImage: vi.fn(async () => undefined)
    };
    app = await authApp(repository);
    const login = await startLogin(app, "/admin", { "x-forwarded-proto": "https", "x-forwarded-host": "www.retrodadson.example" });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({ access_token: "token" }))
        .mockResolvedValueOnce(jsonResponse({ data: [{ id: "tw-7", login: "dadson", display_name: "Dadson", profile_image_url: "https://example.com/new.png" }] }))
    );

    const response = await app.inject({
      method: "GET",
      url: `/api/auth/callback?code=abc&state=${encodeURIComponent(login.state)}`,
      cookies: { [oauthStateCookieName]: login.nonce }
    });

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe("/");
    expect(response.headers["set-cookie"]).toEqual(expect.arrayContaining([expect.stringContaining(".PS2Challenge.Auth=")]));
    expect(repository.createUser).toHaveBeenCalledWith("tw-7", "Dadson", "https://example.com/new.png");
    expect(repository.updateLastLogin).toHaveBeenCalledWith(7);
    expect(repository.updateProfileImage).toHaveBeenCalledWith(7, "https://example.com/new.png");
    const tokenRequest = vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit;
    expect(tokenRequest.body?.toString()).toContain("redirect_uri=https%3A%2F%2Fwww.retrodadson.example%2Fapi%2Fauth%2Fcallback");
  });

  it("returns authenticated-user fallback states from the session cookie", async () => {
    app = await authApp({
      getByTwitchId: vi.fn(async () => null)
    });

    const anonymous = await app.inject({ method: "GET", url: "/api/auth/user" });
    expect(anonymous.json()).toEqual({ isAuthenticated: false });

    const missingUser = await app.inject({
      method: "GET",
      url: "/api/auth/user",
      cookies: {
        ".PS2Challenge.Auth": createSessionCookie({ id: 1, twitchId: "tw-missing", username: "Gone", role: "User" }, config.cookieSecret)
      }
    });
    expect(missingUser.json()).toEqual({ isAuthenticated: false });
  });
});

describe("EventSub authorisation", () => {
  let app: ReturnType<typeof fastify> | undefined;
  const adminUser = { id: 3, twitchId: "tw-admin", twitchUsername: "StreamAdmin", roleName: "Admin", profileImageUrl: null };
  const adminCookie = { ".PS2Challenge.Auth": createSessionCookie({ id: 3, twitchId: "tw-admin", username: "StreamAdmin", role: "Admin" }, config.cookieSecret) };

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    await app?.close();
    app = undefined;
  });

  function authorization() {
    return { broadcasterUserId: vi.fn(async () => "500"), recordAuthorization: vi.fn(async () => undefined) };
  }

  async function start(target: ReturnType<typeof fastify>) {
    const response = await target.inject({ method: "GET", url: "/api/admin/eventsub/authorize", cookies: adminCookie });
    expect(response.statusCode).toBe(302);
    const location = new URL(response.headers.location as string);
    return { location, state: location.searchParams.get("state")!, nonce: response.cookies.find((entry) => entry.name === oauthStateCookieName)!.value };
  }

  async function complete(target: ReturnType<typeof fastify>, login: { state: string; nonce: string }) {
    return target.inject({
      method: "GET",
      url: `/api/auth/callback?code=abc&state=${encodeURIComponent(login.state)}`,
      cookies: { [oauthStateCookieName]: login.nonce }
    });
  }

  it("is only available to admins when EventSub is wired up", async () => {
    app = await authApp({ getByTwitchId: vi.fn(async () => ({ ...adminUser, roleName: "User" })) }, authorization());
    expect((await app.inject({ method: "GET", url: "/api/admin/eventsub/authorize" })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/api/admin/eventsub/authorize", cookies: adminCookie })).statusCode).toBe(403);
    await app.close();

    app = await authApp({ getByTwitchId: vi.fn(async () => adminUser) });
    expect((await app.inject({ method: "GET", url: "/api/admin/eventsub/authorize", cookies: adminCookie })).statusCode).toBe(404);
  });

  it("asks Twitch for channel:read:subscriptions and records it without changing the site login", async () => {
    const eventSub = authorization();
    app = await authApp({ getByTwitchId: vi.fn(async () => adminUser) }, eventSub);
    const login = await start(app);
    expect(login.location.origin + login.location.pathname).toBe("https://id.twitch.tv/oauth2/authorize");
    expect(login.location.searchParams.get("scope")).toBe("channel:read:subscriptions");
    expect(login.location.searchParams.get("force_verify")).toBe("true");

    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({ access_token: "channel-token" }))
        .mockResolvedValueOnce(jsonResponse({ user_id: "500", scopes: ["channel:read:subscriptions"] }))
    );
    const response = await complete(app, login);

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe("/admin/sub-picks?tab=twitch&eventsub=authorised");
    expect(response.cookies.find((entry) => entry.name === ".PS2Challenge.Auth")).toBeUndefined();
    expect(eventSub.recordAuthorization).toHaveBeenCalledWith("500", { id: 3, username: "StreamAdmin" });
    expect(vi.mocked(fetch).mock.calls[1]?.[0]).toBe("https://id.twitch.tv/oauth2/validate");
    expect(vi.mocked(fetch).mock.calls[1]?.[1]).toEqual({ headers: { Authorization: "OAuth channel-token" } });
  });

  it.each([
    ["wrong-account", { user_id: "123", scopes: ["channel:read:subscriptions"] }],
    ["missing-scope", { user_id: "500", scopes: ["user:read:email"] }],
    ["missing-scope", { user_id: "500" }]
  ])("reports %s without recording the authorisation", async (result, validation) => {
    const eventSub = authorization();
    app = await authApp({ getByTwitchId: vi.fn(async () => adminUser) }, eventSub);
    const login = await start(app);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse({ access_token: "token" })).mockResolvedValueOnce(jsonResponse(validation)));

    expect((await complete(app, login)).headers.location).toBe(`/admin/sub-picks?tab=twitch&eventsub=${result}`);
    expect(eventSub.recordAuthorization).not.toHaveBeenCalled();
  });

  it("refuses admins who lost the role and reports Twitch failures", async () => {
    const getByTwitchId = vi.fn(async () => adminUser);
    const eventSub = authorization();
    app = await authApp({ getByTwitchId }, eventSub);

    const demoted = await start(app);
    getByTwitchId.mockResolvedValueOnce({ ...adminUser, roleName: "User" });
    vi.stubGlobal("fetch", vi.fn());
    expect((await complete(app, demoted)).headers.location).toBe("/admin/sub-picks?tab=twitch&eventsub=forbidden");
    expect(fetch).not.toHaveBeenCalled();

    const failedValidation = await start(app);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse({ access_token: "token" })).mockResolvedValueOnce(jsonResponse({}, 401)));
    expect((await complete(app, failedValidation)).headers.location).toBe("/admin/sub-picks?tab=twitch&eventsub=failed");

    const noBroadcaster = await start(app);
    eventSub.broadcasterUserId.mockResolvedValueOnce(null);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse({ access_token: "token" })).mockResolvedValueOnce(jsonResponse({ user_id: "500", scopes: [] })));
    expect((await complete(app, noBroadcaster)).headers.location).toBe("/admin/sub-picks?tab=twitch&eventsub=wrong-account");
    expect(eventSub.recordAuthorization).not.toHaveBeenCalled();
  });
});

async function authApp(repository: object, eventSubAuthorization?: EventSubAuthorization) {
  const app = fastify({ logger: false });
  await app.register(cookie);
  registerAuthRoutes(app, repository as never, config, eventSubAuthorization);
  return app;
}

async function startLogin(app: ReturnType<typeof fastify>, returnUrl: string, headers: Record<string, string> = {}) {
  const response = await app.inject({ method: "GET", url: `/api/auth/login?returnUrl=${encodeURIComponent(returnUrl)}`, headers });
  expect(response.statusCode).toBe(302);
  const state = new URL(response.headers.location as string).searchParams.get("state");
  const nonce = response.cookies.find((entry) => entry.name === oauthStateCookieName)?.value;
  expect(state).toBeTruthy();
  expect(nonce).toBeTruthy();
  return { state: state!, nonce: nonce! };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}
