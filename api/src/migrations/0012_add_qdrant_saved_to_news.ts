import type { Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("news")
    .addColumn("qdrant_saved", "integer", (col) => col.defaultTo(0).notNull())
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("news")
    .dropColumn("qdrant_saved")
    .execute();
}