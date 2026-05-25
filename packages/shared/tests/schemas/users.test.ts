import { describe, expect, it } from "vitest";
import { adminUserSchema, roleSchema, updateRoleRequestSchema, userProfileSchema } from "../../src/schemas/users.js";

describe("user schemas", () => {
  it("accepts authenticated and anonymous profile payloads", () => {
    expect(userProfileSchema.parse({ isAuthenticated: false })).toEqual({ isAuthenticated: false });
    expect(
      userProfileSchema.parse({
        isAuthenticated: true,
        username: "Dadson",
        twitchId: "tw-1",
        role: "Admin",
        profileImageUrl: null,
        createdAt: "2024-01-01T00:00:00.000Z",
        lastLoginAt: null,
        apiKey: "raw-key-once"
      })
    ).toEqual({
      isAuthenticated: true,
      username: "Dadson",
      twitchId: "tw-1",
      role: "Admin",
      profileImageUrl: null,
      createdAt: "2024-01-01T00:00:00.000Z",
      lastLoginAt: null,
      apiKey: "raw-key-once"
    });
  });

  it("validates role update and admin user payloads", () => {
    expect(updateRoleRequestSchema.safeParse({ roleId: 0 }).success).toBe(false);
    expect(updateRoleRequestSchema.parse({ roleId: 2 })).toEqual({ roleId: 2 });
    expect(roleSchema.parse({ id: 1, name: "Admin", description: null })).toEqual({ id: 1, name: "Admin", description: null });
    expect(
      adminUserSchema.parse({
        id: 1,
        twitchId: "tw-1",
        username: "Dadson",
        profileImageUrl: null,
        roleId: 1,
        role: "Admin",
        createdAt: "2024-01-01T00:00:00.000Z",
        lastLoginAt: "2024-01-02T00:00:00.000Z"
      })
    ).toMatchObject({ id: 1, username: "Dadson", role: "Admin" });
  });
});
