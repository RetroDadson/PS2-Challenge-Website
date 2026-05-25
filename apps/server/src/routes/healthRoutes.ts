import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { healthRouteSchemas, registerOpenApiSchemas } from "../openapi/schemas.js";

export type DatabaseHealthCheck = () => Promise<unknown>;

export async function registerHealthRoutes(app: FastifyInstance, checkDatabase: DatabaseHealthCheck) {
  registerOpenApiSchemas(app);
  async function health(request: FastifyRequest, reply: FastifyReply) {
    try {
      const started = performance.now();
      const checks: Array<{
        name: string;
        status: string;
        description?: string;
        duration: string;
        tags: string[];
        exception?: string;
      }> = [];
      let status = "Healthy";

      const databaseStarted = performance.now();
      try {
        await checkDatabase();
        checks.push({
          name: "database",
          status: "Healthy",
          description: "PostgreSQL connection succeeded",
          duration: formatDuration(performance.now() - databaseStarted),
          tags: ["db", "postgres"]
        });
      } catch (error) {
        status = "Unhealthy";
        checks.push({
          name: "database",
          status: "Unhealthy",
          description: "PostgreSQL connection failed",
          duration: formatDuration(performance.now() - databaseStarted),
          exception: error instanceof Error ? error.message : String(error),
          tags: ["db", "postgres"]
        });
      }

      const body = {
        status,
        totalDuration: formatDuration(performance.now() - started),
        checks
      };

      if (status !== "Healthy") {
        request.log.warn({ status, checks }, `Health check failed: ${status}`);
      }

      return reply.status(status === "Healthy" ? 200 : 503).send(body);
    } catch (error) {
      request.log.error({ err: error }, "Error performing health check");
      return reply.status(503).send({
        status: "Unhealthy",
        totalDuration: "00:00:00.000",
        checks: [
          {
            name: "health",
            status: "Unhealthy",
            description: "Health check failed",
            duration: "00:00:00.000",
            exception: error instanceof Error ? error.message : String(error),
            tags: ["health"]
          }
        ]
      });
    }
  }

  app.get("/api/health", { schema: healthRouteSchemas.health }, health);
  app.get("/health", { schema: healthRouteSchemas.health }, health);
  app.get("/api/health/ping", { schema: healthRouteSchemas.ping }, async () => ({
    status: "OK",
    timestamp: new Date().toISOString(),
    message: "PS2 Challenge API is running"
  }));
}

function formatDuration(milliseconds: number) {
  return `00:00:${Math.max(0, milliseconds / 1000).toFixed(3).padStart(6, "0")}`;
}
