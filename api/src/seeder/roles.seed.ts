import { db } from "@database";

export async function seedRoles() {
  const now = new Date().toISOString();

  await db
    .insertInto("roles")
    .values({
      id: "role-admin",
      name: "admin",
      description: "Akses penuh ke CMS",
      created_at: now,
      updated_at: now,
    })
    .onDuplicateKeyUpdate({
      updated_at: now,
      description: "Akses penuh ke CMS",
    })
    .execute();
}
