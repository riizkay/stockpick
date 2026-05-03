import { NewsItem, NewsDetail, NewsScraper } from "./news-scraper-base";
import { db } from "@database";
import { toSqlDate } from "./news-published-date-parse";

export async function getLatestNewsDate(): Promise<Date> {
  const today = new Date();

  const existingNews = await db
    .selectFrom("news")
    .select(["published_date"])
    .orderBy("published_date", "desc")
    .limit(1)
    .execute();

  if (existingNews.length > 0) {
    const latestDate = new Date(existingNews[0].published_date);
    return latestDate;
  }

  return today;
}

export function calendarDateOnly(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addCalendarDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

export async function scrapeNewsInclusiveDateRange(
  scraper: NewsScraper,
  rangeStart: Date,
  rangeEnd: Date,
  persistToDb: boolean
): Promise<NewsItem[]> {
  const start = calendarDateOnly(rangeStart);
  const end = calendarDateOnly(rangeEnd);
  const seenUrls = new Set<string>();
  const merged: NewsItem[] = [];

  for (let cursor = start; cursor.getTime() <= end.getTime(); cursor = addCalendarDays(cursor, 1)) {
    try {
      const batch = await scraper.scrapeIndex(cursor, undefined);
      for (const item of batch) {
        if (seenUrls.has(item.url)) continue;
        seenUrls.add(item.url);
        if (persistToDb) {
          await saveNewsItemToDatabase(item, scraper);
        }
        merged.push(item);
      }
    } catch (error) {
      console.error(`Error scraping ${scraper.name} tanggal=${toSqlDate(cursor)}:`, error);
    }
  }

  return merged;
}

export async function saveNewsItemToDatabase(
  news: NewsItem,
  scraper: NewsScraper
): Promise<void> {
  const now = new Date().toISOString().replace("T", " ").substring(0, 19);
  const createdAt = now;
  const updatedAt = now;

  const summary = news.content.length > 200 ? news.content.substring(0, 200) + "..." : news.content;

  try {
    const result = await db
      .insertInto("news")
      .values({
        title: news.title,
        content: news.content,
        url: news.url,
        source: scraper.name,
        published_date: news.publishedDate,
        category: news.category,
        summary,
        author: null,
        image_url: news.imageUrl || null,
        qdrant_saved: 0,
        created_at: createdAt,
        updated_at: updatedAt,
      } as any)
      .executeTakeFirst();

    const newId = Number(result?.insertId);
    if (!Number.isNaN(newId) && newId > 0) {
      news.id = newId;
    } else {
      await assignNewsIdFromDbByUrl(news);
    }
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes("ER_DUP_ENTRY") || (error as any).code === "ER_DUP_ENTRY")
    ) {
      console.log(`News with URL ${news.url} already exists, skipping`);
      await assignNewsIdFromDbByUrl(news);
    } else {
      throw error;
    }
  }
}

async function assignNewsIdFromDbByUrl(news: NewsItem): Promise<void> {
  const row = await db
    .selectFrom("news")
    .select("id")
    .where("url", "=", news.url)
    .executeTakeFirst();
  if (!row) {
    throw new Error(`Baris news tidak ditemukan untuk url: ${news.url}`);
  }
  news.id = Number(row.id);
}

export function convertNewsItemToTable(newsItem: NewsItem): any {
  if (newsItem.id === undefined) {
    throw new Error("NewsItem.id kosong; simpan ke DB dulu (saveNewsItemToDatabase / scrape dengan persist)");
  }

  const now = new Date().toISOString().replace("T", " ").substring(0, 19);

  const summary = newsItem.content.length > 200 ? newsItem.content.substring(0, 200) + "..." : newsItem.content;

  return {
    id: newsItem.id,
    title: newsItem.title,
    content: newsItem.content,
    url: newsItem.url,
    source: newsItem.source,
    published_date: newsItem.publishedDate,
    category: newsItem.category,
    summary,
    author: null,
    image_url: newsItem.imageUrl || null,
    qdrant_saved: 0,
    created_at: now,
    updated_at: now,
  };
}