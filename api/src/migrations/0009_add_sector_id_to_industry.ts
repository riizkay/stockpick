import type { Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("industry")
    .addColumn("sector_id", "integer", (col) => col.references("sector.id").onDelete("set null"))
    .execute();

  await db.schema.createIndex("idx_industry_sector_id").on("industry").column("sector_id").execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropIndex("idx_industry_sector_id").ifExists().execute();
  await db.schema.alterTable("industry").dropColumn("sector_id").execute();
}
