import { db } from "@database";

const itemSeeds = [
  {
    id: "item-beras",
    sku: "SKU-BERAS-001",
    name: "Beras Premium 5kg",
    minimum_stock: 10,
    current_stock: 4,
  },
  {
    id: "item-gula",
    sku: "SKU-GULA-001",
    name: "Gula Pasir 1kg",
    minimum_stock: 20,
    current_stock: 38,
  },
];

export async function seedItems() {
  const now = new Date().toISOString();

  for (const item of itemSeeds) {
    await db
      .insertInto("items")
      .values({
        ...item,
        created_at: now,
        updated_at: now,
      })
      .onDuplicateKeyUpdate({
        name: item.name,
        minimum_stock: item.minimum_stock,
        current_stock: item.current_stock,
        updated_at: now,
      })
      .execute();
  }
}
