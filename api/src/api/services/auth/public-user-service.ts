import { db } from "@database";

export async function upsertPublicUserFromGoogle(params: { sub: string; email: string; name: string }) {
  const existing = await db
    .selectFrom("users")
    .selectAll()
    .where("google_sub", "=", params.sub)
    .executeTakeFirst();

  const now = new Date().toISOString();

  if (existing) {
    await db
      .updateTable("users")
      .set({
        email: params.email,
        full_name: params.name || existing.full_name,
        updated_at: now,
      })
      .where("id", "=", existing.id)
      .execute();

    return {
      id: existing.id,
      email: params.email,
      full_name: params.name || existing.full_name,
    };
  }

  const id = crypto.randomUUID();
  const fullName = params.name || params.email.split("@")[0] || "User";

  await db
    .insertInto("users")
    .values({
      id,
      user_type: "public",
      role_id: null,
      email: params.email,
      full_name: fullName,
      password_hash: null,
      google_sub: params.sub,
      created_at: now,
      updated_at: now,
    })
    .execute();

  return { id, email: params.email, full_name: fullName };
}
