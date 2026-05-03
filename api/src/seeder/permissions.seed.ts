import { db } from "@database";

const permissionSeeds = [
  { id: "perm-users-read", code: "users.read", name: "Lihat user" },
  { id: "perm-users-write", code: "users.write", name: "Ubah user" },
  { id: "perm-roles-read", code: "roles.read", name: "Lihat role" },
  { id: "perm-roles-write", code: "roles.write", name: "Ubah role" },
  { id: "perm-stock-read", code: "stock.read", name: "Lihat stok" },
  { id: "perm-stock-write", code: "stock.write", name: "Ubah stok" },
];

export async function seedPermissions() {
  const now = new Date().toISOString();

  for (const permission of permissionSeeds) {
    await db
      .insertInto("permissions")
      .values({
        ...permission,
        created_at: now,
        updated_at: now,
      })
      .onDuplicateKeyUpdate({
        name: permission.name,
        updated_at: now,
      })
      .execute();
  }
}
