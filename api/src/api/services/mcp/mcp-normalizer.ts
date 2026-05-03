/** Samakan payload dengan Postman: MCP wire pakai operator (bukan compare) dan universe IHSG untuk IDX umum. */
const DEFAULT_IDX_UNIVERSE = { scope: "IHSG", scopeID: "0", name: "IHSG" } as const;

const SCREENER_OPERATOR_SYMBOLS_API = new Set([">=", "<=", ">", "<", "="]);

export const STOCKBIT_SCREENER_BODY_KEYS = new Set([
  "name",
  "description",
  "save",
  "ordertype",
  "ordercol",
  "page",
  "universe",
  "filters",
  "sequence",
  "screenerid",
  "type",
  "sort_by",
  "sortBy",
]);

function applyFilterFieldAliases(r: Record<string, unknown>): Record<string, unknown> {
  const out = { ...r };
  if (out.item1name == null && out.item1_name != null) out.item1name = out.item1_name;
  if (out.item2name == null && out.item2_name != null) out.item2name = out.item2_name;
  delete out.item1_name;
  delete out.item2_name;
  return out;
}

function finalizeOneScreenerFilterRule(rule: Record<string, unknown>): Record<string, unknown> {
  const out = applyFilterFieldAliases({ ...rule });
  const op = out.operator;
  const opStr = typeof op === "string" ? op.trim() : "";
  if (!opStr) {
    const cmp = out.compare;
    if (typeof cmp === "string" && cmp.trim()) out.operator = cmp.trim();
    else if (typeof cmp === "number") out.operator = String(cmp);
  }
  delete out.compare;
  if (out.type == null || out.type === "") out.type = "basic";
  if (out.multiplier == null || out.multiplier === "") out.multiplier = "0";
  const finalOp = typeof out.operator === "string" ? out.operator.trim() : "";
  if (!SCREENER_OPERATOR_SYMBOLS_API.has(finalOp)) {
    throw new Error(
      `filter operator harus simbol Stockbit saja: >=, <=, >, <, = — bukan teks (dapat: ${JSON.stringify(finalOp)}). Range = dua filter terpisah pada item1 yang sama.`
    );
  }
  out.operator = finalOp;
  return out;
}

function normalizeScreenerBodyFilters(filters: unknown): unknown {
  if (!Array.isArray(filters)) return filters;
  return filters.map((rule) => {
    if (!rule || typeof rule !== "object" || Array.isArray(rule)) return rule;
    return finalizeOneScreenerFilterRule(rule as Record<string, unknown>);
  });
}

function universeLooksLikeBadIdxExchange(u: Record<string, unknown>): boolean {
  const scope = String(u.scope ?? "").toLowerCase();
  const name = String(u.name ?? "").toUpperCase();
  const sid = u.scopeID;
  return scope === "exchange" || name === "IDX" || sid === 1 || sid === "1";
}

function coerceMcpSaveString(val: unknown): string {
  if (val === true || val === "true" || val === 1 || val === "1") return "1";
  if (val === false || val === "false" || val === 0 || val === "0") return "0";
  if (typeof val === "string" && val.trim() !== "") return val;
  return "0";
}

function coerceMcpOrdercolNumber(val: unknown): number {
  if (typeof val === "number" && Number.isFinite(val)) return Math.trunc(val);
  if (typeof val === "string") {
    const n = Number.parseInt(val.trim(), 10);
    if (Number.isFinite(n)) return n;
  }
  return 3;
}

function deriveSequenceFromFilters(filters: unknown): string {
  if (!Array.isArray(filters)) return "";
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const rule of filters) {
    if (!rule || typeof rule !== "object" || Array.isArray(rule)) continue;
    const item1 = (rule as Record<string, unknown>).item1;
    if (item1 === undefined || item1 === null) continue;
    const id = String(item1).trim();
    if (id && !seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  return ids.join(",");
}

function coerceMcpSequenceString(val: unknown, filters: unknown): string {
  if (typeof val === "string" && val.trim() !== "") return val.trim();
  if (Array.isArray(val) && val.length > 0) {
    return val.map((x) => String(x).trim()).filter(Boolean).join(",");
  }
  return deriveSequenceFromFilters(filters);
}

function coerceMcpPageNumber(val: unknown): number {
  let p = 1;
  if (typeof val === "number" && Number.isFinite(val)) p = Math.trunc(val);
  else if (typeof val === "string") {
    const n = Number.parseInt(val.trim(), 10);
    if (Number.isFinite(n)) p = n;
  }
  return p < 1 ? 1 : p;
}

function coerceMcpOrdertype(val: unknown): string {
  const s = String(val ?? "").trim().toUpperCase();
  return s === "ASC" || s === "DESC" ? s : "DESC";
}

function coerceMcpScreenerid(val: unknown): string {
  const s = String(val ?? "").trim();
  const lower = s.toLowerCase();
  if (s === "" || lower === "undefined" || lower === "null") return "0";
  return s;
}

function coerceMcpTemplateType(val: unknown): string {
  const s = String(val ?? "").trim();
  if (s === "TEMPLATE_TYPE_CUSTOM") return s;
  return "TEMPLATE_TYPE_CUSTOM";
}

function normalizeUniverseStrings(u: Record<string, unknown>): Record<string, unknown> {
  return {
    ...u,
    scope: String(u.scope ?? ""),
    scopeID: String(u.scopeID ?? ""),
    name: String(u.name ?? ""),
  };
}

function applySortByToOrderFields(nextBody: Record<string, unknown>): void {
  const sbRaw = nextBody.sort_by ?? nextBody.sortBy;
  delete nextBody.sort_by;
  delete nextBody.sortBy;
  if (!sbRaw || typeof sbRaw !== "object" || Array.isArray(sbRaw)) return;
  const sb = sbRaw as Record<string, unknown>;
  const orderRaw = sb.order ?? sb.direction;
  if (orderRaw !== undefined && orderRaw !== null && String(orderRaw).trim() !== "") {
    nextBody.ordertype = orderRaw;
  }
  const fieldVal = sb.field ?? sb.metric_id ?? sb.metricId ?? sb.item1 ?? sb.column;
  if (fieldVal === undefined || fieldVal === null) return;
  const fieldStr = String(fieldVal).trim();
  if (fieldStr === "") return;
  const seqStr = coerceMcpSequenceString(nextBody.sequence, nextBody.filters);
  const parts = seqStr.split(",").map((s) => s.trim()).filter(Boolean);
  const idx = parts.findIndex((p) => String(p).trim() === fieldStr);
  if (idx >= 0) {
    nextBody.ordercol = idx + 1;
    return;
  }
  const asNum = Number.parseInt(fieldStr, 10);
  const digitsOnly = /^\d+$/.test(fieldStr);
  const likelyMetricId = digitsOnly && fieldStr.length >= 4;
  if (!likelyMetricId && Number.isFinite(asNum) && asNum >= 0 && asNum <= 99) {
    nextBody.ordercol = asNum;
  }
}

function coerceStockbitRunScreenerBody(b: Record<string, unknown>): Record<string, unknown> {
  const nextBody = { ...b };
  if (
    nextBody.universe === undefined ||
    nextBody.universe === null ||
    (typeof nextBody.universe === "string" && nextBody.universe.trim() === "")
  ) {
    nextBody.universe = { ...DEFAULT_IDX_UNIVERSE };
  }
  if (nextBody.universe && typeof nextBody.universe === "object" && !Array.isArray(nextBody.universe)) {
    let u = nextBody.universe as Record<string, unknown>;
    if (universeLooksLikeBadIdxExchange(u)) {
      u = { ...DEFAULT_IDX_UNIVERSE };
    }
    nextBody.universe = normalizeUniverseStrings(u);
  }
  if (nextBody.filters !== undefined) {
    nextBody.filters = normalizeScreenerBodyFilters(nextBody.filters);
  }
  nextBody.sequence = coerceMcpSequenceString(nextBody.sequence, nextBody.filters);
  applySortByToOrderFields(nextBody);
  nextBody.save = coerceMcpSaveString(nextBody.save);
  nextBody.ordercol = coerceMcpOrdercolNumber(nextBody.ordercol);
  nextBody.page = coerceMcpPageNumber(nextBody.page);
  nextBody.ordertype = coerceMcpOrdertype(nextBody.ordertype);
  nextBody.screenerid = coerceMcpScreenerid(nextBody.screenerid);
  nextBody.type = coerceMcpTemplateType(nextBody.type);
  if (typeof nextBody.name !== "string" || nextBody.name.trim() === "") {
    nextBody.name = "Custom screener";
  }
  if (typeof nextBody.description !== "string") {
    nextBody.description = "";
  }
  return nextBody;
}

export function normalizeMcpToolArguments(
  name: string,
  args: Record<string, unknown>
): Record<string, unknown> {
  if (name !== "stockbit_run_screener") return args;

  const out: Record<string, unknown> = {};
  if (typeof args.stockbit_token === "string" && args.stockbit_token.length > 0) {
    out.stockbit_token = args.stockbit_token;
  }

  const rawBody = args.body;
  let merged: Record<string, unknown> = {};
  if (rawBody && typeof rawBody === "object" && !Array.isArray(rawBody)) {
    merged = { ...(rawBody as Record<string, unknown>) };
  }

  for (const k of Object.keys(args)) {
    if (k === "body" || k === "stockbit_token") continue;
    if (!STOCKBIT_SCREENER_BODY_KEYS.has(k)) continue;
    if (!Object.hasOwn(merged, k)) merged[k] = args[k]!;
  }

  const hasRootScreenerField = Object.keys(args).some(
    (k) => k !== "body" && k !== "stockbit_token" && STOCKBIT_SCREENER_BODY_KEYS.has(k)
  );
  const bodyKeyIsObject =
    Object.hasOwn(args, "body") &&
    args.body !== null &&
    typeof args.body === "object" &&
    !Array.isArray(args.body);

  if (Object.keys(merged).length === 0 && !hasRootScreenerField && !bodyKeyIsObject) {
    return args;
  }

  out.body = coerceStockbitRunScreenerBody(merged);
  return out;
}
