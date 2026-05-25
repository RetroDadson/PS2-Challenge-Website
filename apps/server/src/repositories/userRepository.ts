import crypto from "node:crypto";
import type { AdminUserDto, RoleDto } from "@ps2-challenge/shared";
import { sql, type Kysely } from "kysely";
import type { Database } from "../db/kysely.js";

export type ApplicationUser = {
  id: number;
  twitchId: string;
  twitchUsername: string;
  profileImageUrl: string | null;
  roleId: number;
  roleName: string;
  createdAt: string;
  lastLoginAt: string;
  apiKey: string | null;
};

type UserRow = {
  id: number;
  twitch_id: string;
  twitch_username: string;
  profile_image_url: string | null;
  role_id: number;
  role_name: string;
  created_at: string;
  last_login_at: string;
  api_key: string | null;
};

function mapUser(row: UserRow): ApplicationUser {
  return {
    id: row.id,
    twitchId: row.twitch_id,
    twitchUsername: row.twitch_username,
    profileImageUrl: row.profile_image_url,
    roleId: row.role_id,
    roleName: row.role_name,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
    apiKey: row.api_key
  };
}

export function generateSecureApiKey(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function hashApiKey(apiKey: string): string {
  if (!apiKey.trim()) {
    throw new Error("API key is required");
  }
  return crypto.createHash("sha256").update(apiKey.trim(), "utf8").digest("hex"); // NOSONAR - preserves existing C# SHA-256 API-key hashes while generated raw keys remain 256-bit random.
}

export class UserRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async getByTwitchId(twitchId: string): Promise<ApplicationUser | null> {
    const row = await this.userQuery().where("u.twitch_id", "=", twitchId).executeTakeFirst();
    return row ? mapUser(row) : null;
  }

  async getById(id: number): Promise<ApplicationUser | null> {
    const row = await this.userQuery().where("u.id", "=", id).executeTakeFirst();
    return row ? mapUser(row) : null;
  }

  async getByApiKey(apiKey: string): Promise<ApplicationUser | null> {
    const hashed = hashApiKey(apiKey);
    const row = await this.userQuery().where("u.api_key", "=", hashed).executeTakeFirst();
    return row ? mapUser(row) : null;
  }

  async createUser(twitchId: string, username: string, profileImageUrl?: string | null): Promise<ApplicationUser> {
    const role = await this.getRoleByName("User");
    if (!role) {
      throw new Error("Default 'User' role not found in database");
    }

    const rawApiKey = generateSecureApiKey();
    const inserted = await this.db
      .insertInto("users")
      .values({
        twitch_id: twitchId,
        twitch_username: username,
        profile_image_url: profileImageUrl ?? null,
        role_id: role.id,
        created_at: sql`CURRENT_TIMESTAMP`,
        last_login_at: sql`CURRENT_TIMESTAMP`,
        api_key: hashApiKey(rawApiKey)
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    return (await this.getById(inserted.id))!;
  }

  async updateLastLogin(userId: number): Promise<void> {
    await this.db.updateTable("users").set({ last_login_at: sql`CURRENT_TIMESTAMP` }).where("id", "=", userId).execute();
  }

  async updateProfileImage(userId: number, profileImageUrl: string | null): Promise<void> {
    await this.db.updateTable("users").set({ profile_image_url: profileImageUrl }).where("id", "=", userId).execute();
  }

  async generateApiKey(userId: number): Promise<string> {
    const rawApiKey = generateSecureApiKey();
    const updated = await this.db
      .updateTable("users")
      .set({ api_key: hashApiKey(rawApiKey) })
      .where("id", "=", userId)
      .returning("id")
      .executeTakeFirst();
    if (!updated) {
      throw new Error(`User with ID ${userId} not found`);
    }
    return rawApiKey;
  }

  async getAllUsers(): Promise<AdminUserDto[]> {
    const rows = await this.userQuery().orderBy("u.last_login_at", "desc").execute();

    return rows.map((row) => ({
      id: row.id,
      twitchId: row.twitch_id,
      username: row.twitch_username,
      profileImageUrl: row.profile_image_url,
      roleId: row.role_id,
      role: row.role_name,
      createdAt: row.created_at,
      lastLoginAt: row.last_login_at
    }));
  }

  async getAllRoles(): Promise<RoleDto[]> {
    return this.db.selectFrom("roles").select(["id", "name", "description"]).orderBy("name").execute();
  }

  async getRoleByName(name: string): Promise<RoleDto | null> {
    return (await this.db.selectFrom("roles").select(["id", "name", "description"]).where("name", "=", name).executeTakeFirst()) ?? null;
  }

  async getRoleById(roleId: number): Promise<RoleDto | null> {
    return (await this.db.selectFrom("roles").select(["id", "name", "description"]).where("id", "=", roleId).executeTakeFirst()) ?? null;
  }

  async updateRole(userId: number, roleId: number): Promise<ApplicationUser | null> {
    const updated = await this.db.updateTable("users").set({ role_id: roleId }).where("id", "=", userId).returning("id").executeTakeFirst();
    if (!updated) {
      return null;
    }
    return this.getById(userId);
  }

  private userQuery() {
    return this.db
      .selectFrom("users as u")
      .innerJoin("roles as r", "r.id", "u.role_id")
      .select([
        "u.id as id",
        "u.twitch_id as twitch_id",
        "u.twitch_username as twitch_username",
        "u.profile_image_url as profile_image_url",
        "u.role_id as role_id",
        "r.name as role_name",
        "u.api_key as api_key",
        sql<string>`u.created_at::text`.as("created_at"),
        sql<string>`u.last_login_at::text`.as("last_login_at")
      ]);
  }
}
