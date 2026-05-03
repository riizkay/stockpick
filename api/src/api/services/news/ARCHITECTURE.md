# News Scraper Architecture

## Overview

Struktur modular untuk scraping berita dari berbagai sumber dengan pola plugin.

## Struktur Folder

```
news/
├── news-scraper-base.ts          # Base interface dan utility functions
├── news-scraper-factory.ts       # Factory pattern untuk scraper registry
├── news-scraper-utils.ts         # Utility functions untuk scraping
├── news-updater-service.ts       # Service untuk update berita ke DB dan Qdrant
├── news-published-date-parse.ts  # Date parser untuk Kontan
├── example-new-scraper.ts        # Contoh scraper baru
├── README.md                     # Dokumentasi
└── ARCHITECTURE.md               # Dokumentasi arsitektur
└── kontan/
    └── index.ts                  # Kontan scraper implementation
└── cnbc/
    └── index.ts                  # CNBC scraper implementation
└── detik/
    └── index.ts                  # Detik scraper implementation
```

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     News Scraper System                      │
└─────────────────────────────────────────────────────────────┘

┌──────────────────┐
│   News Updater   │
│  Service         │
└────────┬─────────┘
         │
         │ uses
         ▼
┌──────────────────┐
│  Scraper Factory │
│  (Registry)      │
└────────┬─────────┘
         │
         │ creates
         ▼
┌──────────────────┐
│   News Scraper   │
│   Interface      │
└────────┬─────────┘
         │
         │ implements
         ▼
┌──────────────────┐
│  Kontan Scraper  │
│  CNBC Scraper    │
│  Detik Scraper   │
│  [Custom]        │
└──────────────────┘

┌──────────────────┐
│  Base Utilities  │
│  - Date Parser   │
│  - Content Clean │
│  - HTML Parser   │
└──────────────────┘
```

## Component Descriptions

### 1. News Scraper Base (`news-scraper-base.ts`)

Menyediakan interface dan utility functions yang digunakan oleh semua scraper:

- `NewsScraper` interface: Contract untuk semua scraper
- `DateParser` interface: Contract untuk parsing tanggal
- `createBaseDateParser()`: Factory function untuk membuat date parser
- `cleanContent()`: Utility untuk membersihkan konten HTML
- `stripContentChrome()`: Utility untuk menghapus elemen yang tidak perlu

### 2. Scraper Factory (`news-scraper-factory.ts`)

Menyediakan registry untuk semua scraper yang terdaftar:

- `createNewsScraperFactory()`: Factory function untuk membuat factory
- `registerScraper()`: Register scraper baru
- `getRegisteredScrapers()`: Mendapatkan daftar semua scraper yang terdaftar
- `isScraperRegistered()`: Cek apakah scraper terdaftar

### 3. Scraper Utilities (`news-scraper-utils.ts`)

Utility functions untuk scraping:

- `getLatestNewsDate()`: Mendapatkan tanggal berita terbaru dari DB
- `calendarDateOnly()`: Mengembalikan tanggal tanpa jam
- `addCalendarDays()`: Menambah hari ke tanggal
- `scrapeNewsInclusiveDateRange()`: Scraping berita dalam range tanggal
- `saveNewsItemToDatabase()`: Menyimpan berita ke database
- `convertNewsItemToTable()`: Mengonversi NewsItem ke NewsTable

### 4. News Updater Service (`news-updater-service.ts`)

Service utama untuk update berita:

- `updateNews(sources)`: Update berita dari multiple sources
- Menggunakan factory untuk mendapatkan scraper
- Menyimpan berita ke database dan Qdrant

### 5. Scraper Implementations

Setiap sumber memiliki folder dengan file `index.ts`:

- `kontan/index.ts`: Scraper untuk Kontan
- `cnbc/index.ts`: Scraper untuk CNBC
- `detik/index.ts`: Scraper untuk Detik
- `example-new-scraper.ts`: Contoh scraper baru

## How It Works

1. **Registration**: Scraper baru didaftarkan di `news-scraper-factory.ts`
2. **Factory**: Factory membuat instance scraper berdasarkan nama sumber
3. **Scraping**: Scraper mengambil berita dari website target
4. **Cleaning**: Konten di-clean menggunakan utility functions
5. **Storage**: Berita disimpan ke database dan Qdrant

## Adding a New Scraper

1. Buat folder baru di `news/` dengan nama sumber
2. Buat file `index.ts` dengan implementasi `NewsScraper`
3. Register scraper di `news-scraper-factory.ts`
4. Gunakan di `news-updater-service.ts`

## Benefits

- **Modular**: Setiap scraper terpisah dan independen
- **Extensible**: Mudah menambahkan scraper baru
- **Reusable**: Utility functions digunakan bersama
- **Maintainable**: Struktur yang jelas dan mudah dipahami
- **Type-safe**: Menggunakan TypeScript untuk type checking