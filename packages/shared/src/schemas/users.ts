import { z } from "zod";

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
