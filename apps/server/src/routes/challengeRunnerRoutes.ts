import { challengeRunnerInputSchema } from "@ps2-challenge/shared";
import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config.js";
import { requireAdmin } from "../auth/guards.js";
import { challengeRunnerRouteSchemas, registerOpenApiSchemas } from "../openapi/schemas.js";
import type { ChallengeRunnerRepository } from "../repositories/challengeRunnerRepository.js";
import type { UserRepository } from "../repositories/userRepository.js";
import { ChallengeRunnerLogoLookupError, type ChallengeRunnerLogoService } from "../services/challengeRunnerLogoService.js";
import type { ChallengeRunnerLogoRefreshService } from "../services/challengeRunnerLogoRefreshService.js";

export async function registerChallengeRunnerRoutes(
  app: FastifyInstance,
  challengeRunnerRepository: ChallengeRunnerRepository,
  logoService: Pick<ChallengeRunnerLogoService, "resolveLogo">,
  logoRefreshService: Pick<ChallengeRunnerLogoRefreshService, "refreshLogos">,
  userRepository: UserRepository,
  config: AppConfig
) {
  registerOpenApiSchemas(app);
  const requireAdminOrStop = async (request: any, reply: any) => requireAdmin(request, reply, userRepository, config);

  app.get("/api/challenge-runners", { schema: challengeRunnerRouteSchemas.list }, async (request, reply) => {
    try {
      return await challengeRunnerRepository.list();
    } catch (error) {
      request.log.error({ err: error }, "Failed to list challenge runners");
      return reply.status(500).send({ message: "Internal server error" });
    }
  });

  app.post("/api/admin/challenge-runners", { schema: challengeRunnerRouteSchemas.create }, async (request, reply) => {
    try {
      const admin = await requireAdminOrStop(request, reply);
      if (!admin) return;
      const input = parseInput(request.body, reply);
      if (!input) return;
      const logoUrl = await logoService.resolveLogo(input);
      const runner = await challengeRunnerRepository.create(input, logoUrl);
      request.log.info({ adminId: admin.id, challengeRunnerId: runner.id }, "Challenge runner created");
      return reply.status(201).send(runner);
    } catch (error) {
      if (sendLogoLookupError(error, reply)) return;
      request.log.error({ err: error }, "Failed to create challenge runner");
      return reply.status(500).send({ message: "Internal server error" });
    }
  });

  app.post("/api/admin/challenge-runners/refresh-logos", { schema: challengeRunnerRouteSchemas.refreshLogos }, async (request, reply) => {
    try {
      const admin = await requireAdminOrStop(request, reply);
      if (!admin) return;
      request.log.info({ adminId: admin.id }, "Challenge runner profile picture refresh started");
      const result = await logoRefreshService.refreshLogos();
      request.log.info({ adminId: admin.id, ...result }, "Challenge runner profile picture refresh completed");
      return { message: "Challenge runner profile picture refresh completed", ...result };
    } catch (error) {
      request.log.error({ err: error }, "Failed to refresh challenge runner profile pictures");
      return reply.status(500).send({ message: "Internal server error" });
    }
  });

  app.put("/api/admin/challenge-runners/:id", { schema: challengeRunnerRouteSchemas.update }, async (request, reply) => {
    try {
      const admin = await requireAdminOrStop(request, reply);
      if (!admin) return;
      const input = parseInput(request.body, reply);
      if (!input) return;
      const logoUrl = await logoService.resolveLogo(input);
      const runner = await challengeRunnerRepository.update(routeId(request), input, logoUrl);
      if (!runner) return reply.status(404).send({ message: "Challenge runner not found" });
      request.log.info({ adminId: admin.id, challengeRunnerId: runner.id }, "Challenge runner updated");
      return runner;
    } catch (error) {
      if (sendLogoLookupError(error, reply)) return;
      request.log.error({ err: error }, "Failed to update challenge runner");
      return reply.status(500).send({ message: "Internal server error" });
    }
  });

  app.delete("/api/admin/challenge-runners/:id", { schema: challengeRunnerRouteSchemas.delete }, async (request, reply) => {
    try {
      const admin = await requireAdminOrStop(request, reply);
      if (!admin) return;
      const id = routeId(request);
      if (!(await challengeRunnerRepository.delete(id))) {
        return reply.status(404).send({ message: "Challenge runner not found" });
      }
      request.log.info({ adminId: admin.id, challengeRunnerId: id }, "Challenge runner deleted");
      return { message: "Challenge runner deleted" };
    } catch (error) {
      request.log.error({ err: error }, "Failed to delete challenge runner");
      return reply.status(500).send({ message: "Internal server error" });
    }
  });
}

function parseInput(body: unknown, reply: any) {
  const parsed = challengeRunnerInputSchema.safeParse(body);
  if (parsed.success) return parsed.data;
  reply.status(400).send({ message: parsed.error.issues[0]?.message ?? "Invalid challenge runner" });
  return null;
}

function routeId(request: any): number {
  return Number.parseInt((request.params as { id: string }).id, 10);
}

function sendLogoLookupError(error: unknown, reply: any): boolean {
  if (!(error instanceof ChallengeRunnerLogoLookupError)) return false;
  reply.status(error.statusCode).send({ message: error.message });
  return true;
}
