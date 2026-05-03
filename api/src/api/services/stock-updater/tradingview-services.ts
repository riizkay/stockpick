import { db } from "@database";
import { DomParser, type RootNode } from "@thednp/domparser";

const TRADINGVIEW_BASE_URL = "https://id.tradingview.com";
const TRADINGVIEW_SECTOR_URL = `${TRADINGVIEW_BASE_URL}/markets/stocks-indonesia/sectorandindustry-sector/`;
const TRADINGVIEW_TABLE_SELECTOR = 'tbody[data-testid="selectable-rows-table-body"]';
const TRADINGVIEW_DESCRIPTION_SELECTOR = ".descriptionPanel-DHsSC47R";
const TRADINGVIEW_SECTOR_ROW_SELECTORS = [
  `${TRADINGVIEW_TABLE_SELECTOR} tr[data-rowkey^="SECTOR_ID:"]`,
  'tr.listRow[data-rowkey^="SECTOR_ID:"]',
  'tr[data-rowkey^="SECTOR_ID:"]',
];
const TRADINGVIEW_STOCK_ROW_SELECTORS = [
  `${TRADINGVIEW_TABLE_SELECTOR} tr[data-rowkey^="IDX:"]`,
  'tr.listRow[data-rowkey^="IDX:"]',
  'tr[data-rowkey^="IDX:"]',
];
const TRADINGVIEW_SECTOR_ANCHOR_SELECTORS = [
  "td a.tickerLinkCell-eQsxyQA9[href]",
  "td a[href]",
];

type SectorItem = {
  id: string;
  name: string;
  href: string;
};

type SectorRow = {
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
};

type StockSectorRow = {
  sector_id: number;
  stock_code: string;
  created_at: string;
  updated_at: string;
};

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function stripHtmlTags(value: string): string {
  return value.replace(/<[^>]*>/g, " ");
}

function toAbsoluteUrl(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${TRADINGVIEW_BASE_URL}${path}`;
}

function parseHtml(html: string): RootNode {
  const parser = DomParser();
  const { root } = parser.parseFromString(html);
  return root;
}

function queryWithFallback(document: RootNode, selectors: string[]) {
  for (const selector of selectors) {
    const nodes = Array.from(document.querySelectorAll(selector));
    if (nodes.length > 0) return nodes;
  }

  return [];
}

function parseSectorListFromHtml(html: string): SectorItem[] {
  const rowRegex = /<tr\b[^>]*\bdata-rowkey="(SECTOR_ID:[^"]+)"[^>]*>([\s\S]*?)<\/tr>/gi;
  const sectors: SectorItem[] = [];
  const seenIds = new Set<string>();
  let rowMatch: RegExpExecArray | null = rowRegex.exec(html);

  while (rowMatch) {
    const sectorId = getSectorId(rowMatch[1] ?? null);
    const rowHtml = rowMatch[2] ?? "";
    const anchorMatch = /<a\b[^>]*\bhref="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(rowHtml);
    const href = normalizeText(decodeHtmlEntities(anchorMatch?.[1] ?? ""));
    const name = normalizeText(decodeHtmlEntities(stripHtmlTags(anchorMatch?.[2] ?? "")));

    if (sectorId && href && name && !seenIds.has(sectorId)) {
      seenIds.add(sectorId);
      sectors.push({
        id: sectorId,
        name,
        href,
      });
    }

    rowMatch = rowRegex.exec(html);
  }

  return sectors;
}

function parseStockCodesFromHtml(html: string): string[] {
  const rowRegex = /<tr\b[^>]*\bdata-rowkey="(IDX:[^"]+)"[^>]*>/gi;
  const stockCodes: string[] = [];
  const seenCodes = new Set<string>();
  let rowMatch: RegExpExecArray | null = rowRegex.exec(html);

  while (rowMatch) {
    const stockCode = getStockCodeFromRowKey(rowMatch[1] ?? null);
    if (stockCode && !seenCodes.has(stockCode)) {
      seenCodes.add(stockCode);
      stockCodes.push(stockCode);
    }
    rowMatch = rowRegex.exec(html);
  }

  return stockCodes;
}

function getSectorId(rawRowKey: string | null): string | null {
  const value = normalizeText(rawRowKey);
  if (!value.startsWith("SECTOR_ID:")) return null;
  const id = value.replace("SECTOR_ID:", "").trim();
  return id || null;
}

function getStockCodeFromRowKey(rawRowKey: string | null): string | null {
  const value = normalizeText(rawRowKey);
  if (!value.startsWith("IDX:")) return null;
  const code = value.replace("IDX:", "").trim().toUpperCase();
  if (!code || code.length > 10) return null;
  return code;
}

async function fetchHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      accept: "text/html,application/xhtml+xml",
      "accept-language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
    },
  });

  if (!response.ok) {
    throw new Error(`TradingView response ${response.status} (${url})`);
  }

  return response.text();
}

async function getSectorList(): Promise<SectorItem[]> {
  const html = await fetchHtml(TRADINGVIEW_SECTOR_URL);

  const document = parseHtml(html);

  const rows = queryWithFallback(document, TRADINGVIEW_SECTOR_ROW_SELECTORS);
  const sectorsFromDom = rows
    .map((row) => {
      const sectorId = getSectorId(row.getAttribute("data-rowkey"));
      const anchor = TRADINGVIEW_SECTOR_ANCHOR_SELECTORS.map((selector) => row.querySelector(selector)).find(
        (node) => node !== null
      );
      const name = normalizeText(anchor?.textContent ?? null);
      const href = normalizeText(anchor?.getAttribute("href"));
      if (!sectorId || !name || !href) return null;

      return {
        id: sectorId,
        name,
        href,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  if (sectorsFromDom.length > 0) return sectorsFromDom;

  const sectorsFromRawHtml = parseSectorListFromHtml(html);
  if (sectorsFromRawHtml.length > 0) {
    console.log(`[tradingview-sync] fallback parser html dipakai, total sektor: ${sectorsFromRawHtml.length}`);
  }

  return sectorsFromRawHtml;
}

async function getSectorData(
  sector: SectorItem
): Promise<{ sectorRow: SectorRow; stockRows: Omit<StockSectorRow, "sector_id">[] }> {
  const sectorUrl = toAbsoluteUrl(sector.href);
  const html = await fetchHtml(sectorUrl);
  const document = parseHtml(html);
  const descriptionRaw = document.querySelector(TRADINGVIEW_DESCRIPTION_SELECTOR)?.textContent ?? null;
  const description = normalizeText(descriptionRaw) || null;
  const stockRows = queryWithFallback(document, TRADINGVIEW_STOCK_ROW_SELECTORS);
  const stockCodesFromDom = stockRows
    .map((row) => getStockCodeFromRowKey(row.getAttribute("data-rowkey")))
    .filter((item): item is NonNullable<typeof item> => item !== null);
  const stockCodes = stockCodesFromDom.length > 0 ? stockCodesFromDom : parseStockCodesFromHtml(html);
  const now = new Date().toISOString();

  const sectorRow: SectorRow = {
    name: sector.name,
    description,
    created_at: now,
    updated_at: now,
  };

  const rows: Omit<StockSectorRow, "sector_id">[] = stockCodes.map((stockCode) => ({
    stock_code: stockCode,
    created_at: now,
    updated_at: now,
  }));

  return {
    sectorRow,
    stockRows: rows,
  };
}

let isSyncing = false;

export async function syncTradingviewStockSectors(): Promise<void> {
  if (isSyncing) {
    console.log("[tradingview-sync] masih jalan, skip trigger baru");
    return;
  }

  isSyncing = true;

  try {
    const sectors = await getSectorList();

    if (sectors.length === 0) {
      console.log("[tradingview-sync] data sektor kosong");
      return;
    }

    const allSectorData: Array<{ sectorRow: SectorRow; stockRows: Omit<StockSectorRow, "sector_id">[] }> = [];
    for (const sector of sectors) {
      const data = await getSectorData(sector);
      allSectorData.push(data);
    }

    const totalStockRows = allSectorData.reduce((acc, item) => acc + item.stockRows.length, 0);
    if (totalStockRows === 0) {
      console.log("[tradingview-sync] data saham per sektor kosong");
      return;
    }

    await db.transaction().execute(async (trx) => {
      await trx.deleteFrom("stock_sector").execute();
      await trx.deleteFrom("sector").execute();

      let insertedSectorCount = 0;
      let insertedStockSectorCount = 0;
      for (const item of allSectorData) {
        const insertSectorResult = await trx.insertInto("sector").values(item.sectorRow).executeTakeFirst();
        const insertIdValue = insertSectorResult.insertId;
        const sectorId =
          typeof insertIdValue === "bigint"
            ? Number(insertIdValue)
            : typeof insertIdValue === "number"
              ? insertIdValue
              : null;

        if (!sectorId || Number.isNaN(sectorId)) {
          console.log(`[tradingview-sync] gagal ambil sector_id auto increment untuk sektor ${item.sectorRow.name}`);
          continue;
        }

        insertedSectorCount += 1;

        if (item.stockRows.length === 0) continue;
        const stockRowsToInsert: StockSectorRow[] = item.stockRows.map((row) => ({
          sector_id: sectorId,
          stock_code: row.stock_code,
          created_at: row.created_at,
          updated_at: row.updated_at,
        }));
        await trx.insertInto("stock_sector").values(stockRowsToInsert).execute();
        insertedStockSectorCount += stockRowsToInsert.length;
      }

      console.log(
        `[tradingview-sync] simpan ${insertedSectorCount} sektor dan ${insertedStockSectorCount} relasi stock_sector selesai`
      );
    });
  } catch (error) {
    console.error("[tradingview-sync] gagal sync:", error);
  } finally {
    isSyncing = false;
  }
}
