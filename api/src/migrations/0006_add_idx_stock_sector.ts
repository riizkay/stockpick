import type { Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createIndex("idx_stock_sector_sector_id")
    .on("stock_sector")
    .column("sector_id")
    .execute();

  await db.schema
    .createIndex("idx_stock_sector_stock_code")
    .on("stock_sector")
    .column("stock_code")
    .execute();

  await db.schema
    .createIndex("idx_stock_sector_sector_id_stock_code")
    .on("stock_sector")
    .columns(["sector_id", "stock_code"])
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropIndex("idx_stock_sector_sector_id_stock_code").ifExists().execute();
  await db.schema.dropIndex("idx_stock_sector_stock_code").ifExists().execute();
  await db.schema.dropIndex("idx_stock_sector_sector_id").ifExists().execute();
}
