import type { Kysely } from "kysely";
import { kontanPublishedRawToSqlDate, toSqlDate } from "../api/services/news/news-published-date-parse";

function fallbackFromCreatedAt(created_at: string | null | undefined): Date {
  if (!created_at?.trim()) return new Date();
  const normalized = created_at.includes("T") ? created_at : created_at.replace(" ", "T");
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("news").renameColumn("published_date", "published_date_legacy").execute();

  await db.schema.alterTable("news").addColumn("published_date", "date").execute();

  const rows = await db
    .selectFrom("news")
    .select(["id", "published_date_legacy", "created_at"])
    .execute();

  for (const row of rows) {
    const legacy = row.published_date_legacy as string;
    const fb = fallbackFromCreatedAt(row.created_at as string);
    const sqlDate = kontanPublishedRawToSqlDate(legacy, fb);

    await db.updateTable("news").set({ published_date: sqlDate }).where("id", "=", row.id).execute();
  }

  await db.schema.alterTable("news").modifyColumn("published_date", "date", (col) => col.notNull()).execute();

  await db.schema.alterTable("news").dropColumn("published_date_legacy").execute();
}

function sqlDateFromRowValue(v: Date | string): string {
  const d = v instanceof Date ? v : new Date(v as string);
  return Number.isNaN(d.getTime()) ? toSqlDate(new Date()) : toSqlDate(d);
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("news").addColumn("published_date_legacy", "varchar(50)").execute();

  const rows = await db.selectFrom("news").select(["id", "published_date"]).execute();

  for (const row of rows) {
    const iso = sqlDateFromRowValue(row.published_date as Date | string);
    await db.updateTable("news").set({ published_date_legacy: iso }).where("id", "=", row.id).execute();
  }

  await db.schema.alterTable("news").dropColumn("published_date").execute();

  await db.schema.alterTable("news").renameColumn("published_date_legacy", "published_date").execute();

  await db.schema
    .alterTable("news")
    .modifyColumn("published_date", "varchar(50)", (col) => col.notNull())
    .execute();
}
