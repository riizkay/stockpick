import { sortChronological, dedupeTrades, parseTradeRows } from './parser.js';
import { clusterByTimeAndPrice } from './cluster-engine.js';
import { analyzeMoneyFlowSession } from './scoring-engine.js';

export { parseTradeRows, sortChronological, dedupeTrades } from './parser.js';
export { clusterByTimeAndPrice } from './cluster-engine.js';
export { analyzeMoneyFlowSession } from './scoring-engine.js';

/**
 * @param {Array<{ date: string, rows: Array<Record<string, unknown>> }>} batches
 * @param {{ includeExtended?: boolean, clusterWindowSeconds?: number }} [opts]
 */
export function runMoneyFlowAnalysis(batches, opts = {}) {
  /** @type {import('./cluster-engine.js').NormalizedTrade[]} */
  let all = [];
  for (const { date, rows } of batches) {
    all = all.concat(parseTradeRows(rows, date));
  }
  all = dedupeTrades(all);
  all = sortChronological(all);

  // pisahkan regular board vs negotiated/cross trade
  const regularTrades = all.filter(
    (t) => !t.marketBoard || t.marketBoard === 'RG'
  );
  const negotiatedTrades = all.filter(
    (t) => t.marketBoard && t.marketBoard !== 'RG'
  );
  const negotiatedLots = negotiatedTrades.reduce((s, t) => s + t.lot, 0);

  // cluster + scoring hanya dari regular trades (negotiated = pre-arranged, bukan market force)
  const clusters = clusterByTimeAndPrice(regularTrades, {
    windowSeconds: opts.clusterWindowSeconds,
  });
  const session = analyzeMoneyFlowSession(clusters, regularTrades);
  const extended = opts.includeExtended === true;

  /** @type {Record<string, unknown>} */
  const features = {
    total_clusters: session.features.total_clusters,
    absorption_events: session.features.absorption_events,
    seller_absorption_events: session.features.seller_absorption_events,
    avg_absorption_score: session.features.avg_absorption_score,
    max_absorption_score: session.features.max_absorption_score,
    absorption_consistency: session.features.absorption_consistency,
    unique_time_buckets: session.features.unique_time_buckets,
    active_tape_minutes: session.features.active_tape_minutes,
    dominant_seller_ratio: session.features.dominant_seller_ratio,
    dominant_buyer_ratio: session.features.dominant_buyer_ratio,
    participation_weak: session.features.participation_weak,
    absorption_quality_ok: session.features.absorption_quality_ok,
    repeated_order_ratio: session.features.repeated_order_ratio,
    multi_counterparty_ratio: session.features.multi_counterparty_ratio,
    price_stability_ratio: session.features.price_stability_ratio,
    avg_price_change_per_cluster: session.features.avg_price_change_per_cluster,
    iceberg_pattern_count: session.features.iceberg_pattern_count,
    net_money_flow: session.features.net_money_flow,
    foreign_domestic_flow: session.features.foreign_domestic_flow,
    negotiated_trade_lots: negotiatedLots,
    negotiated_trade_count: negotiatedTrades.length,
  };
  if (extended) {
    features.cross_cluster_repeated_sell_orders =
      session.features.cross_cluster_repeated_sell_orders;
    features.cross_cluster_repeated_buy_orders =
      session.features.cross_cluster_repeated_buy_orders;
    if (session.featuresExtended) {
      Object.assign(features, session.featuresExtended);
    }
  }
  return {
    signal: session.signal,
    confidence: session.confidence,
    reasoning: session.reasoning,
    features,
    tradesProcessed: regularTrades.length,
    clusterCount: clusters.length,
    totalTradesRaw: all.length,
  };
}
