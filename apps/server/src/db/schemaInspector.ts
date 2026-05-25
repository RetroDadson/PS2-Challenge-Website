import type { Kysely } from "kysely";

export type ColumnInfo = {
  table: string;
  column: string;
  dataType: string;
  nullable: boolean;
  maxLength: number | null;
};

export async function publicTableNames(db: Kysely<any>): Promise<Set<string>> {
  const rows = await db
    .selectFrom("information_schema.tables")
    .select("table_name as tableName")
    .where("table_schema", "=", "public")
    .where("table_type", "=", "BASE TABLE")
    .execute();

  return new Set(rows.map((row) => String(row.tableName)));
}

export async function publicColumns(db: Kysely<any>): Promise<Map<string, ColumnInfo>> {
  const rows = await db
    .selectFrom("information_schema.columns")
    .select([
      "table_name as tableName",
      "column_name as columnName",
      "data_type as dataType",
      "is_nullable as isNullable",
      "character_maximum_length as characterMaximumLength"
    ])
    .where("table_schema", "=", "public")
    .execute();

  return new Map(
    rows.map((row) => [
      `${String(row.tableName)}.${String(row.columnName)}`,
      {
        table: String(row.tableName),
        column: String(row.columnName),
        dataType: String(row.dataType),
        nullable: row.isNullable === "YES",
        maxLength: row.characterMaximumLength === null ? null : Number(row.characterMaximumLength)
      }
    ])
  );
}

export async function publicIndexNames(db: Kysely<any>): Promise<Set<string>> {
  const rows = await db
    .selectFrom("pg_indexes")
    .select("indexname as indexName")
    .where("schemaname", "=", "public")
    .execute();

  return new Set(rows.map((row) => String(row.indexName)));
}

export async function publicConstraintNames(db: Kysely<any>): Promise<Set<string>> {
  const rows = await db
    .selectFrom("pg_constraint as c")
    .innerJoin("pg_namespace as n", "n.oid", "c.connamespace")
    .select("c.conname as constraintName")
    .where("n.nspname", "=", "public")
    .execute();

  return new Set(rows.map((row) => String(row.constraintName)));
}
