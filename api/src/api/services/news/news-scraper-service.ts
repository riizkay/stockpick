import { db } from "@database";
import { JSDOM } from "jsdom";
import type { NewsTable } from "@models";
import { kontanPublishedRawToSqlDate, toSqlDate } from "./news-published-date-parse";

/** tag yang isinya bukan body artikel — kalau tidak dibuang, textContent ikut ambil CSS/JS */
const CONTENT_STRIP_SELECTORS = "script, style, noscript, iframe, svg, template";

/** hapus node mulai start sampai akhir sibling (inklusif start) */
function removeNodeAndFollowingSiblings(start: ChildNode): void {
  let node: ChildNode | null = start;
  while (node) {
    const next: ChildNode | null = node.nextSibling;
    node.parentNode?.removeChild(node);
    node = next;
  }
}

/**
 * Kontan menyematkan banyak chrome di dalam .tmpt-desk-kon: widget persona (Google News),
 * share + style, indeks, berita terkait, grid TERBARU, dsb. Itu yang bikin text ikut CSS/JS.
 */
function trimKontanArticleChrome(contentElement: Element): void {
  contentElement.querySelectorAll("#persona-widget, .persona-widget").forEach((el) => el.remove());

  contentElement.querySelectorAll(".insideads, #adsoutsream, .bacajuga-listdesk, .ads-inreads").forEach((el) => {
    el.remove();
  });

  const paginationRoot = contentElement.querySelector(".pagination")?.closest(".mar-10.mar-r.mar-l");
  paginationRoot?.remove();

  const shareIt = contentElement.querySelector("#share-it");
  if (shareIt) {
    const prev = shareIt.previousElementSibling;
    if (prev?.nodeName === "STYLE") prev.remove();
    removeNodeAndFollowingSiblings(shareIt);
  } else {
    contentElement
      .querySelectorAll(
        "[id^='div-belowarticle'], .head-sec, #loop_lastest, .penampang_paging, #isi-diskus-det",
      )
      .forEach((el) => el.remove());
  }

  contentElement.querySelectorAll(".kgmPWall, .kgmModal, .artikel__sosmed, .artikel__tags").forEach((el) => {
    el.remove();
  });

  contentElement.querySelectorAll("script, .listbut-shr, .wrap-tag, .ff-opensans").forEach((el) => {
    el.remove();
  });
}

function cleanContent(html: string): string {
  const dom = new JSDOM(html);
  const doc = dom.window.document;

  const contentElement = doc.querySelector(".tmpt-desk-kon") || doc.querySelector("article.col-12") || doc.querySelector(".sec_kiri");

  if (!contentElement) {
    return "";
  }

  trimKontanArticleChrome(contentElement);

  contentElement.querySelectorAll(CONTENT_STRIP_SELECTORS).forEach((node) => {
    node.remove();
  });

  const text = contentElement.textContent || "";

  return text
    .replace(/\s+/g, " ")
    .replace(/\n\s*\n/g, "\n")
    .trim();
}

const KONTAN_URL = "https://www.kontan.co.id/search/indeks";

/** Nilai kanal indeks Kontan (sesuai select di halaman pencarian). */
export const KONTAN_KANALS = [
  "nasional",
  "keuangan",
  "investasi",
  "industri",
  "internasional",
  "peluangusaha",
  "personalfinance",
  "english",
  "lifestyle",
  "fokus",
  "pialaeropa",
  "regional",
  "yangter",
  "kesehatan",
  "caritahu",
  "analisis",
  "executive",
  "kolom",
  "kilaskementerian",
  "infografik",
  "insight",
  "cekfakta",
  "ads",
  "seremonia",
  "native",
  "adv",
  "exportexpert",
  "tabloid",
  "kilaskorporasi",
  "edsus",
  "tv",
  "stocksetup",
  "belanjaon",
  "newssetup",
  "filmon",
  "kiaton",
  "sportsetup",
  "momsmoneyid",
  "pressrelease",
  "g20",
  "jelajahekonomi",
  "aktual",
  "showcase",
  "finansial",
  "sehat",
  "pusatdata",
  "global",
  "style",
  "sosok",
  "iptek",
] as const;

function buildKontanIndexUrl(kanal: string, startDate: Date): string {
  const dateStr = startDate.getDate().toString().padStart(2, "0");
  const monthStr = (startDate.getMonth() + 1).toString().padStart(2, "0");
  const yearStr = startDate.getFullYear().toString();
  return `${KONTAN_URL}?kanal=${encodeURIComponent(kanal)}&tanggal=${dateStr}&bulan=${monthStr}&tahun=${yearStr}&pos=indeks`;
}

export interface NewsItem {
  id?: number;
  title: string;
  content: string;
  url: string;
  source: string;
  publishedDate: string;
  category: string;
  imageUrl?: string;
}

export interface NewsDetail {
  title: string;
  content: string;
  publishedDate: string;
}

function insertIdToNumber(insertId: bigint | number | undefined): number | undefined {
  if (insertId === undefined) return undefined;
  return typeof insertId === "bigint" ? Number(insertId) : insertId;
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

export function convertNewsItemToTable(newsItem: NewsItem): NewsTable {
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

async function getStartDate(): Promise<Date> {
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

async function scrapeKontanIndexForKanal(kanal: string, startDate: Date): Promise<NewsItem[]> {
  const url = buildKontanIndexUrl(kanal, startDate);
  const response = await fetch(url);
  const html = await response.text();

  const dom = new JSDOM(html);
  const doc = dom.window.document;

  const newsItems: NewsItem[] = [];
  const articleElements = doc.querySelectorAll(".list-berita ul li");

  for (const article of articleElements) {
    const linkElement = article.querySelector("a[href]");
    const titleElement = article.querySelector(".sp-hl h1 a");
    const dateElement = article.querySelector(".fs14");
    const categoryElement = article.querySelector(".linkto-orange a");
    const imageElement = article.querySelector(".pic img[data-src]");

    if (!titleElement || !linkElement) continue;

    const title = titleElement.textContent?.trim() || "";
    const articleUrl = linkElement.getAttribute("href") || "";
    const publishedDateRaw = dateElement?.textContent?.trim() || "";
    const publishedDate = kontanPublishedRawToSqlDate(publishedDateRaw, startDate);
    let category = categoryElement?.textContent?.trim() || "general";
    const imageUrl = imageElement?.getAttribute("data-src") || "";

    if (articleUrl.includes("insight.kontan.co.id")) {
      category = "insight";
    } else if (articleUrl.includes("sportsetup.kontan.co.id")) {
      category = "sportsetup";
    } else if (articleUrl.includes("regional.kontan.co.id")) {
      category = "regional";
    } else if (articleUrl.includes("personalfinance.kontan.co.id")) {
      category = "personalfinance";
    } else if (articleUrl.includes("kiaton.kontan.co.id")) {
      category = "kiaton";
    } else if (articleUrl.includes("belanjaon.kontan.co.id")) {
      category = "belanjaon";
    }

    if (title && articleUrl) {
      const detail = await fetchNewsDetail(articleUrl);
      newsItems.push({
        title,
        content: detail?.content || title,
        url: articleUrl,
        source: "Kontan",
        publishedDate,
        category,
        imageUrl,
      });
    }
  }

  return newsItems;
}

async function scrapeKontanAllKanals(startDate: Date): Promise<NewsItem[]> {
  const seenUrls = new Set<string>();
  const merged: NewsItem[] = [];

  for (const kanal of KONTAN_KANALS) {
    try {
      const batch = await scrapeKontanIndexForKanal(kanal, startDate);
      for (const item of batch) {
        if (seenUrls.has(item.url)) continue;
        seenUrls.add(item.url);
        merged.push(item);
      }
    } catch (error) {
      console.error(`Error scraping Kontan kanal=${kanal}:`, error);
    }
  }

  return merged;
}

/** tanggal kalender lokal (jam di-nol-kan) untuk konteks Kontan / kolom published_date */
function calendarDateOnly(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addCalendarDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/** scrape tiap hari dari rangeStart sampai rangeEnd (inklusif), dedupe URL antar hari */
async function scrapeKontanInclusiveDateRange(
  rangeStart: Date,
  rangeEnd: Date,
  persistToDb: boolean,
): Promise<NewsItem[]> {
  const start = calendarDateOnly(rangeStart);
  const end = calendarDateOnly(rangeEnd);
  const seenUrls = new Set<string>();
  const merged: NewsItem[] = [];

  for (let cursor = start; cursor.getTime() <= end.getTime(); cursor = addCalendarDays(cursor, 1)) {
    try {
      const batch = await scrapeKontanAllKanals(cursor);
      for (const item of batch) {
        if (seenUrls.has(item.url)) continue;
        seenUrls.add(item.url);
        if (persistToDb) {
          await saveNewsItemToDatabase(item);
        }
        merged.push(item);
      }
    } catch (error) {
      console.error(`Error scraping Kontan tanggal=${toSqlDate(cursor)}:`, error);
    }
  }

  return merged;
}

export async function scrapeKontanNews(): Promise<NewsItem[]> {
  const latest = await getStartDate();
  const rangeStart = calendarDateOnly(latest);
  const rangeEnd = calendarDateOnly(new Date());

  console.log(`scrape Kontan ${toSqlDate(rangeStart)} .. ${toSqlDate(rangeEnd)}`);

  try {
    return await scrapeKontanInclusiveDateRange(rangeStart, rangeEnd, false);
  } catch (error) {
    console.error("Error scraping Kontan news:", error);
    throw error;
  }
}

async function fetchNewsDetail(url: string): Promise<NewsDetail | null> {
  try {
    const response = await fetch(url);
    const html = await response.text();

    const dom = new JSDOM(html);
    const doc = dom.window.document;

    const titleElement = doc.querySelector("h1.detail-desk") || doc.querySelector(".artikel__title") || doc.querySelector(".jdl_dtl");
    const contentElement = doc.querySelector(".tmpt-desk-kon") || doc.querySelector("article.col-12") || doc.querySelector(".sec_kiri");

    if (!titleElement) return null;

    const title = titleElement.textContent?.trim() || "";
    const content = cleanContent(html);

    return {
      title,
      content,
      publishedDate: "",
    };
  } catch (error) {
    console.error(`Error fetching news detail from ${url}:`, error);
    return null;
  }
}

export async function scrapeKontanNewsWithContent(): Promise<NewsItem[]> {
  const latest = await getStartDate();
  const rangeStart = calendarDateOnly(latest);
  const rangeEnd = calendarDateOnly(new Date());

  console.log(`scrape Kontan (with content) ${toSqlDate(rangeStart)} .. ${toSqlDate(rangeEnd)}`);

  try {
    return await scrapeKontanInclusiveDateRange(rangeStart, rangeEnd, true);
  } catch (error) {
    console.error("Error scraping Kontan news:", error);
    throw error;
  }
}

export async function saveNewsItemToDatabase(news: NewsItem): Promise<void> {
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
        source: news.source,
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

    const newId = insertIdToNumber(result?.insertId);
    if (newId !== undefined && !Number.isNaN(newId)) {
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

export async function saveNewsToDatabase(newsItems: NewsItem[]): Promise<void> {
  for (const news of newsItems) {
    await saveNewsItemToDatabase(news);
  }
}