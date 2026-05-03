import { createNewsScraperFactory } from "./news-scraper-factory";
import { upsertNewsToQdrant, ensureNewsCollectionExists, clearNewsCollection } from "@services/qdrant/qdrant-service";
import { db } from "@database";
import { scrapeNewsInclusiveDateRange, convertNewsItemToTable, calendarDateOnly } from "./news-scraper-utils";
import { toSqlDate } from "./news-published-date-parse";

export async function updateNews(sources: string[] = ["Kontan"]): Promise<void> {
  console.log("Starting news update...");

  try {
    await ensureNewsCollectionExists();

    const factory = createNewsScraperFactory();
    const allNewsItems: any[] = [];

    for (const source of sources) {
      const scraper = factory.createScraper(source);
      if (!scraper) {
        console.error(`Scraper for source ${source} not found, skipping`);
        continue;
      }

      console.log(`Scraping ${scraper.name}...`);

      const latest = await getLatestNewsDate();
      const rangeStart = calendarDateOnly(latest);
      const rangeEnd = calendarDateOnly(new Date());

      console.log(`Scrape ${scraper.name} ${toSqlDate(rangeStart)} .. ${toSqlDate(rangeEnd)}`);

      const newsItems = await scrapeNewsInclusiveDateRange(scraper, rangeStart, rangeEnd, true);
      console.log(`Scraped ${newsItems.length} news items from ${scraper.name}`);

      allNewsItems.push(...newsItems);
    }

    console.log(`Total scraped ${allNewsItems.length} news items`);

    for (let i = 0; i < allNewsItems.length; i++) {
      const newsItem = allNewsItems[i];
      const newsTable = convertNewsItemToTable(newsItem);

      const row = await db
        .selectFrom("news")
        .select("qdrant_saved")
        .where("id", "=", newsTable.id)
        .executeTakeFirst();

      if (row?.qdrant_saved === 1) {
        console.log(`News id=${newsTable.id} sudah ada di Qdrant (qdrant_saved=1), lewati`);
        continue;
      }

      try {
        await upsertNewsToQdrant(newsTable);

        await db
          .updateTable("news")
          .set({ qdrant_saved: 1 })
          .where("id", "=", newsTable.id)
          .executeTakeFirst();

        console.log(`Upserted news item ${i + 1}/${allNewsItems.length} to Qdrant and updated database`);
      } catch (error) {
        console.error(`Failed to upsert news item ${i + 1}:`, error);
      }
    }

    console.log(`Successfully upserted ${allNewsItems.length} news items to Qdrant and updated database`);
  } catch (error) {
    console.error("Error updating news:", error);
    throw error;
  }
}

async function getLatestNewsDate(): Promise<Date> {
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