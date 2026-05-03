import { z } from 'zod';
import { RUNNING_TRADE_URL } from '../shared/config.js';
import { BROWSERISH_GET_HEADERS } from '../shared/http.js';
import { resolveToken } from '../shared/token.js';

function toNum(v) {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeTradeRow(row) {
  if (row == null || typeof row !== 'object') return row;
  return {
    id: row.id != null ? String(row.id) : null,
    time: row.time ?? null,
    action: row.action ?? null,
    code: row.code ?? null,
    price: toNum(row.price),
    change: row.change === '' || row.change == null ? null : String(row.change),
    lot: toNum(row.lot),
    isBrokerExists: row.is_broker_exists ?? null,
    buyer: row.buyer ?? null,
    seller: row.seller ?? null,
    tradeNumber: row.trade_number != null ? String(row.trade_number) : null,
    buyerType: row.buyer_type ?? null,
    sellerType: row.seller_type ?? null,
    marketBoard: row.market_board ?? null,
    buyOrderNumber:
      row.buy_order_number != null ? String(row.buy_order_number) : null,
    sellOrderNumber:
      row.sell_order_number != null ? String(row.sell_order_number) : null,
  };
}

function buildCompactPayload(parsed) {
  const d = parsed && typeof parsed === 'object' ? parsed.data : null;
  if (!d || typeof d !== 'object') {
    return {
      message: parsed?.message,
      rawShape: 'unknown',
      note: 'tidak ada parsed.data',
    };
  }

  const rt = Array.isArray(d.running_trade) ? d.running_trade : [];

  return {
    message: parsed.message,
    meta: {
      isOpenMarket: d.is_open_market ?? null,
      date: d.date ?? null,
      isShowBs: d.is_show_bs ?? null,
      breakTimeLeftSeconds: d.break_time_left_seconds ?? null,
    },
    runningTrade: rt.map(normalizeTradeRow),
    runningTradeCount: rt.length,
  };
}

function buildRunningTradeUrl({ sort, limit, orderBy, ticker }) {
  const base = RUNNING_TRADE_URL.replace(/\/$/, '');
  const params = new URLSearchParams();
  params.set('sort', sort);
  params.set('limit', String(limit));
  params.set('order_by', orderBy);
  params.append('symbols[]', ticker);
  return `${base}?${params.toString()}`;
}

export function registerStockbitGetRunningTrade(mcpServer) {
  mcpServer.registerTool(
    'stockbit_get_running_trade',
    {
      description: `GET running trade exodus Stockbit (GET /order-trade/running-trade).

Query: sort, limit, order_by, symbols[] (satu kode). Respons umum: { message, data: { is_open_market, date, running_trade: [{ time, action, code, price, lot, buyer, seller, buyer_type, seller_type, market_board, ... }], ... } }.

compact=true: meta + running_trade dengan field snake_case jadi camelCase dan price/lot number. false/omit: body API mentah di field body.`,
      inputSchema: {
        ticker: z
          .string()
          .describe(
            'Kode saham (symbols[]). Dinormalisasi ke huruf besar, mis. IPCM, BBCA.'
          ),
        sort: z
          .enum(['ASC', 'DESC'])
          .optional()
          .describe('Urutan waktu. Default DESC (terbaru dulu, seperti web).'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(200)
          .optional()
          .describe('Jumlah baris maks. Default 50.'),
        order_by: z
          .string()
          .optional()
          .describe(
            'Default RUNNING_TRADE_ORDER_BY_TIME. Hanya ubah jika API Stockbit support nilai lain.'
          ),
        compact: z
          .boolean()
          .optional()
          .describe(
            'true: meta + running_trade dinormalisasi (hemat noise). false: respons penuh di body.'
          ),
        stockbit_token: z
          .string()
          .optional()
          .describe(
            'Opsional. Override token; kosongkan agar pakai STOCKBIT_TOKEN dari env MCP.'
          ),
      },
    },
    async ({
      ticker,
      sort: sortRaw,
      limit: limitRaw,
      order_by: orderByRaw,
      compact,
      stockbit_token: tokenOverride,
    }) => {
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

      const sort = sortRaw ?? 'DESC';
      const limit = limitRaw ?? 50;
      const orderBy = orderByRaw ?? 'RUNNING_TRADE_ORDER_BY_TIME';
      const useCompact = compact === true;

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

      const url = buildRunningTradeUrl({
        sort,
        limit,
        orderBy,
        ticker: code,
      });

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

        const baseMeta = {
          url,
          ticker: code,
          query: { sort, limit, order_by: orderBy },
          status: res.status,
          ok: res.ok,
        };

        const payload = useCompact
          ? {
              ...baseMeta,
              compact: true,
              ...buildCompactPayload(parsed),
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
