import type { Kysely } from "kysely";
import { sql } from "kysely";

/** TEXT = ~64KB; jawaban analisis saham bisa lebih panjang → MEDIUMTEXT (~16MB). */
export async function up(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE messages MODIFY COLUMN content MEDIUMTEXT NOT NULL`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE messages MODIFY COLUMN content TEXT NOT NULL`.execute(db);
}
