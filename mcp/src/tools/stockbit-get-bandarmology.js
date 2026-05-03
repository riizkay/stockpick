import { z } from 'zod';
import { MARKET_DETECTORS_URL_BASE } from '../shared/config.js';
import { BROWSERISH_GET_HEADERS } from '../shared/http.js';
import { resolveToken } from '../shared/token.js';

function buildMarketDetectorsUrl({
  ticker,
  transactionType,
  marketBoard,
  investorType,
  limit,
}) {
  const base = MARKET_DETECTORS_URL_BASE.replace(/\/$/, '');
  const path = `${base}/${encodeURIComponent(ticker)}`;
  const params = new URLSearchParams();
  params.set('transaction_type', transactionType);
  params.set('market_board', marketBoard);
  params.set('investor_type', investorType);
  params.set('limit', String(limit));
  return `${path}?${params.toString()}`;
}

function buildCompactPayload(parsed, brokerDepth) {
  const d = parsed && typeof parsed === 'object' ? parsed.data : null;
  if (!d || typeof d !== 'object') {
    return {
      message: parsed?.message,
      rawShape: 'unknown',
      note: 'tidak ada parsed.data',
    };
  }

  const bs = d.broker_summary && typeof d.broker_summary === 'object'
    ? d.broker_summary
    : null;
  const buys = bs && Array.isArray(bs.brokers_buy) ? bs.brokers_buy : [];
  const sells = bs && Array.isArray(bs.brokers_sell) ? bs.brokers_sell : [];
  const depth = Math.max(0, brokerDepth);

  return {
    message: parsed.message,
    from: d.from ?? null,
    to: d.to ?? null,
    bandar_detector: d.bandar_detector ?? null,
    broker_summary: bs
      ? {
          symbol: bs.symbol ?? null,
          brokers_buy: buys.slice(0, depth),
          brokers_sell: sells.slice(0, depth),
          brokers_buy_total: buys.length,
          brokers_sell_total: sells.length,
          broker_depth_applied: depth,
        }
      : null,
  };
}

export function registerStockbitGetBandarmology(mcpServer) {
  mcpServer.registerTool(
    'stockbit_get_bandarmology',
    {
      description: `GET bandarmology / market detector Stockbit (GET .../marketdetectors/{ticker}).

Query: transaction_type, market_board, investor_type, limit. Respons umum: { message, data: { bandar_detector, broker_summary: { brokers_buy[], brokers_sell[], symbol }, from, to } }.

compact=true: bandar_detector + broker_summary dengan daftar broker dipotong (broker_depth). false/omit: body API penuh di field body.`,
      inputSchema: {
        ticker: z
          .string()
          .describe(
            'Kode saham Indonesia, mis. IPCM, BBCA (dinormalisasi ke huruf besar).'
          ),
        transaction_type: z
          .string()
          .optional()
          .describe(
            'Default TRANSACTION_TYPE_NET. Nilai lain mengikuti API Stockbit jika tersedia.'
          ),
        market_board: z
          .string()
          .optional()
          .describe('Default MARKET_BOARD_REGULER.'),
        investor_type: z
          .string()
          .optional()
          .describe('Default INVESTOR_TYPE_ALL.'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe('Query limit (API). Default 25.'),
        compact: z
          .boolean()
          .optional()
          .describe(
            'true: keluaran ringkas (bandar_detector + broker dipotong). false: body API penuh.'
          ),
        broker_depth: z
          .number()
          .int()
          .min(0)
          .max(50)
          .optional()
          .describe(
            'Saat compact=true: maks baris brokers_buy dan brokers_sell. Default 25.'
          ),
        stockbit_token: z
          .string()
          .optional()
          .describe(
            'Opsional. Override token; kosongkan untuk STOCKBIT_TOKEN dari env MCP.'
          ),
      },
    },
    async ({
      ticker,
      transaction_type: transactionTypeRaw,
      market_board: marketBoardRaw,
      investor_type: investorTypeRaw,
      limit: limitRaw,
      compact,
      broker_depth: brokerDepthRaw,
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

      const transactionType =
        transactionTypeRaw?.trim() || 'TRANSACTION_TYPE_NET';
      const marketBoard = marketBoardRaw?.trim() || 'MARKET_BOARD_REGULER';
      const investorType = investorTypeRaw?.trim() || 'INVESTOR_TYPE_ALL';
      const limit = limitRaw ?? 25;
      const useCompact = compact === true;
      const brokerDepth = brokerDepthRaw ?? 25;

      const url = buildMarketDetectorsUrl({
        ticker: code,
        transactionType,
        marketBoard,
        investorType,
        limit,
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
          status: res.status,
          ok: res.ok,
          query: {
            transaction_type: transactionType,
            market_board: marketBoard,
            investor_type: investorType,
            limit,
          },
        };

        const payload = useCompact
          ? {
              ...baseMeta,
              compact: true,
              ...buildCompactPayload(parsed, brokerDepth),
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
