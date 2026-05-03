# News Scraper Architecture

Struktur modular untuk scraping berita dari berbagai sumber.

## Struktur Folder

```
news/
├── news-scraper-base.ts          # Base interface dan utility functions
├── news-scraper-factory.ts       # Factory pattern untuk scraper registry
├── news-scraper-utils.ts         # Utility functions untuk scraping
├── news-updater-service.ts       # Service untuk update berita ke DB dan Qdrant
├── news-published-date-parse.ts  # Date parser untuk Kontan
└── kontan/
    └── index.ts                  # Kontan scraper implementation
```

## Cara Menambahkan Scraper Baru

1. Buat folder baru di dalam `news/` dengan nama sumber (contoh: `cnbc`, `detik`)

2. Buat file `index.ts` di dalam folder tersebut dengan implementasi:

```typescript
import { NewsScraper, NewsItem, NewsDetail, createBaseDateParser, stripContentChrome } from "../news-scraper-base";

export class CnbcScraper implements NewsScraper {
  name = "CNBC";
  baseUrl = "https://www.cnbc.com";

  dateParser = createBaseDateParser(
    { ...KONTAN_MONTHS, ...KONTAN_EN_MONTHS },
    new Date()
  );

  async scrapeIndex(startDate: Date, kanal?: string): Promise<NewsItem[]> {
    // Implementasi scraping index
  }

  async scrapeDetail(url: string): Promise<NewsDetail | null> {
    // Implementasi scraping detail
  }

  cleanContent(html: string): string {
    // Implementasi clean content
  }
}
```

3. Register scraper di `news-scraper-factory.ts`:

```typescript
import { CnbcScraper } from "./cnbc";

function registerScraper(scraper: NewsScraper): void {
  scrapers.set(scraper.name.toLowerCase(), scraper);
}

export function createNewsScraperFactory(): NewsScraperFactory {
  registerScraper(new KontanScraper());
  registerScraper(new CnbcScraper()); // Tambahkan scraper baru

  return {
    createScraper(source: string): NewsScraper | null {
      const normalizedSource = source.toLowerCase().trim();
      return scrapers.get(normalizedSource) || null;
    },
  };
}
```

4. Gunakan scraper baru di `news-updater-service.ts`:

```typescript
export async function updateNews(sources: string[] = ["Kontan", "CNBC"]): Promise<void> {
  // ...
  for (const source of sources) {
    const scraper = factory.createScraper(source);
    // ...
  }
}
```

## Contoh Scraper Lain

Untuk menambahkan scraper untuk CNBC, Detik, dll, ikuti pola yang sama dengan `KontanScraper`.