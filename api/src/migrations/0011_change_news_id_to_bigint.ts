import type { Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("news")
    .dropColumn("id")
    .execute();

  await db.schema
    .alterTable("news")
    .addColumn("id", "bigint", (col) => col.primaryKey().autoIncrement())
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("news")
    .dropColumn("id")
    .execute();

  await db.schema
    .alterTable("news")
    .addColumn("id", "varchar(36)", (col) => col.primaryKey())
    .execute();
}