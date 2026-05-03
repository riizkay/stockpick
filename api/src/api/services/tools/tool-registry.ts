import { z } from "zod";
import { isStockbitMcpEnabled, listStockbitToolsForApi } from "@services/mcp/mcp-client";

const listLowStockItemsSchema = z.object({
  limit: z.number().int().min(1).max(50).default(10),
});

export const toolRegistry = [
  {
    name: "list_low_stock_items",
    description: "Ambil daftar item dengan stok di bawah minimum.",
    parameters: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Jumlah item yang ingin diambil.",
        },
      },
      required: [],
    },
    validator: listLowStockItemsSchema,
    execute: async (input: unknown) => {
      const payload = listLowStockItemsSchema.parse(input);

      return {
        type: "mock",
        items: [
          {
            id: "item-1",
            name: "Beras Premium 5kg",
            currentStock: 4,
            minimumStock: 10,
          },
        ].slice(0, payload.limit),
      };
    },
  },
];

export async function getToolMetadata() {
  if (isStockbitMcpEnabled()) {
    try {
      return await listStockbitToolsForApi();
    } catch {
      // MCP tidak jalan / path salah → fallback mock
    }
  }
  return toolRegistry.map(({ name, description, parameters }) => ({
    name,
    description,
    parameters,
  }));
}
