import { z } from 'zod';
import { SCREENER_URL, DEFAULT_STOCKBIT_SCREENER_BODY } from '../shared/config.js';
import { BROWSERISH_HEADERS } from '../shared/http.js';
import { resolveToken } from '../shared/token.js';
import {
  buildStockbitWireBody,
  stockbitScreenerBodySchema,
} from '../screener/wire.js';

const TOOL_DESCRIPTION = `POST https://exodus.stockbit.com/screener/templates (Bearer). Token comes from env STOCKBIT_TOKEN; you can omit stockbit_token.

Before filling filters: call stockbit_get_screener_metric_ids. Wrong metric IDs yield empty results or API errors.

If body is omitted, the tool uses the default "Cash Rich" template (filters and sequence as on Stockbit).

REQUIRED (model / LLM): In every body.filters entry, "operator" must be exactly one of these symbol strings: ">=", "<=", ">", "<", "=". Do not use English words (e.g. less_than, gte, between). For a numeric range on the same metric, use TWO separate filter objects (e.g. one with ">=" and item2 as the lower bound, one with "<=" and item2 as the upper bound).

Sorting: Stockbit expects "ordercol" (number, 1-based index into the "sequence" column list) and "ordertype" ("ASC" | "DESC"). Do not send "sort_by". Include every sort metric id in "sequence" in left-to-right column order so ordercol matches the intended column.

FORMAT NOTES:
- In the browser/Postman JSON body, "universe" and "filters" are STRING fields (JSON text inside each string).
- In this tool you may send the convenient shape: "universe" as an object {scope, scopeID, name} and "filters" as an array of objects. The server converts them to the same STRING wire format as Postman before the request.

Each filter's item2 in wire is always a string (number or metric id like "2892"). Numeric values from the LLM are coerced to strings.

Use filters as a single string only when it is valid JSON for JSON.parse; if not, use an array instead.`;

export function registerStockbitRunScreener(mcpServer) {
  mcpServer.registerTool(
    'stockbit_run_screener',
    {
      description: TOOL_DESCRIPTION,
      inputSchema: {
        body: stockbitScreenerBodySchema
          .optional()
          .describe(
            'Payload POST /screener/templates. Kosongkan/unset = pakai default template Cash Rich di server.'
          ),
        stockbit_token: z
          .string()
          .optional()
          .describe(
            'Opsional. Hanya isi jika override token. Kosongkan key ini agar pakai STOCKBIT_TOKEN dari env MCP (hindari "").'
          ),
      },
    },
    async ({ body, stockbit_token: tokenOverride }) => {
      const effectiveBody =
        body != null
          ? body
          : structuredClone(DEFAULT_STOCKBIT_SCREENER_BODY);
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
                    'Token tidak ada. Set STOCKBIT_TOKEN pada konfigurasi MCP server (env). Jangan mengandalkan stockbit_token kosong.',
                },
                null,
                2
              ),
            },
          ],
        };
      }

      let wireBody;
      try {
        wireBody = buildStockbitWireBody(effectiveBody);
      } catch (e) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  error: 'validasi/normalisasi body gagal',
                  detail: e instanceof Error ? e.message : String(e),
                },
                null,
                2
              ),
            },
          ],
        };
      }

      try {
        const res = await fetch(SCREENER_URL, {
          method: 'POST',
          headers: {
            ...BROWSERISH_HEADERS,
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(wireBody),
        });

        const raw = await res.text();
        let parsed;
        try {
          parsed = JSON.parse(raw);
        } catch {
          parsed = raw;
        }

        const payload = { status: res.status, ok: res.ok, body: parsed };

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
