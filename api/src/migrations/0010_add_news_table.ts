import type { Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("news")
    .addColumn("id", "varchar(36)", (col) => col.primaryKey())
    .addColumn("title", "varchar(191)", (col) => col.notNull())
    .addColumn("content", "text", (col) => col.notNull())
    .addColumn("url", "varchar(191)", (col) => col.notNull().unique())
    .addColumn("source", "varchar(191)", (col) => col.notNull())
    .addColumn("published_date", "varchar(50)", (col) => col.notNull())
    .addColumn("category", "varchar(191)", (col) => col.notNull())
    .addColumn("summary", "text")
    .addColumn("author", "varchar(191)")
    .addColumn("image_url", "varchar(191)")
    .addColumn("created_at", "varchar(50)", (col) => col.notNull())
    .addColumn("updated_at", "varchar(50)", (col) => col.notNull())
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("news").ifExists().execute();
}