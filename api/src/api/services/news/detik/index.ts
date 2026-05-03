import { NewsScraper, NewsItem, NewsDetail, createBaseDateParser, stripContentChrome } from "../news-scraper-base";

const DETIK_MONTHS: Record<string, number> = {
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

const DETIK_URL = "https://www.detik.com";

export class DetikScraper implements NewsScraper {
  name = "Detik";
  baseUrl = DETIK_URL;

  dateParser = createBaseDateParser(DETIK_MONTHS, new Date());

  async scrapeIndex(startDate: Date, kanal?: string): Promise<NewsItem[]> {
    const url = kanal ? `${this.baseUrl}/${kanal}` : this.baseUrl;
    const response = await fetch(url);
    const html = await response.text();

    const dom = new JSDOM(html);
    const doc = dom.window.document;

    const newsItems: NewsItem[] = [];
    const articleElements = doc.querySelectorAll("article");

    for (const article of articleElements) {
      const linkElement = article.querySelector("a[href]");
      const titleElement = article.querySelector("h2, h3");
      const dateElement = article.querySelector("time");
      const categoryElement = article.querySelector("span");
      const imageElement = article.querySelector("img");

      if (!titleElement || !linkElement) continue;

      const title = titleElement.textContent?.trim() || "";
      const articleUrl = linkElement.getAttribute("href") || "";
      const publishedDateRaw = dateElement?.textContent?.trim() || "";
      const publishedDate = this.dateParser.parse(publishedDateRaw, startDate);
      let category = categoryElement?.textContent?.trim() || "general";
      const imageUrl = imageElement?.getAttribute("src") || "";

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

  async scrapeDetail(url: string): Promise<NewsDetail | null> {
    try {
      const response = await fetch(url);
      const html = await response.text();

      const dom = new JSDOM(html);
      const doc = dom.window.document;

      const titleElement = doc.querySelector("h1");
      const contentElement = doc.querySelector("article");

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

    const contentElement = doc.querySelector("article");

    if (!contentElement) {
      return "";
    }

    stripContentChrome(contentElement, [
      "script",
      "style",
      "noscript",
      "iframe",
      "svg",
      "template",
      ".ad-container",
      ".advertisement",
      ".sidebar",
    ]);

    const text = contentElement.textContent || "";

    return text
      .replace(/\s+/g, " ")
      .replace(/\n\s*\n/g, "\n")
      .trim();
  }
}