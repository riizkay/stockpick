import { z } from 'zod';
import { CHART_DAILY_URL_BASE } from '../shared/config.js';
import { BROWSERISH_GET_HEADERS } from '../shared/http.js';
import { resolveToken } from '../shared/token.js';
import { summarizeFromStockbitPrices } from '../lib/chart-summarize.js';

function buildChartDailyUrl(ticker, timeframe) {
  const base = CHART_DAILY_URL_BASE.replace(/\/$/, '');
  const q = new URLSearchParams({ timeframe: String(timeframe) });
  return `${base}/${encodeURIComponent(ticker)}/daily?${q}`;
}

export function registerStockbitGetChartSummary(mcpServer) {
  mcpServer.registerTool(
    'stockbit_get_chart_summary',
    {
      description: `GET chart harian Stockbit (.../charts/{ticker}/daily?timeframe=). Respons JSON pakai nama field jelas: overall.trend uptrend|downtrend|sideways, overall.return_pct, overall.volatility low|medium|high, segments[].trend up|down|sideways, key_events[].type spike|drop|recovery. Field how_to_read menjelaskan segments, trend_changes_segment_index, key_events. raw=true menyertakan body API penuh.`,
      inputSchema: {
        ticker: z
          .string()
          .describe('Kode saham, mis. BBCA (uppercase).'),
        timeframe: z
          .string()
          .optional()
          .describe(
            'Mis. 3m,6m,1y,3y,5y. Default 3y.'
          ),
        seg_min: z
          .number()
          .int()
          .min(4)
          .max(20)
          .optional()
          .describe('Batas bawah jumlah segmen PAA (default 10).'),
        seg_max: z
          .number()
          .int()
          .min(10)
          .max(40)
          .optional()
          .describe('Batas atas jumlah segmen (default 20).'),
        raw: z
          .boolean()
          .optional()
          .describe('true: sertakan body API penuh di field raw.'),
        stockbit_token: z.string().optional().describe('Override token; else env.'),
      },
    },
    async ({
      ticker,
      timeframe,
      seg_min: segMin,
      seg_max: segMax,
      raw,
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
              text: JSON.stringify({ err: 'ticker wajib' }),
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
              text: JSON.stringify({
                err: 'Set STOCKBIT_TOKEN pada env MCP.',
              }),
            },
          ],
        };
      }

      const tf = (timeframe && String(timeframe).trim()) || '3y';
      const url = buildChartDailyUrl(code, tf);
      const sumOpts = {};
      if (segMin != null) sumOpts.segMin = segMin;
      if (segMax != null) sumOpts.segMax = segMax;

      try {
        const res = await fetch(url, {
          method: 'GET',
          headers: {
            ...BROWSERISH_GET_HEADERS,
            Authorization: `Bearer ${token}`,
          },
        });

        const rawText = await res.text();
        let parsed;
        try {
          parsed = JSON.parse(rawText);
        } catch {
          parsed = rawText;
        }

        const prices =
          parsed &&
          typeof parsed === 'object' &&
          parsed.data &&
          Array.isArray(parsed.data.prices)
            ? parsed.data.prices
            : [];

        const sum = summarizeFromStockbitPrices(prices, sumOpts);
        const payload = {
          ticker: code,
          timeframe: tf,
          http_status: res.status,
          api_ok: res.ok,
          ...sum,
        };
        if (typeof parsed === 'object' && parsed?.message) {
          payload.api_message = String(parsed.message);
        }

        if (raw === true && typeof parsed === 'object') {
          payload.raw = parsed;
        }

        return {
          isError: !res.ok,
          content: [
            {
              type: 'text',
              text: JSON.stringify(payload),
            },
          ],
        };
      } catch (err) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                err: err instanceof Error ? err.message : String(err),
                ticker: code,
                timeframe: tf,
              }),
            },
          ],
        };
      }
    }
  );
}
