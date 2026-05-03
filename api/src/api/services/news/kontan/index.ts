import { JSDOM } from "jsdom";
import { NewsScraper, NewsItem, NewsDetail, createBaseDateParser, stripContentChrome } from "../news-scraper-base";

const KONTAN_MONTHS: Record<string, number> = {
  januari: 1,
  februari: 2,
  maret: 3,
  april: 4,
  mei: 5,
  juni: 6,
  juli: 7,
  agustus: 8,
  september: 9,
  oktober: 10,
  november: 11,
  desember: 12,
};

const KONTAN_EN_MONTHS: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

const KONTAN_URL = "https://www.kontan.co.id/search/indeks";

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

const KONTAN_CONTENT_SELECTORS = [".tmpt-desk-kon", "article.col-12", ".sec_kiri"];

const KONTAN_CHROME_SELECTORS = [
  "#persona-widget",
  ".persona-widget",
  ".insideads",
  "#adsoutsream",
  ".bacajuga-listdesk",
  ".ads-inreads",
  ".pagination",
  "#share-it",
  "[id^='div-belowarticle']",
  ".head-sec",
  "#loop_lastest",
  ".penampang_paging",
  "#isi-diskus-det",
  ".kgmPWall",
  ".kgmModal",
  ".artikel__sosmed",
  ".artikel__tags",
  ".listbut-shr",
  ".wrap-tag",
  ".ff-opensans",
];

const KONTAN_INDEX_SELECTORS = {
  article: ".list-berita ul li",
  title: ".sp-hl h1 a",
  link: "a[href]",
  date: ".fs14",
  category: ".linkto-orange a",
  image: ".pic img[data-src]",
};

const KONTAN_DETAIL_SELECTORS = {
  title: ["h1.detail-desk", ".artikel__title", ".jdl_dtl"],
  content: KONTAN_CONTENT_SELECTORS,
};

export class KontanScraper implements NewsScraper {
  name = "Kontan";
  baseUrl = KONTAN_URL;

  dateParser = createBaseDateParser(
    { ...KONTAN_MONTHS, ...KONTAN_EN_MONTHS },
    new Date()
  );

  buildIndexUrl(kanal: string, startDate: Date): string {
    const dateStr = startDate.getDate().toString().padStart(2, "0");
    const monthStr = (startDate.getMonth() + 1).toString().padStart(2, "0");
    const yearStr = startDate.getFullYear().toString();
    return `${this.baseUrl}?kanal=${encodeURIComponent(kanal)}&tanggal=${dateStr}&bulan=${monthStr}&tahun=${yearStr}&pos=indeks`;
  }

  async scrapeIndex(startDate: Date, kanal?: string): Promise<NewsItem[]> {
    const url = kanal ? this.buildIndexUrl(kanal, startDate) : this.baseUrl;
    const response = await fetch(url);
    const html = await response.text();

    const dom = new JSDOM(html);
    const doc = dom.window.document;

    const newsItems: NewsItem[] = [];
    const articleElements = doc.querySelectorAll(KONTAN_INDEX_SELECTORS.article);

    for (const article of articleElements) {
      const linkElement = article.querySelector(KONTAN_INDEX_SELECTORS.link);
      const titleElement = article.querySelector(KONTAN_INDEX_SELECTORS.title);
      const dateElement = article.querySelector(KONTAN_INDEX_SELECTORS.date);
      const categoryElement = article.querySelector(KONTAN_INDEX_SELECTORS.category);
      const imageElement = article.querySelector(KONTAN_INDEX_SELECTORS.image);

      if (!titleElement || !linkElement) continue;

      const title = titleElement.textContent?.trim() || "";
      const articleUrl = linkElement.getAttribute("href") || "";
      const publishedDateRaw = dateElement?.textContent?.trim() || "";
      const publishedDate = this.dateParser.parse(publishedDateRaw, startDate);
      let category = categoryElement?.textContent?.trim() || "general";
      const imageUrl = imageElement?.getAttribute("data-src") || "";

      category = this.categorizeKontanArticle(articleUrl, category);

      if (title && articleUrl) {
        const detail = await this.scrapeDetail(articleUrl);
        newsItems.push({
          title,
          content: detail?.content || title,
          url: articleUrl,
          source: this.name,
          publishedDate,
          category,
          imageUrl,
        });
      }
    }

    return newsItems;
  }

  categorizeKontanArticle(url: string, category: string): string {
    if (url.includes("insight.kontan.co.id")) return "insight";
    if (url.includes("sportsetup.kontan.co.id")) return "sportsetup";
    if (url.includes("regional.kontan.co.id")) return "regional";
    if (url.includes("personalfinance.kontan.co.id")) return "personalfinance";
    if (url.includes("kiaton.kontan.co.id")) return "kiaton";
    if (url.includes("belanjaon.kontan.co.id")) return "belanjaon";
    return category;
  }

  async scrapeDetail(url: string): Promise<NewsDetail | null> {
    try {
      const response = await fetch(url);
      const html = await response.text();

      const dom = new JSDOM(html);
      const doc = dom.window.document;

      const titleElement = KONTAN_DETAIL_SELECTORS.title
        .map((selector) => doc.querySelector(selector))
        .find((el) => el !== null);
      const contentElement = KONTAN_DETAIL_SELECTORS.content
        .map((selector) => doc.querySelector(selector))
        .find((el) => el !== null);

      if (!titleElement) return null;

      const title = titleElement.textContent?.trim() || "";
      const content = this.cleanContent(html);

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

  cleanContent(html: string): string {
    const dom = new JSDOM(html);
    const doc = dom.window.document;

    const contentElement = KONTAN_CONTENT_SELECTORS
      .map((selector) => doc.querySelector(selector))
      .find((el) => el !== null);

    if (!contentElement) {
      return "";
    }

    stripContentChrome(contentElement, KONTAN_CHROME_SELECTORS);

    const text = contentElement.textContent || "";

    return text
      .replace(/\s+/g, " ")
      .replace(/\n\s*\n/g, "\n")
      .trim();
  }
}