import { z } from 'zod';
import { KEYSTATS_RATIO_URL_BASE } from '../shared/config.js';
import { BROWSERISH_GET_HEADERS } from '../shared/http.js';
import { resolveToken } from '../shared/token.js';

function buildKeystatsUrl({ ticker, yearLimit }) {
  const base = KEYSTATS_RATIO_URL_BASE.replace(/\/$/, '');
  const path = `${base}/${encodeURIComponent(ticker)}`;
  const params = new URLSearchParams();
  params.set('year_limit', String(yearLimit));
  return `${path}?${params.toString()}`;
}

// closure: tiap section -> { s: nama section, r: [ [id, nama metrik, nilai], ... ] }
function compactClosureResults(closure) {
  if (!Array.isArray(closure)) return null;
  return closure.map((block) => {
    const s = block?.keystats_name ?? '';
    const fin = block?.fin_name_results;
    const r = [];
    if (Array.isArray(fin)) {
      for (const item of fin) {
        const f = item?.fitem;
        if (f && typeof f === 'object') {
          r.push([f.id, f.name, f.value]);
        }
      }
    }
    return { s, r };
  });
}

function compactDividendGroup(dg) {
  if (!dg || typeof dg !== 'object') return null;
  const vals = dg.dividend_year_values;
  if (!Array.isArray(vals)) return null;
  return vals.map((x) => ({
    y: x.period,
    d: x.dividend,
    ex: x.ex_date,
    pay: x.payment_date,
  }));
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

  const info = d.info;
  const hasInfo = typeof info === 'string' && info.trim() !== '';

  return {
    message: parsed.message,
    data: {
      c: compactClosureResults(d.closure_fin_items_results),
      stats: d.stats ?? null,
      ...(hasInfo ? { info } : {}),
      div: compactDividendGroup(d.dividend_group),
      fx: d.financial_report_currency ?? null,
    },
    note:
      'c=closure (s=section, r=baris [id,nama,nilai]); div=dividen; fx=mata uang laporan. financial_year_parent skip; compact=false untuk body penuh.',
  };
}

export function registerStockbitGetKeystats(mcpServer) {
  mcpServer.registerTool(
    'stockbit_get_keystats',
    {
      description: `GET keystats ratio Stockbit (GET .../keystats/ratio/v1/{ticker}?year_limit=).
YearLimit must be one of [0, 3, 10].
compact=true: data ringkas hemat token — data.c = [{ s: nama grup, r: [[id, nama, nilai], ...] }], data.stats, data.div (dividen), data.fx. Tanpa financial_year_parent / USD duplicate.
compact=false: body API utuh di field body.`,
      inputSchema: {
        ticker: z
          .string()
          .describe(
            'Kode saham Indonesia, mis. BBCA, TLKM (dinormalisasi ke huruf besar).'
          ),
        year_limit: z
          .number()
          .int()
          .min(1)
          .max(30)
          .optional()
          .describe('Jumlah tahun riwayat di API. Default 10.'),
        compact: z
          .boolean()
          .optional()
          .describe(
            'true: struktur dipadatkan (kunci singkat, satu baris JSON). false: body lengkap.'
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
      year_limit: yearLimitRaw,
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

      const yearLimit = yearLimitRaw ?? 10;
      const useCompact = compact === true;
      const url = buildKeystatsUrl({ ticker: code, yearLimit });

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

        const baseMetaURL = {
          url,
          ticker: code,
          status: res.status,
          ok: res.ok,
          query: { year_limit: yearLimit },
        };

        const payload = useCompact
          ? {
              ...baseMetaURL,
              compact: true,
              ...buildCompactPayload(parsed),
            }
          : {
              ...baseMetaURL,
              body: parsed,
            };

        const text = useCompact
          ? JSON.stringify(payload)
          : JSON.stringify(payload, null, 2);

        return {
          isError: !res.ok,
          content: [
            {
              type: 'text',
              text,
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
