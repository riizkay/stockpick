import { Kysely, sql } from "kysely";

export async function up(db: Kysely<any>) {
  await db.schema
    .createTable("roles")
    .addColumn("id", "varchar(36)", (column) => column.primaryKey())
    .addColumn("name", "varchar(100)", (column) => column.notNull().unique())
    .addColumn("description", "text")
    .addColumn("created_at", "varchar(50)", (column) => column.notNull())
    .addColumn("updated_at", "varchar(50)", (column) => column.notNull())
    .execute();

  await db.schema
    .createTable("permissions")
    .addColumn("id", "varchar(36)", (column) => column.primaryKey())
    .addColumn("code", "varchar(100)", (column) => column.notNull().unique())
    .addColumn("name", "varchar(100)", (column) => column.notNull())
    .addColumn("created_at", "varchar(50)", (column) => column.notNull())
    .addColumn("updated_at", "varchar(50)", (column) => column.notNull())
    .execute();

  await db.schema
    .createTable("role_permissions")
    .addColumn("id", "varchar(36)", (column) => column.primaryKey())
    .addColumn("role_id", "varchar(36)", (column) => column.notNull().references("roles.id").onDelete("cascade"))
    .addColumn("permission_id", "varchar(36)", (column) => column.notNull().references("permissions.id").onDelete("cascade"))
    .addColumn("created_at", "varchar(50)", (column) => column.notNull())
    .execute();

  await db.schema
    .createTable("users")
    .addColumn("id", "varchar(36)", (column) => column.primaryKey())
    .addColumn("user_type", "varchar(20)", (column) => column.notNull())
    .addColumn("role_id", "varchar(36)", (column) => column.references("roles.id").onDelete("set null"))
    .addColumn("email", "varchar(190)", (column) => column.notNull().unique())
    .addColumn("full_name", "varchar(190)", (column) => column.notNull())
    .addColumn("password_hash", "varchar(255)")
    .addColumn("google_sub", "varchar(190)")
    .addColumn("created_at", "varchar(50)", (column) => column.notNull())
    .addColumn("updated_at", "varchar(50)", (column) => column.notNull())
    .execute();

  await db.schema
    .createTable("items")
    .addColumn("id", "varchar(36)", (column) => column.primaryKey())
    .addColumn("sku", "varchar(100)", (column) => column.notNull().unique())
    .addColumn("name", "varchar(190)", (column) => column.notNull())
    .addColumn("minimum_stock", "integer", (column) => column.notNull().defaultTo(0))
    .addColumn("current_stock", "integer", (column) => column.notNull().defaultTo(0))
    .addColumn("created_at", "varchar(50)", (column) => column.notNull())
    .addColumn("updated_at", "varchar(50)", (column) => column.notNull())
    .execute();

  await db.schema
    .createTable("stock_movements")
    .addColumn("id", "varchar(36)", (column) => column.primaryKey())
    .addColumn("item_id", "varchar(36)", (column) => column.notNull().references("items.id").onDelete("cascade"))
    .addColumn("movement_type", "varchar(20)", (column) => column.notNull())
    .addColumn("quantity", "integer", (column) => column.notNull())
    .addColumn("notes", "text")
    .addColumn("created_by_user_id", "varchar(36)", (column) => column.references("users.id").onDelete("set null"))
    .addColumn("created_at", "varchar(50)", (column) => column.notNull())
    .execute();

  await db.schema
    .createTable("conversations")
    .addColumn("id", "varchar(36)", (column) => column.primaryKey())
    .addColumn("user_id", "varchar(36)", (column) => column.notNull().references("users.id").onDelete("cascade"))
    .addColumn("title", "varchar(190)")
    .addColumn("created_at", "varchar(50)", (column) => column.notNull())
    .addColumn("updated_at", "varchar(50)", (column) => column.notNull())
    .execute();

  await db.schema
    .createTable("messages")
    .addColumn("id", "varchar(36)", (column) => column.primaryKey())
    .addColumn("conversation_id", "varchar(36)", (column) => column.notNull().references("conversations.id").onDelete("cascade"))
    .addColumn("role", "varchar(20)", (column) => column.notNull())
    .addColumn("content", "text", (column) => column.notNull())
    .addColumn("metadata", "json")
    .addColumn("created_at", "varchar(50)", (column) => column.notNull())
    .execute();

  await sql`select 1`.execute(db);
}

export async function down(db: Kysely<any>) {
  await db.schema.dropTable("messages").ifExists().execute();
  await db.schema.dropTable("conversations").ifExists().execute();
  await db.schema.dropTable("stock_movements").ifExists().execute();
  await db.schema.dropTable("items").ifExists().execute();
  await db.schema.dropTable("users").ifExists().execute();
  await db.schema.dropTable("role_permissions").ifExists().execute();
  await db.schema.dropTable("permissions").ifExists().execute();
  await db.schema.dropTable("roles").ifExists().execute();
}
