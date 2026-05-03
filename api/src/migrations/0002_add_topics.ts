import type { Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("topics")
    .addColumn("id", "varchar(36)", (col) => col.primaryKey())
    .addColumn("user_id", "varchar(36)", (col) =>
      col.notNull().references("users.id").onDelete("cascade")
    )
    .addColumn("title", "varchar(190)")
    .addColumn("created_at", "varchar(50)", (col) => col.notNull())
    .addColumn("updated_at", "varchar(50)", (col) => col.notNull())
    .execute();

  await db.schema
    .alterTable("conversations")
    .addColumn("topic_id", "varchar(36)", (col) =>
      col.references("topics.id").onDelete("set null")
    )
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("conversations").dropColumn("topic_id").execute();
  await db.schema.dropTable("topics").ifExists().execute();
}
