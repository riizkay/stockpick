import type { Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("industry")
    .addColumn("id", "integer", (col) => col.primaryKey().autoIncrement())
    .addColumn("name", "varchar(190)", (col) => col.notNull())
    .addColumn("description", "text")
    .addColumn("created_at", "varchar(50)", (col) => col.notNull())
    .addColumn("updated_at", "varchar(50)", (col) => col.notNull())
    .execute();

  await db.schema
    .createTable("stock_industry")
    .addColumn("id", "integer", (col) => col.primaryKey().autoIncrement())
    .addColumn("industry_id", "integer", (col) => col.notNull().references("industry.id").onDelete("cascade"))
    .addColumn("stock_code", "varchar(20)", (col) => col.notNull())
    .addColumn("created_at", "varchar(50)", (col) => col.notNull())
    .addColumn("updated_at", "varchar(50)", (col) => col.notNull())
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("stock_industry").ifExists().execute();
  await db.schema.dropTable("industry").ifExists().execute();
}
