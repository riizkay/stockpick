import { sql } from "kysely";
import type { Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("stocks")
    .addColumn("stock_code", "varchar(6)", (col) => col.primaryKey())
    .addColumn("stock_name", "varchar(190)")
    .addColumn("trading_date", "varchar(50)")
    .addColumn("previous_price", sql`double`)
    .addColumn("open_price", sql`double`)
    .addColumn("first_trade_price", sql`double`)
    .addColumn("high_price", sql`double`)
    .addColumn("low_price", sql`double`)
    .addColumn("close_price", sql`double`)
    .addColumn("change_price", sql`double`)
    .addColumn("volume", sql`double`)
    .addColumn("trade_value", sql`double`)
    .addColumn("frequency", sql`double`)
    .addColumn("bid_price", sql`double`)
    .addColumn("bid_volume", sql`double`)
    .addColumn("offer_price", sql`double`)
    .addColumn("offer_volume", sql`double`)
    .addColumn("foreign_buy", sql`double`)
    .addColumn("foreign_sell", sql`double`)
    .addColumn("percentage", sql`double`)
    .addColumn("created_at", "varchar(50)", (col) => col.notNull())
    .addColumn("updated_at", "varchar(50)", (col) => col.notNull())
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("stocks").ifExists().execute();
}
