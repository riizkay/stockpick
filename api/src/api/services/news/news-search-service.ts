import { searchNewsByQuery } from "@services/qdrant/qdrant-search-service";
import type { NewsTable } from "@models";
import { getRegisteredScrapers } from "./news-scraper-factory";

export async function searchNews(query: string, limit: number = 5): Promise<any[]> {
  return await searchNewsByQuery(query, limit);
}

export function getAvailableSources(): string[] {
  return getRegisteredScrapers();
}