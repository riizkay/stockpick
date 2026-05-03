import type { Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("sector")
    .addColumn("id", "integer", (col) => col.primaryKey().autoIncrement())
    .addColumn("name", "varchar(190)", (col) => col.notNull())
    .addColumn("description", "text")
    .addColumn("created_at", "varchar(50)", (col) => col.notNull())
    .addColumn("updated_at", "varchar(50)", (col) => col.notNull())
    .execute();

  await db.schema
    .createTable("stock_sector")
    .addColumn("id", "integer", (col) => col.primaryKey().autoIncrement())
    .addColumn("sector_id", "integer", (col) => col.notNull().references("sector.id").onDelete("cascade"))
    .addColumn("stock_code", "varchar(20)", (col) => col.notNull())
    .addColumn("created_at", "varchar(50)", (col) => col.notNull())
    .addColumn("updated_at", "varchar(50)", (col) => col.notNull())
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("stock_sector").ifExists().execute();
  await db.schema.dropTable("sector").ifExists().execute();
}
