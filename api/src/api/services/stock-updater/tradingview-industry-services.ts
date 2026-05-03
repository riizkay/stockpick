import { db } from "@database";
import { DomParser, type RootNode } from "@thednp/domparser";

const TRADINGVIEW_BASE_URL = "https://id.tradingview.com";
const TRADINGVIEW_INDUSTRY_URL = `${TRADINGVIEW_BASE_URL}/markets/stocks-indonesia/sectorandindustry-industry/`;
const TRADINGVIEW_TABLE_SELECTOR = 'tbody[data-testid="selectable-rows-table-body"]';
const TRADINGVIEW_DESCRIPTION_SELECTOR = ".descriptionPanel-DHsSC47R";
const TRADINGVIEW_INDUSTRY_ROW_SELECTORS = [
  `${TRADINGVIEW_TABLE_SELECTOR} tr[data-rowkey^="INDUSTRY_ID:"]`,
  'tr.listRow[data-rowkey^="INDUSTRY_ID:"]',
  'tr[data-rowkey^="INDUSTRY_ID:"]',
];
const TRADINGVIEW_STOCK_ROW_SELECTORS = [
  `${TRADINGVIEW_TABLE_SELECTOR} tr[data-rowkey^="IDX:"]`,
  'tr.listRow[data-rowkey^="IDX:"]',
  'tr[data-rowkey^="IDX:"]',
];
const TRADINGVIEW_INDUSTRY_ANCHOR_SELECTORS = ["td a.tickerLinkCell-eQsxyQA9[href]", "td a[href]"];

type IndustryItem = {
  id: string;
  name: string;
  href: string;
  sector_name: string | null;
};

type IndustryRow = {
  sector_id: number | null;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
};

type StockIndustryRow = {
  industry_id: number;
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

function getIndustryId(rawRowKey: string | null): string | null {
  const value = normalizeText(rawRowKey);
  if (!value.startsWith("INDUSTRY_ID:")) return null;
  const id = value.replace("INDUSTRY_ID:", "").trim();
  return id || null;
}

function getStockCodeFromRowKey(rawRowKey: string | null): string | null {
  const value = normalizeText(rawRowKey);
  if (!value.startsWith("IDX:")) return null;
  const code = value.replace("IDX:", "").trim().toUpperCase();
  if (!code || code.length > 10) return null;
  return code;
}

function parseIndustryListFromHtml(html: string): IndustryItem[] {
  const rowRegex = /<tr\b[^>]*\bdata-rowkey="(INDUSTRY_ID:[^"]+)"[^>]*>([\s\S]*?)<\/tr>/gi;
  const industries: IndustryItem[] = [];
  const seenIds = new Set<string>();
  let rowMatch: RegExpExecArray | null = rowRegex.exec(html);

  while (rowMatch) {
    const industryId = getIndustryId(rowMatch[1] ?? null);
    const rowHtml = rowMatch[2] ?? "";
    const anchorMatches = Array.from(rowHtml.matchAll(/<a\b[^>]*\bhref="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi));
    const industryAnchor = anchorMatches[0];
    const sectorAnchor = anchorMatches[1];
    const href = normalizeText(decodeHtmlEntities(industryAnchor?.[1] ?? ""));
    const name = normalizeText(decodeHtmlEntities(stripHtmlTags(industryAnchor?.[2] ?? "")));
    const sectorName = normalizeText(decodeHtmlEntities(stripHtmlTags(sectorAnchor?.[2] ?? ""))) || null;

    if (industryId && href && name && !seenIds.has(industryId)) {
      seenIds.add(industryId);
      industries.push({
        id: industryId,
        name,
        href,
        sector_name: sectorName,
      });
    }

    rowMatch = rowRegex.exec(html);
  }

  return industries;
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

async function getIndustryList(): Promise<IndustryItem[]> {
  const html = await fetchHtml(TRADINGVIEW_INDUSTRY_URL);
  const document = parseHtml(html);

  const rows = queryWithFallback(document, TRADINGVIEW_INDUSTRY_ROW_SELECTORS);
  const industriesFromDom = rows
    .map((row) => {
      const industryId = getIndustryId(row.getAttribute("data-rowkey"));
      const anchor = TRADINGVIEW_INDUSTRY_ANCHOR_SELECTORS.map((selector) => row.querySelector(selector)).find(
        (node) => node !== null
      );
      const sectorAnchorFromCell = row.querySelector("td:nth-child(6) a[href]");
      const allAnchors = Array.from(row.querySelectorAll("td a[href]"));
      const sectorAnchor = sectorAnchorFromCell ?? allAnchors[1] ?? null;
      const name = normalizeText(anchor?.textContent ?? null);
      const href = normalizeText(anchor?.getAttribute("href"));
      const sectorName = normalizeText(sectorAnchor?.textContent ?? null) || null;
      if (!industryId || !name || !href) return null;

      return {
        id: industryId,
        name,
        href,
        sector_name: sectorName,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  if (industriesFromDom.length > 0) return industriesFromDom;

  const industriesFromRawHtml = parseIndustryListFromHtml(html);
  if (industriesFromRawHtml.length > 0) {
    console.log(`[tradingview-industry-sync] fallback parser html dipakai, total industri: ${industriesFromRawHtml.length}`);
  }

  return industriesFromRawHtml;
}

async function getIndustryData(
  industry: IndustryItem,
  sectorIdByName: Map<string, number>
): Promise<{ industryRow: IndustryRow; stockRows: Omit<StockIndustryRow, "industry_id">[] }> {
  const industryUrl = toAbsoluteUrl(industry.href);
  const html = await fetchHtml(industryUrl);
  const document = parseHtml(html);
  const descriptionRaw = document.querySelector(TRADINGVIEW_DESCRIPTION_SELECTOR)?.textContent ?? null;
  const description = normalizeText(descriptionRaw) || null;
  const stockRows = queryWithFallback(document, TRADINGVIEW_STOCK_ROW_SELECTORS);
  const stockCodesFromDom = stockRows
    .map((row) => getStockCodeFromRowKey(row.getAttribute("data-rowkey")))
    .filter((item): item is NonNullable<typeof item> => item !== null);
  const stockCodes = stockCodesFromDom.length > 0 ? stockCodesFromDom : parseStockCodesFromHtml(html);
  const now = new Date().toISOString();
  const sectorId = industry.sector_name ? (sectorIdByName.get(industry.sector_name.toLowerCase()) ?? null) : null;

  const industryRow: IndustryRow = {
    sector_id: sectorId,
    name: industry.name,
    description,
    created_at: now,
    updated_at: now,
  };

  const rows: Omit<StockIndustryRow, "industry_id">[] = stockCodes.map((stockCode) => ({
    stock_code: stockCode,
    created_at: now,
    updated_at: now,
  }));

  return {
    industryRow,
    stockRows: rows,
  };
}

let isSyncing = false;

export async function syncTradingviewStockIndustries(): Promise<void> {
  if (isSyncing) {
    console.log("[tradingview-industry-sync] masih jalan, skip trigger baru");
    return;
  }

  isSyncing = true;

  try {
    const industries = await getIndustryList();

    if (industries.length === 0) {
      console.log("[tradingview-industry-sync] data industri kosong");
      return;
    }

    const sectors = await db.selectFrom("sector").select(["id", "name"]).execute();
    const sectorIdByName = new Map<string, number>();
    for (const sector of sectors) {
      const key = normalizeText(sector.name).toLowerCase();
      if (!key) continue;
      sectorIdByName.set(key, sector.id);
    }

    const allIndustryData: Array<{ industryRow: IndustryRow; stockRows: Omit<StockIndustryRow, "industry_id">[] }> = [];
    for (const industry of industries) {
      const data = await getIndustryData(industry, sectorIdByName);
      allIndustryData.push(data);
    }

    const totalStockRows = allIndustryData.reduce((acc, item) => acc + item.stockRows.length, 0);
    if (totalStockRows === 0) {
      console.log("[tradingview-industry-sync] data saham per industri kosong");
      return;
    }

    await db.transaction().execute(async (trx) => {
      await trx.deleteFrom("stock_industry").execute();
      await trx.deleteFrom("industry").execute();

      let insertedIndustryCount = 0;
      let insertedStockIndustryCount = 0;
      let missingSectorRelationCount = 0;
      for (const item of allIndustryData) {
        if (item.industryRow.sector_id === null) {
          missingSectorRelationCount += 1;
        }
        const insertIndustryResult = await trx.insertInto("industry").values(item.industryRow).executeTakeFirst();
        const insertIdValue = insertIndustryResult.insertId;
        const industryId =
          typeof insertIdValue === "bigint"
            ? Number(insertIdValue)
            : typeof insertIdValue === "number"
              ? insertIdValue
              : null;

        if (!industryId || Number.isNaN(industryId)) {
          console.log(
            `[tradingview-industry-sync] gagal ambil industry_id auto increment untuk industri ${item.industryRow.name}`
          );
          continue;
        }

        insertedIndustryCount += 1;

        if (item.stockRows.length === 0) continue;
        const stockRowsToInsert: StockIndustryRow[] = item.stockRows.map((row) => ({
          industry_id: industryId,
          stock_code: row.stock_code,
          created_at: row.created_at,
          updated_at: row.updated_at,
        }));
        await trx.insertInto("stock_industry").values(stockRowsToInsert).execute();
        insertedStockIndustryCount += stockRowsToInsert.length;
      }

      console.log(
        `[tradingview-industry-sync] simpan ${insertedIndustryCount} industri dan ${insertedStockIndustryCount} relasi stock_industry selesai`
      );
      if (missingSectorRelationCount > 0) {
        console.log(
          `[tradingview-industry-sync] ${missingSectorRelationCount} industri belum punya relasi sektor (sector_id null)`
        );
      }
    });
  } catch (error) {
    console.error("[tradingview-industry-sync] gagal sync:", error);
  } finally {
    isSyncing = false;
  }
}
