import { z } from 'zod';

// urutan key seperti body JSON Postman (field lain tetap disisipkan di akhir)
const POSTMAN_BODY_KEY_ORDER = [
  'name',
  'description',
  'save',
  'ordertype',
  'ordercol',
  'page',
  'universe',
  'filters',
  'sequence',
  'screenerid',
  'type',
];

const SCREENER_OPERATOR_SYMBOLS = ['>=', '<=', '>', '<', '='];

const screenerFilterRuleSchema = z.object({
  type: z
    .string()
    .describe(
      'jenis rule, umumnya "compare" (bandingkan dua metrik) atau "basic" (metrik vs nilai tetap)'
    ),
  item1: z
    .union([z.number(), z.string()])
    .describe(
      'ID metrik item1 — pakai angka dari stockbit_get_screener_metric_ids atau resource stockbit://docs/screener-metric-ids (jangan tebak).'
    ),
  item1name: z
    .string()
    .optional()
    .describe('Sama seperti label di daftar metrik (mis. "Market Cap" untuk 2892).'),
  operator: z
    .enum(['>=', '<=', '>', '<', '='])
    .describe(
      'WAJIB salah satu simbol persis ini saja: ">=", "<=", ">", "<", "=". Jangan teks bahasa Inggris (less_than, between, gte). Range angka = dua rule terpisah pada item1 yang sama (mis. satu dengan ">=", satu dengan "<=").'
    ),
  item2: z
    .union([z.string(), z.number()])
    .optional()
    .describe(
      'nilai atau ID metrik; di payload HTTP Stockbit diserialisasi sebagai string angka, mis. "10"'
    ),
  item2name: z
    .string()
    .optional()
    .describe('label item2, boleh dikosongkan (default "")'),
  multiplier: z
    .string()
    .optional()
    .describe('string, boleh dikosongkan (default "0")'),
});

function splitOperatorAndItem2(operator, item2) {
  const rawOperator = String(operator ?? '').trim();
  if (item2 !== undefined && item2 !== null && item2 !== '') {
    return {
      operator: rawOperator,
      item2: String(item2),
    };
  }

  const match = rawOperator.match(/^(>=|<=|>|<|=)\s*(-?\d+(?:\.\d+)?)$/);
  if (!match) {
    return {
      operator: rawOperator,
      item2: '',
    };
  }

  return {
    operator: match[1],
    item2: match[2],
  };
}

function normalizeFilterAliases(rule) {
  if (!rule || typeof rule !== 'object') return rule;
  const out = { ...rule };
  if (out.item1name == null && out.item1_name != null) out.item1name = out.item1_name;
  if (out.item2name == null && out.item2_name != null) out.item2name = out.item2_name;
  delete out.item1_name;
  delete out.item2_name;
  return out;
}

const universeObjectSchema = z.object({
  scope: z
    .string()
    .describe('kode universe, mis. "IHSG" untuk indeks utama'),
  scopeID: z.string().describe('ID scope, mis. "0"'),
  name: z.string().describe('nama tampilan universe, mis. "IHSG"'),
});

export const stockbitScreenerBodySchema = z
  .object({
    name: z.string().describe('nama template screener'),
    description: z.string().describe('deskripsi singkat'),
    save: z
      .string()
      .describe('flag simpan sebagai string, contoh "0"'),
    ordertype: z
      .string()
      .describe('Sort direction: "ASC" or "DESC" (Stockbit API). Not sort_by.order.'),
    ordercol: z
      .number()
      .describe(
        '1-based column index matching the order of metric ids in "sequence" (first id = 1). Do not send sort_by — use ordercol + ordertype.'
      ),
    page: z.number().describe('nomor halaman hasil (integer, mulai 1)'),
    universe: z
      .union([
        universeObjectSchema.describe(
          'DISARANKAN untuk LLM: object { scope, scopeID, name }. Sebelum HTTP, server jadi string JSON persis Postman.'
        ),
        z
          .string()
          .describe(
            'Format wire HTTP: satu string yang isinya JSON object universe (bukan nested object di JSON tool).'
          ),
      ])
      .optional()
      .describe(
        'Stockbit wire: STRING. Di tool MCP boleh object — server konversi. Kosong = default IHSG (scope IHSG, scopeID "0").'
      ),
    filters: z
      .union([
        z
          .array(screenerFilterRuleSchema)
          .describe(
            'DISARANKAN: array object rules. Server normalisasi lalu jadi string JSON array seperti Postman.'
          ),
        z
          .string()
          .describe(
            'Format wire HTTP: satu string yang isinya JSON array of rules (kopas dari DevTools/Postman).'
          ),
      ])
      .describe(
        'Stockbit wire: STRING. Di tool MCP boleh array — server konversi. Hasil akhir sama dengan \"filters\":\"[{\\\"type\\\":\\\"basic\\\",...}]\" di curl.'
      ),
    sequence: z
      .string()
      .describe(
        'daftar ID metrik dipisah koma (urutan kolom), mis. "3068,2892,1486,..."'
      ),
    screenerid: z.string().describe('ID template, custom baru biasanya "0"'),
    type: z
      .string()
      .describe('jenis template, custom: "TEMPLATE_TYPE_CUSTOM"'),
  })
  .passthrough();

function normalizeFilterRule(rule) {
  if (!rule || typeof rule !== 'object') {
    throw new Error('setiap filter harus object');
  }
  const r = normalizeFilterAliases(rule);
  const item1 = Number(r.item1);
  if (Number.isNaN(item1)) {
    throw new Error(`item1 filter tidak angka valid: ${r.item1}`);
  }
  const opRaw = String(r.operator ?? '').trim();
  const allowed = new Set(SCREENER_OPERATOR_SYMBOLS);
  if (!allowed.has(opRaw)) {
    throw new Error(
      `operator harus simbol Stockbit saja: ${SCREENER_OPERATOR_SYMBOLS.join(', ')} — bukan teks (dapat: ${JSON.stringify(opRaw)})`
    );
  }
  const parsedRule = splitOperatorAndItem2(opRaw, r.item2);
  return {
    type: String(r.type ?? ''),
    item1,
    item1name: String(r.item1name ?? ''),
    operator: parsedRule.operator,
    item2: parsedRule.item2,
    item2name: String(r.item2name ?? ''),
    multiplier: String(r.multiplier ?? '0'),
  };
}

function deriveSequenceFromFiltersLocal(filters) {
  if (!Array.isArray(filters)) return '';
  const ids = [];
  const seen = new Set();
  for (const rule of filters) {
    if (!rule || typeof rule !== 'object') continue;
    const item1 = rule.item1;
    if (item1 === undefined || item1 === null) continue;
    const id = String(item1).trim();
    if (id && !seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  return ids.join(',');
}

/** Bukan field API Stockbit; dipetakan ke ordercol + ordertype. */
function applySortByToBodyLocal(out) {
  const sbRaw = out.sort_by ?? out.sortBy;
  delete out.sort_by;
  delete out.sortBy;
  if (!sbRaw || typeof sbRaw !== 'object' || Array.isArray(sbRaw)) return;
  const orderRaw = sbRaw.order ?? sbRaw.direction;
  if (orderRaw != null && String(orderRaw).trim() !== '') {
    out.ordertype = String(orderRaw).trim();
  }
  const fieldVal = sbRaw.field ?? sbRaw.metric_id ?? sbRaw.metricId ?? sbRaw.item1 ?? sbRaw.column;
  if (fieldVal == null) return;
  const fieldStr = String(fieldVal).trim();
  if (!fieldStr) return;
  const seqStr =
    typeof out.sequence === 'string' && out.sequence.trim()
      ? out.sequence.trim()
      : deriveSequenceFromFiltersLocal(Array.isArray(out.filters) ? out.filters : []);
  const parts = seqStr.split(',').map((s) => s.trim()).filter(Boolean);
  const idx = parts.findIndex((p) => String(p).trim() === fieldStr);
  if (idx >= 0) {
    out.ordercol = idx + 1;
    return;
  }
  const asNum = Number.parseInt(fieldStr, 10);
  const digitsOnly = /^\d+$/.test(fieldStr);
  const likelyMetricId = digitsOnly && fieldStr.length >= 4;
  if (!likelyMetricId && Number.isFinite(asNum) && asNum >= 0 && asNum <= 99) {
    out.ordercol = asNum;
  }
}

function normalizeUniverseString(universe) {
  if (universe == null) throw new Error('universe wajib ada');
  if (typeof universe === 'object') {
    return JSON.stringify(universe);
  }
  if (typeof universe === 'string') {
    try {
      return JSON.stringify(JSON.parse(universe));
    } catch (e) {
      throw new Error(
        `universe string bukan JSON valid: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }
  throw new Error('universe harus object atau string JSON');
}

function normalizeFiltersString(filters) {
  if (filters == null) throw new Error('filters wajib ada');
  let rules;
  if (typeof filters === 'string') {
    try {
      rules = JSON.parse(filters);
    } catch (e) {
      throw new Error(
        `filters string bukan JSON valid (seringnya kutip/escape rusak dari LLM): ${e instanceof Error ? e.message : String(e)}`
      );
    }
  } else if (Array.isArray(filters)) {
    rules = filters;
  } else {
    throw new Error('filters harus string JSON array atau array');
  }
  if (!Array.isArray(rules)) {
    throw new Error('filters setelah parse harus berupa array');
  }
  const normalized = rules.map((r, i) => {
    try {
      return normalizeFilterRule(r);
    } catch (e) {
      throw new Error(
        `filters[${i}]: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  });
  return JSON.stringify(normalized);
}

function orderBodyKeysLikePostman(body) {
  const out = {};
  const seen = new Set();
  for (const k of POSTMAN_BODY_KEY_ORDER) {
    if (Object.hasOwn(body, k)) {
      out[k] = body[k];
      seen.add(k);
    }
  }
  for (const k of Object.keys(body)) {
    if (!seen.has(k)) {
      out[k] = body[k];
    }
  }
  return out;
}

const DEFAULT_SCREENER_UNIVERSE_OBJECT = {
  scope: 'IHSG',
  scopeID: '0',
  name: 'IHSG',
};

export function buildStockbitWireBody(body) {
  const out = { ...body };
  applySortByToBodyLocal(out);
  if (
    out.universe === undefined ||
    out.universe === null ||
    out.universe === '' ||
    (typeof out.universe === 'string' && out.universe.trim() === '')
  ) {
    out.universe = DEFAULT_SCREENER_UNIVERSE_OBJECT;
  }
  out.universe = normalizeUniverseString(out.universe);
  out.filters = normalizeFiltersString(out.filters);
  return orderBodyKeysLikePostman(out);
}
