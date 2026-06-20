import { z } from "zod";

export const gameTableColumnIds = [
  "cover",
  "title",
  "howLongToBeat",
  "developer",
  "publisher",
  "releaseDate",
  "region",
  "excluded",
  "owned",
  "status"
] as const;

export const gameTableColumnIdSchema = z.enum(gameTableColumnIds);

const uniqueGameTableColumnIds = z.array(gameTableColumnIdSchema).max(gameTableColumnIds.length).refine(
  (ids) => new Set(ids).size === ids.length,
  "Column IDs must be unique"
);

export const gameTablePreferencesSchema = z
  .object({
    order: uniqueGameTableColumnIds.min(2),
    hidden: uniqueGameTableColumnIds
  })
  .strict()
  .superRefine((preferences, context) => {
    if (preferences.order[0] !== "cover" || preferences.order[1] !== "title") {
      context.addIssue({ code: "custom", path: ["order"], message: "Cover and Title must be the first columns" });
    }
    if (preferences.hidden.includes("cover") || preferences.hidden.includes("title")) {
      context.addIssue({ code: "custom", path: ["hidden"], message: "Cover and Title cannot be hidden" });
    }
    if (preferences.hidden.some((id) => !preferences.order.includes(id))) {
      context.addIssue({ code: "custom", path: ["hidden"], message: "Hidden columns must be present in the column order" });
    }
  });

export const gameTablePreferencesResponseSchema = z.object({
  preferences: gameTablePreferencesSchema.nullable()
});

export const userProfileSchema = z.object({
  isAuthenticated: z.boolean(),
  username: z.string().nullable().optional(),
  twitchId: z.string().nullable().optional(),
  role: z.string().nullable().optional(),
  profileImageUrl: z.string().nullable().optional(),
  createdAt: z.string().nullable().optional(),
  lastLoginAt: z.string().nullable().optional(),
  apiKey: z.string().nullable().optional()
});

export const updateRoleRequestSchema = z.object({
  roleId: z.number().int().positive()
});

export const roleSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  description: z.string().nullable().optional()
});

export const adminUserSchema = z.object({
  id: z.number().int(),
  twitchId: z.string(),
  username: z.string(),
  profileImageUrl: z.string().nullable().optional(),
  roleId: z.number().int(),
  role: z.string().nullable().optional(),
  createdAt: z.string(),
  lastLoginAt: z.string()
});

export type UserProfileDto = z.infer<typeof userProfileSchema>;
export type RoleDto = z.infer<typeof roleSchema>;
export type AdminUserDto = z.infer<typeof adminUserSchema>;
export type GameTableColumnId = z.infer<typeof gameTableColumnIdSchema>;
export type GameTablePreferencesDto = z.infer<typeof gameTablePreferencesSchema>;
export type GameTablePreferencesResponseDto = z.infer<typeof gameTablePreferencesResponseSchema>;
