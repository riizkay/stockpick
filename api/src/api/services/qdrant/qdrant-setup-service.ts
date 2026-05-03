import { QdrantClient } from "@qdrant/js-client-rest";

const QDRANT_URL = "http://10.11.0.1:6333";

export async function setupQdrantCollection(): Promise<void> {
  const client = new QdrantClient({ url: QDRANT_URL });

  try {
    await client.createCollection("news", {
      vectors: {
        size: 1536,
        distance: "Cosine",
      },
    });

    console.log("✓ Collection 'news' berhasil dibuat di Qdrant");
  } catch (error: any) {
    if (error.message.includes("already exists")) {
      console.log("✓ Collection 'news' sudah ada di Qdrant");
    } else {
      console.error("Error saat membuat collection:", error);
      throw error;
    }
  }
}