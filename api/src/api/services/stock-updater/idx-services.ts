import { db } from "@database";

type IdxStockSummaryItem = {
  StockCode?: string | null;
  StockName?: string | null;
  Date?: string | null;
  Previous?: number | null;
  OpenPrice?: number | null;
  FirstTrade?: number | null;
  High?: number | null;
  Low?: number | null;
  Close?: number | null;
  Change?: number | null;
  Volume?: number | null;
  Value?: number | null;
  Frequency?: number | null;
  Bid?: number | null;
  BidVolume?: number | null;
  Offer?: number | null;
  OfferVolume?: number | null;
  ForeignBuy?: number | null;
  ForeignSell?: number | null;
  percentage?: number | null;
};

type IdxStockSummaryResponse = {
  data?: IdxStockSummaryItem[] | null;
};

function getJakartaDateString(date = new Date()): string {
  const formatted = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);

  return formatted.replace(/-/g, "");
}

function toNumberOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toIsoOrNull(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

let isSyncing = false;

export async function syncIdxStockSummaries(): Promise<void> {
  if (isSyncing) {
    console.log("[idx-sync] masih jalan, skip trigger baru");
    return;
  }

  isSyncing = true;

  try {
    const dateParam = getJakartaDateString();
    const url = `https://www.idx.co.id/primary/TradingSummary/GetStockSummary?length=9999&start=0&date=${dateParam}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`IDX response ${response.status}`);
    }

    const payload = (await response.json()) as IdxStockSummaryResponse;
    const rows = payload.data ?? [];

    if (rows.length === 0) {
      console.log("[idx-sync] data kosong");
      return;
    }

    const now = new Date().toISOString();
    const values = rows
      .map((item) => {
        const stockCode = item.StockCode?.trim().toUpperCase();
        if (!stockCode || stockCode.length > 6) return null;

        return {
          stock_code: stockCode,
          stock_name: item.StockName?.trim() || null,
          trading_date: toIsoOrNull(item.Date),
          previous_price: toNumberOrNull(item.Previous),
          open_price: toNumberOrNull(item.OpenPrice),
          first_trade_price: toNumberOrNull(item.FirstTrade),
          high_price: toNumberOrNull(item.High),
          low_price: toNumberOrNull(item.Low),
          close_price: toNumberOrNull(item.Close),
          change_price: toNumberOrNull(item.Change),
          volume: toNumberOrNull(item.Volume),
          trade_value: toNumberOrNull(item.Value),
          frequency: toNumberOrNull(item.Frequency),
          bid_price: toNumberOrNull(item.Bid),
          bid_volume: toNumberOrNull(item.BidVolume),
          offer_price: toNumberOrNull(item.Offer),
          offer_volume: toNumberOrNull(item.OfferVolume),
          foreign_buy: toNumberOrNull(item.ForeignBuy),
          foreign_sell: toNumberOrNull(item.ForeignSell),
          percentage: toNumberOrNull(item.percentage),
          updated_at: now,
          created_at: now,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    if (values.length === 0) {
      console.log("[idx-sync] tidak ada data valid untuk disimpan");
      return;
    }

    await db.transaction().execute(async (trx) => {
      for (const item of values) {
        await trx
          .insertInto("stocks")
          .values(item)
          .onDuplicateKeyUpdate({
            stock_name: item.stock_name,
            trading_date: item.trading_date,
            previous_price: item.previous_price,
            open_price: item.open_price,
            first_trade_price: item.first_trade_price,
            high_price: item.high_price,
            low_price: item.low_price,
            close_price: item.close_price,
            change_price: item.change_price,
            volume: item.volume,
            trade_value: item.trade_value,
            frequency: item.frequency,
            bid_price: item.bid_price,
            bid_volume: item.bid_volume,
            offer_price: item.offer_price,
            offer_volume: item.offer_volume,
            foreign_buy: item.foreign_buy,
            foreign_sell: item.foreign_sell,
            percentage: item.percentage,
            updated_at: item.updated_at,
          })
          .execute();
      }
    });

    console.log(`[idx-sync] upsert ${values.length} saham selesai`);
  } catch (error) {
    console.error("[idx-sync] gagal sync:", error);
  } finally {
    isSyncing = false;
  }
}
