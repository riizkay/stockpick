// PAA + segment trend + change point + event detection (nama field eksplisit untuk LLM)

const HOW_TO_READ = {
  segments:
    'chronological order (oldest→newest); each segment is an equal-width time bucket; return_pct = first-to-last close inside that bucket',
  trend_changes_segment_index:
    '0-based index of the segment where trend differs from the previous segment',
  key_events:
    'spike/drop = large one-day move vs recent volatility; recovery = short bounce after a sharp drop, price still below pre-drop peak',
};

function mean(arr) {
  if (!arr.length) return 0;
  let s = 0;
  for (const x of arr) s += x;
  return s / arr.length;
}

function stdev(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  let s = 0;
  for (const x of arr) s += (x - m) ** 2;
  return Math.sqrt(s / (arr.length - 1));
}

function linearSlopeYOnX(ys) {
  const n = ys.length;
  if (n < 2) return 0;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (let i = 0; i < n; i++) {
    const x = i;
    const y = ys[i];
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumXX += x * x;
  }
  const den = n * sumXX - sumX * sumX;
  if (Math.abs(den) < 1e-12) return 0;
  return (n * sumXY - sumX * sumY) / den;
}

/** @param {number} x */
function r2(x) {
  return Math.round(x * 100) / 100;
}

/** @param {'u'|'d'|'x'} code */
function trendOverall(code) {
  if (code === 'u') return 'uptrend';
  if (code === 'd') return 'downtrend';
  return 'sideways';
}

/** @param {'u'|'d'|'x'} code */
function trendSegment(code) {
  if (code === 'u') return 'up';
  if (code === 'd') return 'down';
  return 'sideways';
}

/** @param {'l'|'m'|'h'} code */
function volatilityWord(code) {
  if (code === 'l') return 'low';
  if (code === 'h') return 'high';
  return 'medium';
}

/** @param {'sp'|'dr'|'rcv'} y */
function eventTypeWord(y) {
  if (y === 'sp') return 'spike';
  if (y === 'dr') return 'drop';
  return 'recovery';
}

/**
 * @param {{ v: number, d: string | null }[]} series
 * @param {{ segMin?: number, segMax?: number }} opts
 */
export function summarizePriceSeries(series, opts = {}) {
  const segMin = opts.segMin ?? 10;
  const segMax = opts.segMax ?? 20;

  if (!Array.isArray(series) || series.length < 2) {
    return {
      price_points: series?.length ?? 0,
      overall: {
        trend: 'sideways',
        return_pct: 0,
        volatility: 'low',
        return_basis:
          'percent change from first to last closing price in the fetched range',
      },
      segments: [],
      trend_changes_segment_index: [],
      key_events: [],
      how_to_read: HOW_TO_READ,
    };
  }

  const values = series.map((p) => p.v);
  const n = values.length;

  const dailyRet = [];
  for (let i = 1; i < n; i++) {
    const prev = values[i - 1];
    if (prev === 0) dailyRet.push(0);
    else dailyRet.push(((values[i] - prev) / Math.abs(prev)) * 100);
  }
  const volDaily = stdev(dailyRet);
  let vLabel = 'm';
  if (volDaily < 1.2) vLabel = 'l';
  else if (volDaily > 3) vLabel = 'h';

  const first = values[0];
  const last = values[n - 1];
  const overallRet =
    first !== 0 ? ((last - first) / Math.abs(first)) * 100 : 0;
  const overallT = classifyTrend(overallRet, volDaily, Math.min(n, 60));

  const W = pickSegmentCount(n, segMin, segMax);
  const segments = [];
  const segLen = n / W;

  for (let k = 0; k < W; k++) {
    const start = Math.floor(k * segLen);
    const end = Math.min(n, Math.floor((k + 1) * segLen));
    if (start >= end) continue;
    const slice = values.slice(start, end);
    const slope = linearSlopeYOnX(slice);
    const mid = mean(slice);
    const driftPct =
      mid !== 0 ? (slope * (slice.length - 1) * 100) / Math.abs(mid) : 0;
    const t = classifyTrend(driftPct, volDaily, slice.length);
    const rp =
      slice[0] !== 0
        ? ((slice[slice.length - 1] - slice[0]) / Math.abs(slice[0])) * 100
        : 0;
    segments.push({
      t,
      r: r2(rp),
    });
  }

  const cp = [];
  for (let k = 1; k < segments.length; k++) {
    if (segments[k].t !== segments[k - 1].t) cp.push(k);
  }

  const dates = series.map((p) => p.d);
  const events = detectKeyEvents(values, dates, volDaily, segments, W, segLen);

  return {
    price_points: n,
    overall: {
      trend: trendOverall(overallT),
      return_pct: r2(overallRet),
      volatility: volatilityWord(vLabel),
      return_basis:
        'percent change from first to last closing price in the fetched range',
    },
    segments: segments.map((x) => ({
      trend: trendSegment(x.t),
      return_pct: x.r,
    })),
    trend_changes_segment_index: cp,
    key_events: events.map((ev) => ({
      type: eventTypeWord(ev.y),
      change_pct: ev.p,
    })),
    how_to_read: HOW_TO_READ,
  };
}

function pickSegmentCount(n, segMin, segMax) {
  if (n < segMin * 2) return Math.max(2, Math.min(segMax, Math.floor(n / 2)));
  let w = Math.round(n / 80);
  w = Math.max(segMin, Math.min(segMax, w));
  return w;
}

function classifyTrend(driftPct, volDaily, segLen) {
  const noise = (volDaily || 1) * Math.sqrt(Math.max(1, segLen)) * 0.35;
  const eps = Math.max(1.2, noise);
  if (Math.abs(driftPct) < eps) return 'x';
  return driftPct > 0 ? 'u' : 'd';
}

function detectKeyEvents(values, dates, volDaily, segments, W, segLen) {
  const n = values.length;
  const raw = [];
  const win = Math.min(25, Math.max(8, Math.floor(n * 0.05)));
  for (let i = 1; i < n; i++) {
    const prev = values[i - 1];
    if (prev === 0) continue;
    const ch = ((values[i] - prev) / Math.abs(prev)) * 100;
    const from = Math.max(1, i - win);
    const rets = [];
    for (let j = from; j < i; j++) {
      const p0 = values[j - 1];
      if (p0 === 0) continue;
      rets.push(((values[j] - p0) / Math.abs(p0)) * 100);
    }
    const sigma = rets.length > 1 ? stdev(rets) : volDaily || 1;
    const thr = Math.max(2.8, 2 * (sigma || 1));
    if (ch > thr) raw.push({ y: 'sp', p: r2(ch), i, d: dates[i] });
    if (ch < -thr) raw.push({ y: 'dr', p: r2(ch), i, d: dates[i] });
  }

  const merged = mergeCloseEvents(raw, 2);
  const recoveries = detectRecoveries(
    values,
    dates,
    segments,
    W,
    segLen,
    merged
  );
  const all = dedupeByDay([...merged, ...recoveries]);
  all.sort((a, b) => Math.abs(b.p) - Math.abs(a.p));
  const cap = 10;
  return all.slice(0, cap).map(({ y, p }) => ({ y, p }));
}

function mergeCloseEvents(arr, minGapDays) {
  const byType = { sp: [], dr: [] };
  for (const e of arr) {
    if (e.y === 'sp') byType.sp.push(e);
    else if (e.y === 'dr') byType.dr.push(e);
  }
  const out = [];
  for (const list of [byType.sp, byType.dr]) {
    list.sort((a, b) => a.i - b.i);
    let last = -1e9;
    for (const e of list) {
      if (e.i - last >= minGapDays) {
        out.push(e);
        last = e.i;
      }
    }
  }
  return out;
}

function dedupeByDay(events) {
  const seen = new Set();
  const out = [];
  for (const e of events) {
    const key = `${e.d ?? ''}:${e.y}:${e.p}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}

function detectRecoveries(values, dates, segments, W, segLen, existingDr) {
  const out = [];
  const n = values.length;
  const drops = existingDr.filter((e) => e.y === 'dr').sort((a, b) => a.i - b.i);
  const horizon = Math.min(35, Math.max(12, Math.floor(n * 0.04)));

  for (const dr of drops) {
    if (dr.p > -4) continue;
    const i0 = dr.i;
    const i1 = Math.min(n - 1, i0 + horizon);
    if (i1 <= i0 + 2) continue;
    let jMin = i0;
    let vmin = values[i0];
    for (let j = i0; j <= i1; j++) {
      if (values[j] < vmin) {
        vmin = values[j];
        jMin = j;
      }
    }
    if (jMin >= i1 - 1) continue;
    let vmax = vmin;
    let jMax = jMin;
    for (let j = jMin + 1; j <= i1; j++) {
      if (values[j] > vmax) {
        vmax = values[j];
        jMax = j;
      }
    }
    const prePeak =
      i0 >= 5 ? Math.max(...values.slice(i0 - 5, i0)) : values[i0];
    const rebPct =
      vmin !== 0 ? ((vmax - vmin) / Math.abs(vmin)) * 100 : 0;
    const stillBelow = vmax < prePeak * 0.985;
    const kSeg = Math.min(
      W - 1,
      Math.max(0, Math.floor((jMin + jMax) / 2 / segLen))
    );
    const inDowntrendCtx =
      kSeg >= 0 && kSeg < segments.length && segments[kSeg]?.t === 'd';

    if (
      rebPct >= 3 &&
      rebPct <= 25 &&
      stillBelow &&
      (inDowntrendCtx || dr.p <= -5)
    ) {
      out.push({
        y: 'rcv',
        p: r2(rebPct),
        i: jMax,
        d: dates[jMax],
      });
    }
  }

  return mergeByMinGap(out, 5);
}

function mergeByMinGap(list, minGrace) {
  const arr = [...list].sort((a, b) => a.i - b.i);
  const done = [];
  let last = -1e9;
  for (const e of arr) {
    if (e.i - last >= minGrace) {
      done.push(e);
      last = e.i;
    }
  }
  return done;
}

/**
 * @param {Array<{ value?: string | number, formatted_date?: string, date?: string }>} prices
 * @param {{ segMin?: number, segMax?: number }} opts
 */
export function summarizeFromStockbitPrices(prices, opts = {}) {
  const series = [];
  if (!Array.isArray(prices)) {
    return summarizePriceSeries([], opts);
  }
  for (const p of prices) {
    const v = Number(p?.value);
    if (!Number.isFinite(v)) continue;
    const fd = p?.formatted_date;
    const d =
      fd != null && String(fd) !== ''
        ? String(fd)
        : p?.date != null
          ? String(p.date)
          : null;
    series.push({ v, d });
  }
  return summarizePriceSeries(series, opts);
}
