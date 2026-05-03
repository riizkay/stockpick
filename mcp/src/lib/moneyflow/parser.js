// normalisasi & urutan running trade untuk analisis money flow

function toNum(v) {
  if (v === '' || v == null) return null;
  if (typeof v === 'string') {
    const t = v.trim();
    if (t === '') return null;

    // Indonesia: ribuan titik (6.650, 12.345.678), desimal koma di akhir
    if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) {
      const noThousands = t.replace(/\./g, '');
      const normalized = noThousands.includes(',')
        ? noThousands.replace(',', '.')
        : noThousands;
      const n = Number(normalized);
      return Number.isFinite(n) ? n : null;
    }
    // US/UK: ribuan koma (6,650 atau 1,234.56)
    if (/^\d{1,3}(,\d{3})*(\.\d+)?$/.test(t)) {
      const n = Number(t.replace(/,/g, ''));
      return Number.isFinite(n) ? n : null;
    }
    // fallback: hapus spasi & koma ribuan ala "6,650"
    const fallback = t.replace(/[\s,]/g, '');
    const n = Number(fallback);
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * String "6,650" tidak perlu fungsi ini — toNum sudah hapus koma.
 * Ini untuk edge case: string "6.650" (titik ribuan) jadi 6.65 di Number(),
 * atau field price sudah number 6.65 dari JSON (salah skala vs 6650).
 * @param {number|null} n hasil toNum untuk price
 */
function normalizeIdxPricePerShare(n) {
  if (n == null || !Number.isFinite(n) || n <= 0) return n;
  if (n % 1 === 0) return n;
  const scaled = n * 1000;
  if (n >= 1 && n < 500 && scaled >= 200 && scaled <= 10_000_000) return scaled;
  return n;
}

/**
 * detik dari tengah malam (Asia/Jakarta) dari unix epoch — untuk sort dalam sesi
 */
function unixToSecondsFromMidnightJakarta(unixSec) {
  const d = new Date(unixSec * 1000);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const h = Number(map.hour);
  const m = Number(map.minute);
  const s = Number(map.second);
  if (![h, m, s].every((x) => Number.isFinite(x))) return null;
  return h * 3600 + m * 60 + s;
}

/**
 * time: "HH:MM:SS", ISO ("...T09:15:00..."), "YYYY-MM-DD HH:MM:SS", atau unix s/ms
 */
export function parseTimeToSeconds(raw) {
  if (raw == null) return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const unixSec =
      raw > 1e12 ? Math.floor(raw / 1000) : Math.floor(raw);
    return unixToSecondsFromMidnightJakarta(unixSec);
  }
  const s = String(raw).trim();
  if (!s) return null;

  const isoMatch = s.match(/[T\s](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?/);
  if (isoMatch) {
    const h = Number(isoMatch[1]);
    const m = Number(isoMatch[2]);
    const sec = isoMatch[3] != null ? Number(isoMatch[3]) : 0;
    if ([h, m, sec].every((x) => Number.isFinite(x)))
      return h * 3600 + m * 60 + sec;
  }

  return timeToSeconds(s);
}

/**
 * @param {string} timeStr "HH:MM:SS"
 * @returns {number|null} detik dari tengah malam
 */
export function timeToSeconds(timeStr) {
  if (timeStr == null || typeof timeStr !== 'string') return null;
  const parts = timeStr.trim().split(':');
  if (parts.length < 2) return null;
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  const s =
    parts[2] != null ? Number(String(parts[2]).replace(/\..*$/, '')) : 0;
  if (![h, m, s].every((x) => Number.isFinite(x))) return null;
  return h * 3600 + m * 60 + s;
}

// parse [F] = FOREIGN, [D] = DOMESTIC dari string broker IDX
function parseBrokerOrigin(brokerStr) {
  if (!brokerStr) return null;
  const s = String(brokerStr);
  if (s.includes('[F]')) return 'FOREIGN';
  if (s.includes('[D]')) return 'DOMESTIC';
  return null;
}

/**
 * @param {Record<string, unknown>} row baris API / compact camelCase
 * @param {string} dateISO YYYY-MM-DD
 */
export function normalizeTradeRow(row, dateISO) {
  if (row == null || typeof row !== 'object') return null;

  const timeRaw =
    row.time ??
    row.Time ??
    row.trade_time ??
    row.tradeTime ??
    row.matched_time ??
    row.datetime ??
    row.created_at ??
    null;
  const time = timeRaw != null ? String(timeRaw) : null;
  const timeSec = timeRaw != null ? parseTimeToSeconds(timeRaw) : null;
  if (timeSec == null) return null;

  const price = normalizeIdxPricePerShare(
    toNum(row.price ?? row.Price ?? row.match_price ?? row.matchPrice)
  );
  const lot = toNum(
    row.lot ??
      row.Lot ??
      row.volume ??
      row.Volume ??
      row.qty ??
      row.matched_lot ??
      row.matchedLot
  );
  if (price == null || lot == null || lot <= 0) return null;

  const actionRaw = row.action ?? row.Action;
  const action =
    actionRaw != null ? String(actionRaw).toLowerCase() : null;

  const buyerStr =
    row.buyer != null
      ? String(row.buyer)
      : row.Buyer != null
        ? String(row.Buyer)
        : '';
  const sellerStr =
    row.seller != null
      ? String(row.seller)
      : row.Seller != null
        ? String(row.Seller)
        : '';

  return {
    date: dateISO,
    time,
    timeSec,
    price,
    lot,
    action: action === 'buy' || action === 'sell' ? action : null,
    buyer: buyerStr,
    seller: sellerStr,
    buyerOrigin: parseBrokerOrigin(buyerStr),
    sellerOrigin: parseBrokerOrigin(sellerStr),
    buyerType: row.buyer_type ?? row.buyerType ?? null,
    sellerType: row.seller_type ?? row.sellerType ?? null,
    marketBoard: row.market_board ?? row.marketBoard ?? null,
    buyOrderNumber:
      row.buyOrderNumber != null
        ? String(row.buyOrderNumber)
        : row.buy_order_number != null
          ? String(row.buy_order_number)
          : '',
    sellOrderNumber:
      row.sellOrderNumber != null
        ? String(row.sellOrderNumber)
        : row.sell_order_number != null
          ? String(row.sell_order_number)
          : '',
    id:
      row.id != null
        ? String(row.id)
        : row.trade_number != null
          ? String(row.trade_number)
          : null,
  };
}

export function tradeDedupKey(t) {
  if (t.id) return `id:${t.id}`;
  return [
    t.date,
    t.time,
    t.price,
    t.lot,
    t.buyer,
    t.seller,
    t.buyOrderNumber,
    t.sellOrderNumber,
  ].join('|');
}

/**
 * @param {Array<Record<string, unknown>>} rows
 * @param {string} dateISO
 */
export function parseTradeRows(rows, dateISO) {
  const out = [];
  if (!Array.isArray(rows)) return out;
  for (const row of rows) {
    const n = normalizeTradeRow(row, dateISO);
    if (n) out.push(n);
  }
  return out;
}

/**
 * @template T {{ date: string, timeSec: number, price: number }}
 * @param {T[]} trades
 */
export function sortChronological(trades) {
  return [...trades].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    if (a.timeSec !== b.timeSec) return a.timeSec - b.timeSec;
    return a.price - b.price;
  });
}

/**
 * @template T {{ date: string, timeSec: number, price: number }}
 * @param {T[]} trades
 */
export function dedupeTrades(trades) {
  const seen = new Set();
  const out = [];
  for (const t of trades) {
    const k = tradeDedupKey(t);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}
