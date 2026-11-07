import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("eventsub_messages")
    .addColumn("message_id", "varchar(100)", (col) => col.primaryKey())
    .addColumn("message_type", "varchar(40)", (col) => col.notNull())
    .addColumn("subscription_type", "varchar(100)", (col) => col.notNull())
    .addColumn("status", "varchar(20)", (col) => col.notNull())
    .addColumn("payload", "jsonb")
    .addColumn("error", "text")
    .addColumn("grant_id", "integer", (col) => col.references("sub_entry_grants.grant_id").onDelete("set null"))
    .addColumn("received_at", "timestamp", (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn("resolved_by_user_id", "integer", (col) => col.references("users.id").onDelete("set null"))
    .addColumn("resolved_at", "timestamp")
    .addCheckConstraint(
      "chk_eventsub_messages_status",
      sql`status IN ('processed', 'ignored', 'failed', 'needs_review', 'resolved', 'dismissed')`
    )
    .execute();
  await db.schema.createIndex("idx_eventsub_messages_status").on("eventsub_messages").columns(["status", "received_at"]).execute();

  await db.schema
    .createTable("eventsub_state")
    .addColumn("id", "integer", (col) => col.primaryKey().defaultTo(1))
    .addColumn("broadcaster_user_id", "varchar(255)")
    .addColumn("authorized_at", "timestamp")
    .addColumn("authorized_by_user_id", "integer", (col) => col.references("users.id").onDelete("set null"))
    .addColumn("revoked_at", "timestamp")
    .addColumn("revoked_reason", "varchar(100)")
    .addColumn("secret_fingerprint", "varchar(64)")
    .addCheckConstraint("chk_eventsub_state_singleton", sql`id = 1`)
    .execute();
  await db.insertInto("eventsub_state").values({ id: 1 }).execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP TABLE IF EXISTS eventsub_state, eventsub_messages CASCADE`.execute(db);
}
