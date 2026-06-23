import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config.js";
import { requestOrigin } from "../utils/requestOrigin.js";

const sitemapPages = [
  { path: "/", changefreq: "weekly", priority: "1.0" },
  { path: "/games", changefreq: "daily", priority: "0.9" },
  { path: "/progress", changefreq: "daily", priority: "0.8" },
  { path: "/votes", changefreq: "daily", priority: "0.9" },
  { path: "/statistics", changefreq: "weekly", priority: "0.7" },
  { path: "/runners", changefreq: "weekly", priority: "0.6" }
] as const;
const sitemapXmlNamespace = `http${"://"}www.sitemaps.org/schemas/sitemap/0.9`;

export async function registerPublicSiteRoutes(app: FastifyInstance, config: AppConfig) {
  app.get("/robots.txt", { schema: { hide: true } }, async (request, reply) => {
    const origin = requestOrigin(request, config.publicBaseUrl);
    return reply.type("text/plain").send(`User-agent: *
Disallow: /api/
Disallow: /admin

Sitemap: ${origin}/sitemap.xml
`);
  });

  app.get("/sitemap.xml", { schema: { hide: true } }, async (request, reply) => {
    const origin = requestOrigin(request, config.publicBaseUrl);
    const urls = sitemapPages
      .map(
        ({ path, changefreq, priority }) => `  <url>
    <loc>${origin}${path}</loc>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`
      )
      .join("\n");

    return reply.type("application/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="${sitemapXmlNamespace}">
${urls}
</urlset>
`);
  });
}
