import fastify from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { registerPublicSiteRoutes } from "../src/routes/publicSiteRoutes.js";

const config = {
  nodeEnv: "Testing",
  port: 0,
  databaseConnectionString: "postgres://localhost/test",
  twitchClientId: "test-client",
  twitchClientSecret: "test-secret",
  publicBaseUrl: "https://fallback.example",
  cookieSecret: "test-cookie-secret"
};

describe("public site routes", () => {
  let app: ReturnType<typeof fastify> | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("generates sitemap URLs from the host that received the request", async () => {
    app = fastify({ logger: false, trustProxy: true });
    await registerPublicSiteRoutes(app, config);

    const response = await app.inject({
      method: "GET",
      url: "/sitemap.xml",
      headers: {
        host: "appservice.example",
        "x-forwarded-host": "challenge.retrodadson.example",
        "x-forwarded-proto": "https"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("application/xml");
    expect(response.body).toContain("<loc>https://challenge.retrodadson.example/</loc>");
    expect(response.body).toContain("<loc>https://challenge.retrodadson.example/statistics</loc>");
    expect(response.body).toContain("<loc>https://challenge.retrodadson.example/runners</loc>");
    expect(response.body).not.toContain("appservice.example");
  });

  it("points robots at the matching request host", async () => {
    app = fastify({ logger: false, trustProxy: true });
    await registerPublicSiteRoutes(app, config);

    const response = await app.inject({
      method: "GET",
      url: "/robots.txt",
      headers: {
        host: "vanity.example",
        "x-forwarded-proto": "https"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/plain");
    expect(response.body).toContain("Disallow: /api/");
    expect(response.body).toContain("Sitemap: https://vanity.example/sitemap.xml");
  });

  it("keeps a forwarded non-default access port when it is sent separately", async () => {
    app = fastify({ logger: false, trustProxy: true });
    await registerPublicSiteRoutes(app, config);

    const response = await app.inject({
      method: "GET",
      url: "/sitemap.xml",
      headers: {
        host: "internal.example:5001",
        "x-forwarded-host": "localhost",
        "x-forwarded-port": "5173",
        "x-forwarded-proto": "http"
      }
    });

    expect(response.body).toContain("<loc>http://localhost:5173/statistics</loc>");
    expect(response.body).not.toContain("internal.example:5001");
  });
});
