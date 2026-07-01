import {
  archiveVotesRequestSchema,
  currentVoteSchema,
  fillRandomVotesRequestSchema,
  updateVoteByGameNumberRequestSchema,
  uploadRoundSchema
} from "@ps2-challenge/shared";
import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config.js";
import { createRequireAdmin } from "../auth/guards.js";
import { registerOpenApiSchemas, voteRouteSchemas } from "../openapi/schemas.js";
import type { UserRepository } from "../repositories/userRepository.js";
import type { RealtimeHub } from "../realtime/hub.js";
import type { VoteService } from "../services/voteService.js";
import { auditInfo } from "../utils/audit.js";
import { errorMessage } from "../utils/errors.js";

export async function registerVotesRoutes(
  app: FastifyInstance,
  voteService: VoteService,
  userRepository: UserRepository,
  config: AppConfig,
  realtimeHub: RealtimeHub
) {
  registerOpenApiSchemas(app);
  const requireAdminOrStop = createRequireAdmin(userRepository, config);

  app.get("/api/votes/history", { schema: voteRouteSchemas.history }, async () => voteService.getVoteHistory());
  app.get("/api/votes/current", { schema: voteRouteSchemas.current }, async () => voteService.getCurrentVotes());

  app.post("/api/votes/upload", { schema: voteRouteSchemas.upload }, async (request, reply) => {
    const user = await requireAdminOrStop(request, reply);
    if (!user) return;
    const rounds = Array.isArray(request.body) ? request.body : null;
    if (!rounds) {
      return reply.status(400).send({ message: "No rounds provided" });
    }
    const parsed = uploadRoundSchema.array().safeParse(rounds);
    if (!parsed.success) {
      return reply.status(400).send({ message: parsed.error.issues[0]?.message ?? "Invalid rounds" });
    }
    for (const round of parsed.data) {
      const error = validateUploadRound(round);
      if (error) {
        return reply.status(400).send({ message: error });
      }
    }
    try {
      const result = await voteService.uploadHistory(parsed.data);
      realtimeHub.broadcastVotesUpdated();
      auditInfo(request.log, user, `AUDIT: Admin ${user.username} uploaded vote history`, {
        rounds: parsed.data.length,
        result
      });
      return result;
    } catch (error) {
      return reply.status(400).send({ message: errorMessage(error) });
    }
  });

  app.post("/api/votes/current", { schema: voteRouteSchemas.setCurrent }, async (request, reply) => {
    const user = await requireAdminOrStop(request, reply);
    if (!user) return;
    const parsed = currentVoteSchema.array().safeParse(request.body);
    if (!parsed.success || parsed.data.length === 0) {
      return reply.status(400).send({ message: "No votes provided" });
    }
    try {
      const result = await voteService.setCurrentVotes(parsed.data);
      realtimeHub.broadcastVotesUpdated();
      auditInfo(request.log, user, `AUDIT: Admin ${user.username} updated current votes`, {
        votes: parsed.data.length,
        inserted: result.inserted,
        updated: result.updated
      });
      return result;
    } catch (error) {
      return reply.status(400).send({ message: errorMessage(error) });
    }
  });

  app.delete("/api/votes/current/:gameTitle", { schema: voteRouteSchemas.deleteCurrent }, async (request, reply) => {
    const user = await requireAdminOrStop(request, reply);
    if (!user) return;
    const gameTitle = safeDecodeURIComponent((request.params as { gameTitle: string }).gameTitle);
    try {
      const removed = await voteService.removeCurrentVote(gameTitle);
      if (!removed) {
        return reply.status(404).send({ message: `No current vote found for '${gameTitle}'` });
      }
      realtimeHub.broadcastVotesUpdated();
      auditInfo(request.log, user, `AUDIT: Admin ${user.username} removed current vote for '${gameTitle}'`, { gameTitle });
      return { message: `Current vote for '${gameTitle}' removed successfully` };
    } catch (error) {
      return reply.status(errorMessage(error).includes("not found") ? 404 : 400).send({ message: errorMessage(error) });
    }
  });

  app.post("/api/votes/archive", { schema: voteRouteSchemas.archive }, async (request, reply) => {
    const user = await requireAdminOrStop(request, reply);
    if (!user) return;
    const parsed = archiveVotesRequestSchema.safeParse(request.body ?? {});
    try {
      const result = await voteService.archiveCurrentVotes(
        parsed.success ? parsed.data.notes : null,
        parsed.success ? (parsed.data.manualPositions as Record<number, number> | null | undefined) ?? undefined : undefined
      );
      realtimeHub.broadcastVotesUpdated();
      auditInfo(request.log, user, `AUDIT: Admin ${user.username} archived current votes`, {
        round: result.roundNumber,
        archivedCount: result.archivedCount
      });
      return {
        message: "Current votes archived successfully",
        round: result.roundNumber,
        archivedCount: result.archivedCount
      };
    } catch (error) {
      return reply.status(400).send({ message: errorMessage(error) });
    }
  });

  app.put("/api/votes/current/by-game-number", { schema: voteRouteSchemas.updateByGameNumber }, async (request, reply) => {
    const user = await requireAdminOrStop(request, reply);
    if (!user) return;
    const parsed = parseUpdateVoteByGameNumber(request.body);
    if (!parsed) {
      return reply.status(400).send({ message: "Request data is required" });
    }
    if (parsed.gameNumber < 1 || parsed.gameNumber > 3) {
      return reply.status(400).send({ message: "Game number must be between 1 and 3" });
    }
    if (parsed.voteCount < 0) {
      return reply.status(400).send({ message: "Vote count cannot be negative" });
    }

    const updated = await voteService.updateVoteCountByGameNumber(parsed.gameNumber, parsed.voteCount);
    if (!updated) {
      return reply.status(404).send({ message: `No current vote found for game number ${parsed.gameNumber}` });
    }
    realtimeHub.broadcastVotesUpdated();
    auditInfo(request.log, user, `AUDIT: Admin ${user.username} updated vote count for game number ${updated.gameNumber}`, {
      gameNumber: updated.gameNumber,
      gameTitle: updated.gameTitle,
      gameId: updated.gameId,
      voteCount: updated.voteCount
    });
    return {
      message: `Vote count updated successfully for game number ${updated.gameNumber}`,
      gameNumber: updated.gameNumber,
      gameTitle: updated.gameTitle,
      gameId: updated.gameId,
      voteCount: updated.voteCount
    };
  });

  app.post("/api/votes/current/fill-random", { schema: voteRouteSchemas.fillRandom }, async (request, reply) => {
    const user = await requireAdminOrStop(request, reply);
    if (!user) return;
    const parsed = parseFillRandomVotes(request.body);
    if (!parsed) {
      return reply.status(400).send({ message: "Request data is required" });
    }
    if (parsed.count <= 0) {
      return reply.status(400).send({ message: "Count must be greater than 0" });
    }
    try {
      const addedVotes = await voteService.fillCurrentVotesWithRandomGameDetails(parsed.count);
      realtimeHub.broadcastVotesUpdated();
      auditInfo(request.log, user, `AUDIT: Admin ${user.username} filled current votes with random games`, {
        requestedCount: parsed.count,
        addedCount: addedVotes.length
      });
      return { message: `Successfully added ${addedVotes.length} random game(s) to current votes`, addedGames: addedVotes };
    } catch (error) {
      return reply.status(400).send({ message: errorMessage(error) });
    }
  });
}

function validateUploadRound(round: { voteRound: number; votes: Array<{ gameTitle: string; count: number; position?: number | null | undefined }> }): string | null {
  if (round.votes.length !== 3) {
    return `Round ${round.voteRound} must contain exactly 3 vote entries`;
  }
  const titles = round.votes.map((vote) => vote.gameTitle.trim().toLocaleLowerCase("en-GB"));
  if (titles.some((title) => !title)) {
    return `Empty game title in round ${round.voteRound}`;
  }
  if (new Set(titles).size !== titles.length) {
    return `Round ${round.voteRound} contains duplicate game titles`;
  }
  const invalidPosition = round.votes.find((vote) => vote.position !== null && vote.position !== undefined && (vote.position < 1 || vote.position > 3));
  if (invalidPosition) {
    return `Invalid position ${invalidPosition.position} in round ${round.voteRound} for '${invalidPosition.gameTitle}'. Position must be 1, 2, or 3.`;
  }
  return null;
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function parseUpdateVoteByGameNumber(body: unknown): { gameNumber: number; voteCount: number } | null {
  if (!body || typeof body !== "object") {
    return null;
  }
  const parsed = updateVoteByGameNumberRequestSchema
    .partial()
    .safeParse(body);
  const value = parsed.success ? parsed.data : (body as { gameNumber?: unknown; voteCount?: unknown });
  const gameNumber = Number(value.gameNumber);
  const voteCount = Number(value.voteCount);
  if (!Number.isInteger(gameNumber) || !Number.isInteger(voteCount)) {
    return null;
  }
  return { gameNumber, voteCount };
}

function parseFillRandomVotes(body: unknown): { count: number } | null {
  if (!body || typeof body !== "object") {
    return null;
  }
  const parsed = fillRandomVotesRequestSchema
    .partial()
    .safeParse(body);
  const value = parsed.success ? parsed.data : (body as { count?: unknown });
  const count = Number(value.count);
  if (!Number.isInteger(count)) {
    return null;
  }
  return { count };
}
