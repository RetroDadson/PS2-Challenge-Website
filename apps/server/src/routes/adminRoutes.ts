import { updateRoleRequestSchema } from "@ps2-challenge/shared";
import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config.js";
import { requireAdmin } from "../auth/guards.js";
import { adminRouteSchemas, registerOpenApiSchemas } from "../openapi/schemas.js";
import type { UserRepository } from "../repositories/userRepository.js";
import type { TwitchStreamSyncResult } from "../services/twitchStreamStatsService.js";
import { auditError, auditInfo, auditWarn } from "../utils/audit.js";

type TwitchStreamSyncProvider = {
  syncRecentStreams(): Promise<TwitchStreamSyncResult>;
};

export async function registerAdminRoutes(
  app: FastifyInstance,
  userRepository: UserRepository,
  config: AppConfig,
  twitchStats?: TwitchStreamSyncProvider
) {
  registerOpenApiSchemas(app);
  const requireAdminOrStop = async (request: any, reply: any) => requireAdmin(request, reply, userRepository, config);

  app.get("/api/admin/users", { schema: adminRouteSchemas.users }, async (request, reply) => {
    try {
      const user = await requireAdminOrStop(request, reply);
      if (!user) return;
      request.log.info({ adminUser: user.username, adminId: user.id }, `GetAllUsers called by ${user.username}`);
      const users = await userRepository.getAllUsers();
      request.log.info({ adminUser: user.username, adminId: user.id, count: users.length }, `Returning ${users.length} users`);
      return users;
    } catch (error) {
      request.log.error({ err: error }, "Failed to get admin users");
      return reply.status(500).send({ message: "Internal server error" });
    }
  });

  app.get("/api/admin/roles", { schema: adminRouteSchemas.roles }, async (request, reply) => {
    try {
      const user = await requireAdminOrStop(request, reply);
      if (!user) return;
      request.log.info({ adminUser: user.username, adminId: user.id }, `GetAllRoles called by ${user.username}`);
      const roles = await userRepository.getAllRoles();
      request.log.info({ adminUser: user.username, adminId: user.id, count: roles.length }, `Returning ${roles.length} roles`);
      return roles;
    } catch (error) {
      request.log.error({ err: error }, "Failed to get admin roles");
      return reply.status(500).send({ message: "Internal server error" });
    }
  });

  if (twitchStats) {
    app.post("/api/admin/update-twitch-stream-stats", { schema: adminRouteSchemas.refreshTwitchStats }, async (request, reply) => {
      try {
        const user = await requireAdminOrStop(request, reply);
        if (!user) return;
        auditInfo(request.log, user, `AUDIT: Admin ${user.username} started Twitch stream statistics sync`);
        const result = await twitchStats.syncRecentStreams();
        auditInfo(request.log, user, `AUDIT: Admin ${user.username} completed Twitch stream statistics sync`, result);
        return { message: "Twitch stream statistics update completed", ...result };
      } catch (error) {
        request.log.error({ err: error }, "Failed to update Twitch stream statistics");
        return reply.status(500).send({ message: "Internal server error" });
      }
    });
  }

  app.put("/api/admin/users/:userId/role", { schema: adminRouteSchemas.updateRole }, async (request, reply) => {
    try {
      const currentUser = await requireAdminOrStop(request, reply);
      if (!currentUser) return;
      const userId = Number.parseInt((request.params as { userId: string }).userId, 10);
      const parsed = updateRoleRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ message: "Invalid role ID" });
      }

      const user = await userRepository.getById(userId);
      if (!user) {
        auditWarn(request.log, currentUser, `Admin ${currentUser.username} attempted to change role for non-existent user ID ${userId}`, {
          targetUserId: userId
        });
        return reply.status(404).send({ message: "User not found" });
      }
      const role = await userRepository.getRoleById(parsed.data.roleId);
      if (!role) {
        auditWarn(request.log, currentUser, `Admin ${currentUser.username} attempted to assign invalid role ID ${parsed.data.roleId}`, {
          targetUserId: userId,
          roleId: parsed.data.roleId
        });
        return reply.status(400).send({ message: "Invalid role ID" });
      }
      const adminRole = await userRepository.getRoleByName("Admin");
      if (!adminRole) {
        auditError(request.log, currentUser, "Admin role is missing from configuration", { targetUserId: userId });
        return reply.status(500).send({ message: "Configuration error: Admin role is missing" });
      }
      const isSelfRoleChange = user.id === currentUser.id || user.twitchId === currentUser.twitchId;
      if (isSelfRoleChange && user.roleId === adminRole.id && role.id !== adminRole.id) {
        auditWarn(request.log, currentUser, `Admin ${currentUser.username} attempted to remove their own admin role`, {
          targetUserId: userId,
          attemptedRole: role.name
        });
        return reply.status(400).send({ message: "You cannot remove your own admin role" });
      }

      const updated = await userRepository.updateRole(userId, parsed.data.roleId);
      const oldRole = user.roleName ?? "None";
      auditInfo(
        request.log,
        currentUser,
        `AUDIT: Admin ${currentUser.username} (ID: ${currentUser.id}) changed role for user ${user.twitchUsername} (ID: ${user.id}) from ${oldRole} to ${role.name}`,
        {
          targetUserId: user.id,
          targetUser: user.twitchUsername,
          oldRole,
          newRole: role.name
        }
      );
      return {
        id: updated?.id ?? user.id,
        username: updated?.twitchUsername ?? user.twitchUsername,
        role: role.name,
        message: `User role updated to ${role.name}`
      };
    } catch (error) {
      request.log.error({ err: error }, "Failed to update admin user role");
      return reply.status(500).send({ message: "Internal server error" });
    }
  });
}
