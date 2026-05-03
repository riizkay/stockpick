import { searchSimilarNews } from "./qdrant-service";
import type { NewsTable } from "@models";

export async function searchNewsByQuery(
  query: string,
  limit: number = 5
): Promise<NewsTable[]> {
  const results = await searchSimilarNews(query, limit);

  return results.map((result) => ({
    id: result.id,
    title: result.payload.title,
    content: result.payload.content,
    url: result.payload.url,
    source: result.payload.source,
    published_date: result.payload.published_date,
    category: result.payload.category,
    summary: result.payload.summary || null,
    author: result.payload.author || null,
    image_url: result.payload.image_url || null,
    qdrant_saved: 0,
    created_at: "",
    updated_at: "",
  }));
}