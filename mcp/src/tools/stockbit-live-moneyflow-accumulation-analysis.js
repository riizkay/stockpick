import { z } from 'zod';
import { RUNNING_TRADE_URL } from '../shared/config.js';
import { BROWSERISH_GET_HEADERS } from '../shared/http.js';
import { resolveToken } from '../shared/token.js';
import { runMoneyFlowAnalysis, parseTradeRows } from '../lib/moneyflow/index.js';

const MAX_LIMIT = 100;
const DEFAULT_MAX_PAGES = 200;
// sesi regular IDX (WIB) — dipakai semua hari fetch
const DEFAULT_TIME_RANGE_START = '09:00';
const DEFAULT_TIME_RANGE_END = '16:00';

// rate limit: max request per detik ke endpoint running trade (sesuaikan kalau API berubah)
const MAX_RUNNING_TRADE_REQUESTS_PER_SECOND = 6;
const MIN_RUNNING_TRADE_REQUEST_INTERVAL_MS = Math.ceil(
  1000 / MAX_RUNNING_TRADE_REQUESTS_PER_SECOND
);

let lastRunningTradeRequestAt = 0;

async function throttleRunningTradeRequest() {
  const now = Date.now();
  if (lastRunningTradeRequestAt > 0) {
    const elapsed = now - lastRunningTradeRequestAt;
    if (elapsed < MIN_RUNNING_TRADE_REQUEST_INTERVAL_MS) {
      await new Promise((r) =>
        setTimeout(r, MIN_RUNNING_TRADE_REQUEST_INTERVAL_MS - elapsed)
      );
    }
  }
  lastRunningTradeRequestAt = Date.now();
}

function buildRunningTradeUrl({
  sort,
  limit,
  orderBy,
  ticker,
  date,
  minimumLot,
  timeRangeStart,
  timeRangeEnd,
  tradeNumber,
}) {
  const base = RUNNING_TRADE_URL.replace(/\/$/, '');
  const params = new URLSearchParams();
  params.set('sort', sort);
  params.set('limit', String(limit));
  params.set('order_by', orderBy);
  params.append('symbols[]', ticker);
  params.set('action_type', 'RUNNING_TRADE_ACTION_TYPE_ALL');
  if (date) params.set('date', date);
  if (minimumLot != null && minimumLot > 0)
    params.set('minimum_lot', String(minimumLot));
  if (timeRangeStart) params.set('time_range.start', timeRangeStart);
  if (timeRangeEnd) params.set('time_range.end', timeRangeEnd);
  if (tradeNumber) params.set('trade_number', String(tradeNumber));
  return `${base}?${params.toString()}`;
}

function addDaysIso(isoDate, deltaDays) {
  const [y, m, d] = isoDate.split('-').map((x) => Number(x));
  if (![y, m, d].every((n) => Number.isFinite(n))) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return dt.toISOString().slice(0, 10);
}

function isWeekendCalendarIso(isoDate) {
  const [y, m, d] = isoDate.split('-').map((x) => Number(x));
  if (![y, m, d].every((n) => Number.isFinite(n))) return false;
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return dow === 0 || dow === 6;
}

function todayIsoUtc() {
  return new Date().toISOString().slice(0, 10);
}

function extractRows(parsed) {
  const d = parsed?.data;
  return Array.isArray(d?.running_trade)
    ? d.running_trade
    : Array.isArray(d?.running_trades)
      ? d.running_trades
      : [];
}

// parse lot dari raw API row (sebelum normalisasi) untuk filter adaptive
function rawLotValue(row) {
  const v =
    row?.lot ?? row?.Lot ?? row?.volume ?? row?.Volume ?? row?.matched_lot;
  if (v == null) return 0;
  const n = Number(String(v).replace(/[\s,]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

// adaptive minimum_lot dari distribusi lot di sample page pertama
// p10 (percentile 10), cap di 5 — filter retail dust tanpa kehilangan iceberg pattern
function calculateAdaptiveMinLot(rawRows, dateIso) {
  const normalized = parseTradeRows(rawRows, dateIso);
  if (normalized.length < 20) return 1;
  const lots = normalized.map((t) => t.lot).sort((a, b) => a - b);
  const p10Idx = Math.floor(lots.length * 0.1);
  return Math.max(1, Math.min(5, lots[p10Idx] || 1));
}

// ---------- fetch helpers ----------

async function fetchPage({
  sort,
  limit,
  orderBy,
  ticker,
  date,
  minimumLot,
  timeRangeStart,
  timeRangeEnd,
  tradeNumber,
  headers,
}) {
  await throttleRunningTradeRequest();
  const url = buildRunningTradeUrl({
    sort,
    limit,
    orderBy,
    ticker,
    date,
    minimumLot,
    timeRangeStart,
    timeRangeEnd,
    tradeNumber,
  });
  const res = await fetch(url, { method: 'GET', headers });
  const raw = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      JSON.stringify({
        error: 'Response running trade bukan JSON.',
        ticker,
        failed_date: date,
        url,
        http_status: res.status,
      })
    );
  }
  if (!res.ok) {
    throw new Error(
      JSON.stringify({
        error: 'HTTP running trade error.',
        ticker,
        failed_date: date,
        url,
        http_status: res.status,
        message: parsed?.message ?? '',
      })
    );
  }
  return extractRows(parsed);
}

/**
 * fetch semua running trade satu hari dengan cursor pagination (trade_number)
 * Phase 1: sample page (minimum_lot=1) → hitung adaptive min lot
 * Phase 2: paginate sisanya pakai adaptive/override min lot
 */
async function fetchDayRunningTrades({
  sort,
  limit,
  orderBy,
  ticker,
  date,
  minimumLotOverride,
  timeRangeStart,
  timeRangeEnd,
  headers,
  maxPages,
}) {
  const needAdaptive = minimumLotOverride == null;

  // Phase 1: sample page
  const sampleRows = await fetchPage({
    sort,
    limit,
    orderBy,
    ticker,
    date,
    minimumLot: needAdaptive ? 1 : minimumLotOverride,
    timeRangeStart,
    timeRangeEnd,
    headers,
  });

  if (sampleRows.length === 0)
    return { rows: [], adaptiveMinLot: 1, pagesFetched: 1 };

  let effectiveMinLot = minimumLotOverride ?? 1;
  if (needAdaptive) {
    effectiveMinLot = calculateAdaptiveMinLot(sampleRows, date);
  }

  // filter sample rows retroaktif kalau adaptive > 1
  const filteredSample =
    needAdaptive && effectiveMinLot > 1
      ? sampleRows.filter((r) => rawLotValue(r) >= effectiveMinLot)
      : sampleRows;

  const allRows = [...filteredSample];

  if (sampleRows.length < limit) {
    return { rows: allRows, adaptiveMinLot: effectiveMinLot, pagesFetched: 1 };
  }

  // Phase 2: paginate — cursor dari trade_number item terakhir
  let cursor =
    sampleRows[sampleRows.length - 1]?.trade_number ??
    sampleRows[sampleRows.length - 1]?.id;
  let pagesFetched = 1;

  for (let page = 1; page < maxPages; page++) {
    if (!cursor) break;
    let rows;
    try {
      rows = await fetchPage({
        sort,
        limit,
        orderBy,
        ticker,
        date,
        minimumLot: effectiveMinLot,
        timeRangeStart,
        timeRangeEnd,
        tradeNumber: cursor,
        headers,
      });
    } catch {
      break;
    }
    pagesFetched++;
    if (rows.length === 0) break;
    allRows.push(...rows);
    cursor =
      rows[rows.length - 1]?.trade_number ?? rows[rows.length - 1]?.id;
    if (rows.length < limit) break;
  }

  return { rows: allRows, adaptiveMinLot: effectiveMinLot, pagesFetched };
}

// ---------- LLM summary ----------

function formatFlowValue(v) {
  const abs = Math.abs(v);
  if (abs >= 1e12) return `${(v / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return String(Math.round(v));
}

function buildLlmSummary(symbol, analyzed) {
  const signal = analyzed?.signal;
  const confidence = analyzed?.confidence ?? 'medium';
  const reasoning = Array.isArray(analyzed?.reasoning)
    ? analyzed.reasoning
    : [];
  const features = analyzed?.features ?? {};

  const se = features?.dominant_seller_ratio ?? 0;
  const be = features?.dominant_buyer_ratio ?? 0;
  const stab = features?.price_stability_ratio ?? 0;
  const ac = features?.absorption_consistency ?? 0;
  const avg = features?.avg_absorption_score ?? 0;
  const ice = features?.iceberg_pattern_count ?? 0;
  const absEv = features?.absorption_events ?? 0;
  const sellAbsEv = features?.seller_absorption_events ?? 0;
  const ub =
    features?.unique_time_buckets ?? features?.active_tape_minutes ?? 0;
  const multi = features?.multi_counterparty_ratio ?? 0;
  const rep = features?.repeated_order_ratio ?? 0;
  const qualOk = features?.absorption_quality_ok === true;
  const partWeak = features?.participation_weak === true;

  const nf = features?.net_money_flow ?? {};
  const nfRatio = nf?.net_flow_ratio ?? 0;
  const nfNet = nf?.net_flow ?? 0;
  const nfBuyLots = nf?.buy_lots ?? 0;
  const nfSellLots = nf?.sell_lots ?? 0;

  const fd = features?.foreign_domestic_flow ?? {};
  const fNet = fd?.foreign_net_lots ?? 0;
  const dNet = fd?.domestic_net_lots ?? 0;

  let tail =
    'Tidak ada pola akumulasi yang jelas dari running trade.';
  if (signal === 'STRONG_ACCUMULATION') {
    tail =
      'Hipotesis akumulasi kuat; tetap konfirmasi struktur harga & risiko.';
  } else if (signal === 'EARLY_ACCUMULATION') {
    tail =
      'Kemungkinan fase awal; butuh konfirmasi sebelum disamakan smart-money.';
  } else if (signal === 'NEUTRAL_ACTIVITY') {
    tail = 'Aktivitas ada tapi tidak tersusun jadi akumulasi.';
  } else if (signal === 'LOW_LIQUIDITY') {
    tail = 'Tape tipis — jangan over-interpretasi money-flow.';
  } else if (signal === 'DISTRIBUTION') {
    tail =
      'Polanya lebih mirip tekanan jual terstruktur; hati-hati buying the dip.';
  } else if (signal === 'NO_SIGNAL') {
    tail = 'Sample kurang untuk klasifikasi.';
  }

  const why =
    reasoning.length > 0
      ? ` ${reasoning[reasoning.length - 1]}`
      : '';

  const sign = (v) => (v >= 0 ? '+' : '');

  return (
    `${symbol}: ${signal} (keyakinan ${confidence}). ` +
    `Kualitas rata ${qualOk ? 'OK' : 'lemah'} (avg ${avg}/10), partisipasi ${partWeak ? 'sempit' : 'cukup'} (multi-CP ${multi}). ` +
    `${absEv} evt buyer-absorpsi / ${sellAbsEv} evt seller-absorpsi / ${ub} bucket waktu (≈${ac} evt/bucket). ` +
    `Dom seller/buyer (lot-weighted) ${se}/${be}, stabilitas ${stab}, order ulang ${rep}, iceberg ${ice}. ` +
    `Net flow: ${sign(nfNet)}${formatFlowValue(nfNet)} (ratio ${sign(nfRatio)}${nfRatio}, buy ${nfBuyLots} lot / sell ${nfSellLots} lot). ` +
    `Foreign net: ${sign(fNet)}${fNet} lot, Domestic net: ${sign(dNet)}${dNet} lot. ` +
    tail +
    why
  );
}

// ---------- register tool ----------

export function registerStockbitLiveMoneyflowAccumulationAnalysis(mcpServer) {
  mcpServer.registerTool(
    'stockbit_live_moneyflow_accumulation_analysis',
    {
      description: `Live Money Flow Accumulation/Distribution detector — analisis pola absorpsi dari running trade.

Adaptive minimum_lot dari sampling page pertama (p10, cap 5) kecuali di-override lewat parameter minimum_lot.
Klaster: harga sama + jendela waktu <= cluster_window_seconds (default 5 detik, boleh 2-10).
Skor per cluster (0-10) lot-weighted: dominant buyer +3, banyak seller (>=2 distinct) +2, volume +2.5, order ulang +1.5, harga stabil +1.
Net money flow dari action (aggressor) x lot x price. Foreign/Domestic flow dari suffix broker [F]/[D].
Pisahkan regular (RG) vs negotiated trade. Cross-validate sinyal cluster dengan net flow ratio + foreign flow ratio.
Bid-refill boost: order buy sama muncul di >=3 cluster berbeda = potential akumulasi, bisa upgrade EARLY ke STRONG.
Asimetri fix: STRONG_ACCUMULATION butuh avg_price_change >= -0.002 (cegah false strong saat harga drop).
Rescue condition: partisipasi sempit tapi absorption events tinggi + net flow positif + foreign buy/iceberg → tier dipertahankan.

Sinyal: STRONG_ACCUMULATION, EARLY_ACCUMULATION, NEUTRAL_ACTIVITY, DISTRIBUTION, LOW_LIQUIDITY, NO_SIGNAL.
confidence: high|medium|low.`,
      inputSchema: {
        ticker: z
          .string()
          .describe('Kode saham. Dinormalisasi uppercase, mis. ADRO.'),
        date: z
          .string()
          .optional()
          .describe(
            'Hari akhir analisis YYYY-MM-DD. Default hari ini (UTC date).'
          ),
        days_back: z
          .number()
          .int()
          .min(1)
          .max(31)
          .optional()
          .describe(
            'Berapa hari ke belakang di-fetch (termasuk hari anchor). Default 1.'
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe('Limit per page API. Max 100. Default 100.'),
        sort: z
          .enum(['ASC', 'DESC'])
          .optional()
          .describe('Urutan dari API. Default DESC.'),
        order_by: z
          .string()
          .optional()
          .describe('Default RUNNING_TRADE_ORDER_BY_TIME.'),
        minimum_lot: z
          .number()
          .int()
          .min(1)
          .optional()
          .describe(
            'Override minimum lot filter di API. Jika tidak diisi, pakai adaptive sampling (p10 dari page pertama, cap 5). Set 1 untuk tanpa filter.'
          ),
        max_pages: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe(
            'Maks halaman pagination per hari. Default 50 (= 5000 trade/hari).'
          ),
        include_extended: z
          .boolean()
          .optional()
          .describe(
            'true: tambah cross_cluster_repeated_* dan fragmentation detail. Default false.'
          ),
        cluster_window_seconds: z
          .number()
          .int()
          .min(2)
          .max(10)
          .optional()
          .describe(
            'Jendela waktu (detik) untuk cluster price-same. Default 5. Saham likuid banget bisa 2-3; saham tipis 5-10.'
          ),
        stockbit_token: z.string().optional().describe('Override token.'),
      },
    },
    async ({
      ticker,
      date: dateRaw,
      days_back: daysBackRaw,
      limit: limitRaw,
      sort: sortRaw,
      order_by: orderByRaw,
      minimum_lot: minimumLotRaw,
      max_pages: maxPagesRaw,
      include_extended: includeExtended,
      cluster_window_seconds: clusterWindowSecondsRaw,
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
                { error: 'ticker wajib diisi.' },
                null,
                2
              ),
            },
          ],
        };
      }

      const endDate = dateRaw?.trim() || todayIsoUtc();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                { error: 'date harus YYYY-MM-DD.' },
                null,
                2
              ),
            },
          ],
        };
      }

      const daysBack = daysBackRaw ?? 1;
      const limit = Math.min(limitRaw ?? MAX_LIMIT, MAX_LIMIT);
      const sort = sortRaw ?? 'DESC';
      const orderBy = orderByRaw ?? 'RUNNING_TRADE_ORDER_BY_TIME';
      const maxPages = maxPagesRaw ?? DEFAULT_MAX_PAGES;
      const minimumLotOverride = minimumLotRaw ?? null;
      const timeRangeStart = DEFAULT_TIME_RANGE_START;
      const timeRangeEnd = DEFAULT_TIME_RANGE_END;

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
                    'Token tidak ada. Set STOCKBIT_TOKEN pada env MCP.',
                },
                null,
                2
              ),
            },
          ],
        };
      }

      const reqHeaders = {
        ...BROWSERISH_GET_HEADERS,
        Authorization: `Bearer ${token}`,
      };

      /** @type {Array<{ date: string, rows: unknown[] }>} */
      const batches = [];
      let totalPagesFetched = 0;
      let adaptiveMinLotUsed = null;

      for (let i = 0; i < daysBack; i++) {
        const dayIso = addDaysIso(endDate, -i);
        if (!dayIso) {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    error: 'Gagal derive tanggal untuk satu hari dalam rentang.',
                    ticker: code,
                    date: endDate,
                    days_back: daysBack,
                    failed_offset: i,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }
        if (isWeekendCalendarIso(dayIso)) continue;

        try {
          const result = await fetchDayRunningTrades({
            sort,
            limit,
            orderBy,
            ticker: code,
            date: dayIso,
            minimumLotOverride,
            timeRangeStart,
            timeRangeEnd,
            headers: reqHeaders,
            maxPages,
          });
          batches.push({ date: dayIso, rows: result.rows });
          totalPagesFetched += result.pagesFetched;
          if (adaptiveMinLotUsed == null)
            adaptiveMinLotUsed = result.adaptiveMinLot;
        } catch (err) {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text:
                  err instanceof Error
                    ? err.message
                    : JSON.stringify(
                        {
                          error: 'Request running trade gagal.',
                          ticker: code,
                          failed_date: dayIso,
                          detail: String(err),
                        },
                        null,
                        2
                      ),
              },
            ],
          };
        }
      }

      if (batches.length === 0) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  error: 'Tidak ada data running trade yang berhasil diambil.',
                  ticker: code,
                  date: endDate,
                  days_back: daysBack,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      const analyzed = runMoneyFlowAnalysis(batches, {
        includeExtended: includeExtended === true,
        clusterWindowSeconds:
          Number.isFinite(clusterWindowSecondsRaw) &&
          clusterWindowSecondsRaw > 0
            ? clusterWindowSecondsRaw
            : undefined,
      });

      const runningTradeRowsRaw = batches.reduce(
        (acc, b) => acc + (Array.isArray(b.rows) ? b.rows.length : 0),
        0
      );

      const payload = {
        symbol: code,
        date: endDate,
        days_fetched: batches.length,
        pages_fetched_total: totalPagesFetched,
        adaptive_minimum_lot: adaptiveMinLotUsed,
        cluster_window_seconds:
          Number.isFinite(clusterWindowSecondsRaw) &&
          clusterWindowSecondsRaw > 0
            ? clusterWindowSecondsRaw
            : 5,
        running_trade_rows_raw: runningTradeRowsRaw,
        trades_processed: analyzed.tradesProcessed,
        total_trades_raw: analyzed.totalTradesRaw,
        signal: analyzed.signal,
        confidence: analyzed.confidence,
        reasoning: analyzed.reasoning,
        features: analyzed.features,
        llm_summary: buildLlmSummary(code, analyzed),
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(payload, null, 2),
          },
        ],
      };
    }
  );
}
