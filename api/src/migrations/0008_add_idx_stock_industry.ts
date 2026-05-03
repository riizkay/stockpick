import type { Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createIndex("idx_stock_industry_industry_id")
    .on("stock_industry")
    .column("industry_id")
    .execute();

  await db.schema
    .createIndex("idx_stock_industry_stock_code")
    .on("stock_industry")
    .column("stock_code")
    .execute();

  await db.schema
    .createIndex("idx_stock_industry_industry_id_stock_code")
    .on("stock_industry")
    .columns(["industry_id", "stock_code"])
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropIndex("idx_stock_industry_industry_id_stock_code").ifExists().execute();
  await db.schema.dropIndex("idx_stock_industry_stock_code").ifExists().execute();
  await db.schema.dropIndex("idx_stock_industry_industry_id").ifExists().execute();
}
