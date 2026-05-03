import { NewsScraper, NewsScraperFactory } from "./news-scraper-base";
import { KontanScraper } from "./kontan";
import { CnbcScraper } from "./cnbc";

const scrapers = new Map<string, NewsScraper>();

function registerScraper(scraper: NewsScraper): void {
  scrapers.set(scraper.name.toLowerCase(), scraper);
}

export function createNewsScraperFactory(): NewsScraperFactory {
  registerScraper(new KontanScraper());

  return {
    createScraper(source: string): NewsScraper | null {
      const normalizedSource = source.toLowerCase().trim();
      return scrapers.get(normalizedSource) || null;
    },
  };
}

export function getRegisteredScrapers(): string[] {
  return Array.from(scrapers.keys());
}

export function isScraperRegistered(source: string): boolean {
  return scrapers.has(source.toLowerCase().trim());
}