import { JSDOM } from "jsdom";

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

export interface DateParser {
  parse(raw: string, fallback: Date): string;
}

export interface NewsScraper {
  name: string;
  baseUrl: string;
  dateParser: DateParser;
  scrapeIndex(startDate: Date, kanal?: string): Promise<NewsItem[]>;
  scrapeDetail(url: string): Promise<NewsDetail | null>;
  cleanContent(html: string): string;
}

export interface NewsScraperFactory {
  createScraper(source: string): NewsScraper | null;
}

export function createBaseDateParser(
  monthMap: Record<string, number>,
  fallbackDate: Date
): DateParser {
  return {
    parse(raw: string, fallback: Date): string {
      if (!raw?.trim()) return fallback.toISOString().split("T")[0];

      let s = raw.trim().replace(/\s+/g, " ");

      const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (iso) {
        const year = Number(iso[1]);
        const month = Number(iso[2]);
        const day = Number(iso[3]);
        const d = new Date(year, month - 1, day);
        if (d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day) {
          return d.toISOString().split("T")[0];
        }
        return fallback.toISOString().split("T")[0];
      }

      const m = s.match(/^(\d{1,2})\s+([a-zA-Z]+)\s+(\d{4})$/);
      if (!m) return fallback.toISOString().split("T")[0];

      const day = Number(m[1]);
      const monthWord = m[2].toLowerCase();
      const year = Number(m[3]);

      const month = monthMap[monthWord];
      if (month === undefined || day < 1 || day > 31) return fallback.toISOString().split("T")[0];

      const d = new Date(year, month - 1, day);
      if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) {
        return fallback.toISOString().split("T")[0];
      }
      return d.toISOString().split("T")[0];
    },
  };
}

export function cleanContent(html: string, contentSelectors: string[]): string {
  const dom = new JSDOM(html);
  const doc = dom.window.document;

  const contentElement = contentSelectors
    .map((selector) => doc.querySelector(selector))
    .find((el) => el !== null);

  if (!contentElement) {
    return "";
  }

  contentElement.querySelectorAll("script, style, noscript, iframe, svg, template").forEach((node) => {
    node.remove();
  });

  const text = contentElement.textContent || "";

  return text
    .replace(/\s+/g, " ")
    .replace(/\n\s*\n/g, "\n")
    .trim();
}

export function stripContentChrome(contentElement: Element, chromeSelectors: string[]): void {
  chromeSelectors.forEach((selector) => {
    contentElement.querySelectorAll(selector).forEach((el) => el.remove());
  });
}