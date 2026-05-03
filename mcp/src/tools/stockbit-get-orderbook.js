import { z } from 'zod';
import { ORDERBOOK_URL_BASE } from '../shared/config.js';
import { BROWSERISH_GET_HEADERS } from '../shared/http.js';
import { resolveToken } from '../shared/token.js';

function toNum(v) {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeDepthRow(row) {
  if (row == null || typeof row !== 'object') return row;
  return {
    price: toNum(row.price),
    queNum: toNum(row.que_num),
    volume: toNum(row.volume),
    changePercentage:
      row.change_percentage === '' || row.change_percentage == null
        ? null
        : String(row.change_percentage),
  };
}

function buildCompactPayload(parsed, depth) {
  const d = parsed && typeof parsed === 'object' ? parsed.data : null;
  if (!d || typeof d !== 'object') {
    return { message: parsed?.message, rawShape: 'unknown', note: 'tidak ada parsed.data' };
  }

  const bidArr = Array.isArray(d.bid) ? d.bid : [];
  const offerArr = Array.isArray(d.offer) ? d.offer : [];
  const bestBid = bidArr[0];
  const bestOffer = offerArr[0];
  const bidP = bestBid != null ? toNum(bestBid.price) : null;
  const askP = bestOffer != null ? toNum(bestOffer.price) : null;

  return {
    message: parsed.message,
    summary: {
      symbol: d.symbol ?? null,
      name: d.name ?? null,
      lastprice: d.lastprice ?? null,
      previous: d.previous ?? null,
      change: d.change ?? null,
      percentageChange: d.percentage_change ?? null,
      open: d.open ?? null,
      high: d.high ?? null,
      low: d.low ?? null,
      close: d.close ?? null,
      average: d.average ?? null,
      volume: d.volume ?? null,
      value: d.value ?? null,
      frequency: d.frequency ?? null,
      status: d.status ?? null,
      tradable: d.tradable ?? null,
      exchange: d.exchange ?? null,
      fbuy: d.fbuy ?? null,
      fsell: d.fsell ?? null,
      fnet: d.fnet ?? null,
    },
    topOfBook: {
      bestBidPrice: bidP,
      bestBidVolume: bestBid != null ? toNum(bestBid.volume) : null,
      bestOfferPrice: askP,
      bestOfferVolume: bestOffer != null ? toNum(bestOffer.volume) : null,
      spread:
        bidP != null && askP != null && askP >= bidP ? askP - bidP : null,
    },
    bid: bidArr.slice(0, depth).map(normalizeDepthRow),
    offer: offerArr.slice(0, depth).map(normalizeDepthRow),
    totalBidOffer: d.total_bid_offer ?? null,
    ara: d.ara ?? null,
    arb: d.arb ?? null,
    nextAra: d.next_ara ?? null,
    nextArb: d.next_arb ?? null,
    iepiev: d.iepiev ?? null,
    marketData: d.market_data ?? null,
    depthLevelsReturned: depth,
    depthTotals: { bid: bidArr.length, offer: offerArr.length },
  };
}

export function registerStockbitGetOrderbook(mcpServer) {
  mcpServer.registerTool(
    'stockbit_get_orderbook',
    {
      description: `GET order book dari exodus Stockbit (GET .../v2/orderbook/companies/{ticker}).

Respons API umumnya: { data: { symbol, name, bid[], offer[], lastprice, volume, iepiev, total_bid_offer, ara/arb, market_data, ... }, message }.
Setiap level bid/offer: price, que_num, volume, change_percentage (string dari API).

Parameter compact=true mengembalikan ringkasan + bid/offer terpotong (depth) dan angka level di-parse ke number; compact tidak di-set / false = body API penuh di field body.`,
      inputSchema: {
        ticker: z
          .string()
          .describe(
            'Kode saham Indonesia, mis. BBCA, TLKM (akan dinormalisasi ke huruf besar).'
          ),
        compact: z
          .boolean()
          .optional()
          .describe(
            'true: keluaran ringkas (summary, topOfBook, bid/offer terpotong, tanpa payload auto_reject_estimation panjang). false: body API penuh di field body.'
          ),
        depth: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .describe(
            'Jumlah level bid/offer tiap sisi saat compact=true. Default 10.'
          ),
        stockbit_token: z
          .string()
          .optional()
          .describe(
            'Opsional. Hanya isi jika override token. Kosongkan agar pakai STOCKBIT_TOKEN dari env MCP.'
          ),
      },
    },
    async ({ ticker, compact, depth: depthRaw, stockbit_token: tokenOverride }) => {
      const depth = depthRaw ?? 10;
      const useCompact = compact === true;
      const code = String(ticker ?? '')
        .trim()
        .toUpperCase();
      if (!code) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                { error: 'ticker wajib diisi (kode saham).' },
                null,
                2
              ),
            },
          ],
        };
      }

      const token = resolveToken(tokenOverride);
      if (!token) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  error:
                    'Token tidak ada. Set STOCKBIT_TOKEN pada konfigurasi MCP server (env).',
                },
                null,
                2
              ),
            },
          ],
        };
      }

      const url = `${ORDERBOOK_URL_BASE.replace(/\/$/, '')}/${encodeURIComponent(code)}`;

      try {
        const res = await fetch(url, {
          method: 'GET',
          headers: {
            ...BROWSERISH_GET_HEADERS,
            Authorization: `Bearer ${token}`,
          },
        });

        const raw = await res.text();
        let parsed;
        try {
          parsed = JSON.parse(raw);
        } catch {
          parsed = raw;
        }

        const baseMeta = { url, ticker: code, status: res.status, ok: res.ok };
        const payload = useCompact
          ? {
              ...baseMeta,
              compact: true,
              ...buildCompactPayload(parsed, depth),
            }
          : {
              ...baseMeta,
              body: parsed,
            };

        return {
          isError: !res.ok,
          content: [
            {
              type: 'text',
              text: JSON.stringify(payload, null, 2),
            },
          ],
        };
      } catch (err) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  error: err instanceof Error ? err.message : String(err),
                  ticker: code,
                },
                null,
                2
              ),
            },
          ],
        };
      }
    }
  );
}
