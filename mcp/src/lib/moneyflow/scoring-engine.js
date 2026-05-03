// skor absorpsi per cluster + agregat sesi + sinyal + net flow + foreign/domestic flow

// threshold dikalibrasi ulang. cluster window 5s bikin cluster size lebih besar,
// jadi manySellers/bigVolume/buyRep bisa trigger lebih sering. tapi COUNT_PARTY & QUALITY
// tetap perlu diturunkan karena saham mid-liquid jarang punya 3 distinct CP per cluster.
const DOMINANT_RATIO = 0.6;
const HIGH_CONSISTENCY_PER_MIN = 0.25;
const COUNT_PARTY_THRESHOLD = 2;
const LOT_FLOOR = 50;
const QUALITY_SCORE_FLOOR = 4;
const STRONG_SCORE_FLOOR = 6;
const PARTICIPATION_FLOOR = 0.2;
const PARTICIPATION_WEAK_HARD = 0.1;
const MIN_TRADES_FOR_FULL_ANALYSIS = 25;
const MIN_UNIQUE_BUCKETS_LIQ = 3;
const PRICE_STABILITY_CV = 0.012;
// asimetri fix: STRONG tidak boleh muncul kalau harga turun konsisten
const STRONG_MIN_AVG_PRICE_CHANGE = -0.002;
// boost: satu order buyer muncul di >=3 cluster beda = bid refill (early signal kuat)
const CROSS_CLUSTER_BUY_BOOST_MIN = 3;

/**
 * lot-weighted dominant party — volume lebih relevan dari jumlah trade
 * @param {import('./cluster-engine.js').NormalizedTrade[]} trades
 * @param {'buyer'|'seller'} side
 */
function dominantParty(trades, side) {
  const key = side === 'buyer' ? 'buyer' : 'seller';
  /** @type {Map<string, number>} */
  const lotMap = new Map();
  let totalLot = 0;
  for (const t of trades) {
    const v = t[key] || '_';
    lotMap.set(v, (lotMap.get(v) || 0) + t.lot);
    totalLot += t.lot;
  }
  let maxLot = 0;
  let who = null;
  for (const [k, l] of lotMap) {
    if (l > maxLot) {
      maxLot = l;
      who = k;
    }
  }
  const ratio = totalLot > 0 ? maxLot / totalLot : 0;
  const isDominant = ratio >= DOMINANT_RATIO && who != null && who !== '_';
  return { isDominant, who, ratio, distinct: lotMap.size };
}

/**
 * @param {import('./cluster-engine.js').NormalizedTrade[]} trades
 */
function countRepeatedOrderNumber(trades) {
  /** @type {Map<string, number>} */
  const buyN = new Map();
  /** @type {Map<string, number>} */
  const sellN = new Map();
  for (const t of trades) {
    if (t.buyOrderNumber)
      buyN.set(t.buyOrderNumber, (buyN.get(t.buyOrderNumber) || 0) + 1);
    if (t.sellOrderNumber)
      sellN.set(t.sellOrderNumber, (sellN.get(t.sellOrderNumber) || 0) + 1);
  }
  let buyRep = false;
  let sellRep = false;
  for (const c of buyN.values()) if (c >= 2) buyRep = true;
  for (const c of sellN.values()) if (c >= 2) sellRep = true;
  return { buyRep, sellRep, anyRep: buyRep || sellRep };
}

/**
 * @param {import('./cluster-engine.js').NormalizedTrade[]} trades
 */
function uniqueCounterparties(trades) {
  const buyers = new Set(trades.map((t) => t.buyer).filter(Boolean));
  const sellers = new Set(trades.map((t) => t.seller).filter(Boolean));
  return {
    buyers: buyers.size,
    sellers: sellers.size,
    maxSide: Math.max(buyers.size, sellers.size),
  };
}

/**
 * @param {import('./cluster-engine.js').NormalizedTrade[]} trades
 */
function totalLots(trades) {
  return trades.reduce((s, t) => s + t.lot, 0);
}

/**
 * iceberg: banyak trade kecil dengan nomor order sama (sisi yang sama)
 * @param {import('./cluster-engine.js').NormalizedTrade[]} trades
 * @param {number} sessionMedianLot median lot per trade di seluruh sesi
 */
function detectIcebergCluster(trades, sessionMedianLot) {
  if (trades.length < 4) return false;
  const lots = trades.map((t) => t.lot);
  const avgLot = lots.reduce((a, b) => a + b, 0) / lots.length;
  const smallChunks =
    sessionMedianLot > 0 && avgLot <= sessionMedianLot * 0.55;

  /** @type {Map<string, number>} */
  const buyHits = new Map();
  /** @type {Map<string, number>} */
  const sellHits = new Map();
  for (const t of trades) {
    if (t.buyOrderNumber)
      buyHits.set(
        t.buyOrderNumber,
        (buyHits.get(t.buyOrderNumber) || 0) + 1
      );
    if (t.sellOrderNumber)
      sellHits.set(
        t.sellOrderNumber,
        (sellHits.get(t.sellOrderNumber) || 0) + 1
      );
  }
  let maxHit = 0;
  for (const c of buyHits.values()) maxHit = Math.max(maxHit, c);
  for (const c of sellHits.values()) maxHit = Math.max(maxHit, c);
  const sameOrderDominates = maxHit >= Math.ceil(trades.length * 0.72);
  return smallChunks && sameOrderDominates;
}

/**
 * @param {object} param0
 * @param {import('./cluster-engine.js').NormalizedTrade[]} param0.trades
 * @param {number} param0.lotThreshold
 * @param {number[]|null} param0.recentPrices sliding window harga cluster sebelumnya
 * @param {number} param0.sessionMedianLot
 */
function scoreCluster({
  trades,
  lotThreshold,
  recentPrices,
  sessionMedianLot,
}) {
  const domSell = dominantParty(trades, 'seller');
  const domBuy = dominantParty(trades, 'buyer');
  const { buyRep, sellRep, anyRep } = countRepeatedOrderNumber(trades);
  const parties = uniqueCounterparties(trades);
  const lots = totalLots(trades);

  // stabilitas harga: coefficient of variation dari harga beberapa cluster terakhir
  const currentPrice = trades[trades.length - 1].price;
  let priceStable = false;
  if (recentPrices && recentPrices.length >= 2) {
    const allP = [...recentPrices, currentPrice];
    const mean = allP.reduce((a, b) => a + b, 0) / allP.length;
    if (mean > 0) {
      const variance =
        allP.reduce((a, p) => a + (p - mean) ** 2, 0) / allP.length;
      priceStable = Math.sqrt(variance) / mean < PRICE_STABILITY_CV;
    }
  }

  const bigVolume = lots >= lotThreshold;
  const manySellers = parties.sellers >= COUNT_PARTY_THRESHOLD;

  // bobot disesuaikan per signifikansi untuk akumulasi
  let s = 0;
  if (domBuy.isDominant) s += 3;
  if (manySellers) s += 2;
  if (bigVolume) s += 2.5;
  if (buyRep) s += 1.5;
  if (priceStable) s += 1;

  const distinctBuyers = parties.buyers;
  const distinctSellers = parties.sellers;
  const repeatedSellOrder =
    sellRep && trades.filter((t) => t.sellOrderNumber).length >= 2;
  const repeatedBuyOrder =
    buyRep && trades.filter((t) => t.buyOrderNumber).length >= 2;

  let absorptionType = null;
  // BUYER_ABSORPTION: satu buyer dominan serap dari banyak seller
  // tidak wajib repeatedBuyOrder DAN bigVolume sekaligus — salah satu cukup
  if (
    domBuy.isDominant &&
    distinctSellers >= 2 &&
    (repeatedBuyOrder || bigVolume)
  ) {
    absorptionType = 'BUYER_ABSORPTION';
  } else if (
    domSell.isDominant &&
    distinctBuyers >= 2 &&
    (repeatedSellOrder || bigVolume)
  ) {
    absorptionType = 'SELLER_ABSORPTION';
  }

  // aggressor hint — lot-weighted, bukan trade-count
  let sellHeavyLots = 0;
  let buyHeavyLots = 0;
  for (const t of trades) {
    if (t.action === 'sell') sellHeavyLots += t.lot;
    else if (t.action === 'buy') buyHeavyLots += t.lot;
  }
  let aggressorHint = 'MIXED';
  if (buyHeavyLots > sellHeavyLots * 1.25) aggressorHint = 'BUY_AGGR';
  else if (sellHeavyLots > buyHeavyLots * 1.25) aggressorHint = 'SELL_AGGR';

  const iceberg = detectIcebergCluster(trades, sessionMedianLot);

  const buyerFragmentation =
    parties.buyers > 0 ? 1 - domBuy.ratio : 1;
  const sellerFragmentation =
    parties.sellers > 0 ? 1 - domSell.ratio : 1;

  return {
    score: Math.min(10, s),
    domSell,
    domBuy,
    buyerFragmentation,
    sellerFragmentation,
    anyRep,
    parties,
    lots,
    priceStable,
    absorptionType,
    aggressorHint,
    iceberg,
  };
}

// ---------- session-level: net money flow & foreign/domestic flow ----------

/**
 * net money flow dari action (aggressor) x lot x price
 * action=buy → buyer aggressor (angkat offer), action=sell → seller aggressor (hajar bid)
 * @param {import('./cluster-engine.js').NormalizedTrade[]} trades
 */
function calcNetMoneyFlow(trades) {
  let buyFlow = 0;
  let sellFlow = 0;
  let buyLots = 0;
  let sellLots = 0;
  let neutralLots = 0;
  for (const t of trades) {
    const value = t.lot * t.price;
    if (t.action === 'buy') {
      buyFlow += value;
      buyLots += t.lot;
    } else if (t.action === 'sell') {
      sellFlow += value;
      sellLots += t.lot;
    } else {
      neutralLots += t.lot;
    }
  }
  const totalFlow = buyFlow + sellFlow;
  return {
    net_flow: buyFlow - sellFlow,
    buy_flow: buyFlow,
    sell_flow: sellFlow,
    buy_lots: buyLots,
    sell_lots: sellLots,
    neutral_lots: neutralLots,
    net_flow_ratio: totalFlow > 0 ? round3((buyFlow - sellFlow) / totalFlow) : 0,
  };
}

/**
 * flow per origin broker — [F] = foreign, [D] = domestic (dari suffix nama broker IDX)
 * @param {import('./cluster-engine.js').NormalizedTrade[]} trades
 */
function calcForeignDomesticFlow(trades) {
  let foreignBuyLots = 0;
  let foreignSellLots = 0;
  let domesticBuyLots = 0;
  let domesticSellLots = 0;
  for (const t of trades) {
    if (t.buyerOrigin === 'FOREIGN') foreignBuyLots += t.lot;
    else if (t.buyerOrigin === 'DOMESTIC') domesticBuyLots += t.lot;
    if (t.sellerOrigin === 'FOREIGN') foreignSellLots += t.lot;
    else if (t.sellerOrigin === 'DOMESTIC') domesticSellLots += t.lot;
  }
  return {
    foreign_buy_lots: foreignBuyLots,
    foreign_sell_lots: foreignSellLots,
    foreign_net_lots: foreignBuyLots - foreignSellLots,
    domestic_buy_lots: domesticBuyLots,
    domestic_sell_lots: domesticSellLots,
    domestic_net_lots: domesticBuyLots - domesticSellLots,
  };
}

// ---------- analyzeMoneyFlowSession ----------

/**
 * @param {import('./cluster-engine.js').NormalizedTrade[][]} clusterGroups
 * @param {import('./cluster-engine.js').NormalizedTrade[]} allTradesSorted
 */
export function analyzeMoneyFlowSession(clusterGroups, allTradesSorted) {
  const clusterTotals = clusterGroups.map((g) => totalLots(g));
  const sortedTotals = [...clusterTotals].sort((a, b) => a - b);
  const medianClusterLot =
    sortedTotals.length === 0
      ? LOT_FLOOR
      : sortedTotals[Math.floor(sortedTotals.length / 2)];
  const lotThreshold = Math.max(
    LOT_FLOOR,
    medianClusterLot * 1.25
  );

  const allLots = allTradesSorted.map((t) => t.lot);
  const sortedL = [...allLots].sort((a, b) => a - b);
  const sessionMedianLot =
    sortedL.length === 0
      ? 1
      : sortedL[Math.floor(sortedL.length / 2)];

  // session-level flow
  const netFlow = calcNetMoneyFlow(allTradesSorted);
  const fdFlow = calcForeignDomesticFlow(allTradesSorted);

  /** @type {ReturnType<typeof scoreCluster>[]} */
  const scored = [];
  /** @type {number[]} */
  const recentPrices = [];
  for (const group of clusterGroups) {
    const sc = scoreCluster({
      trades: group,
      lotThreshold,
      recentPrices: recentPrices.length >= 2 ? [...recentPrices] : null,
      sessionMedianLot,
    });
    scored.push(sc);
    recentPrices.push(group[group.length - 1].price);
    if (recentPrices.length > 5) recentPrices.shift();
  }

  const totalClusters = clusterGroups.length;
  let absorptionEvents = 0;
  let sellerAbsorptionEvents = 0;
  let scoreSum = 0;
  let maxScore = 0;
  let domSellWeighted = 0;
  let domBuyWeighted = 0;
  let clusterLotSum = 0;
  let repOrderClusters = 0;
  let priceStableClusters = 0;
  let priceDeltaSum = 0;
  let priceDeltaN = 0;
  let icebergPatternCount = 0;
  let sellAggrClusters = 0;
  let buyAggrClusters = 0;

  let prevPrice = null;
  for (let i = 0; i < clusterGroups.length; i++) {
    const g = clusterGroups[i];
    const sc = scored[i];
    scoreSum += sc.score;
    maxScore = Math.max(maxScore, sc.score);
    const clLots = sc.lots || 0;
    clusterLotSum += clLots;
    domSellWeighted += sc.domSell.ratio * clLots;
    domBuyWeighted += sc.domBuy.ratio * clLots;
    if (sc.anyRep) repOrderClusters++;
    if (sc.priceStable) priceStableClusters++;
    if (sc.iceberg) icebergPatternCount++;
    if (sc.aggressorHint === 'SELL_AGGR') sellAggrClusters++;
    else if (sc.aggressorHint === 'BUY_AGGR') buyAggrClusters++;

    if (prevPrice != null && prevPrice > 0) {
      const p = g[g.length - 1].price;
      priceDeltaSum += (p - prevPrice) / prevPrice;
      priceDeltaN++;
    }
    prevPrice = g[g.length - 1].price;

    // gate absorption diturunkan biar cluster dengan score 4 + dominance kuat tetap dihitung
    if (
      sc.absorptionType === 'BUYER_ABSORPTION' &&
      (sc.score >= 4 || sc.domBuy.ratio >= 0.6)
    ) {
      absorptionEvents++;
    }
    if (
      sc.absorptionType === 'SELLER_ABSORPTION' &&
      (sc.score >= 4 || sc.domSell.ratio >= 0.6)
    ) {
      sellerAbsorptionEvents++;
    }
  }

  const avgAbsorptionScore =
    totalClusters > 0 ? scoreSum / totalClusters : 0;

  const uniqueTimeBuckets = countUniqueTimeBuckets(allTradesSorted);
  const absorptionConsistency =
    uniqueTimeBuckets > 0 ? absorptionEvents / uniqueTimeBuckets : 0;

  const tradesN = allTradesSorted.length;
  const lowLiquidity =
    tradesN < MIN_TRADES_FOR_FULL_ANALYSIS ||
    (uniqueTimeBuckets < MIN_UNIQUE_BUCKETS_LIQ && tradesN < 20);

  const dominantSellerRatioWeighted =
    clusterLotSum > 0 ? domSellWeighted / clusterLotSum : 0;
  const dominantBuyerRatioWeighted =
    clusterLotSum > 0 ? domBuyWeighted / clusterLotSum : 0;

  const multiCounterpartyRatioFixed =
    totalClusters > 0
      ? clusterGroups.filter(
          (_, i) => scored[i].parties.maxSide >= COUNT_PARTY_THRESHOLD
        ).length / totalClusters
      : 0;

  const priceStabilityRatioVal =
    totalClusters > 0 ? priceStableClusters / totalClusters : 0;
  const avgPriceChange =
    priceDeltaN ? priceDeltaSum / priceDeltaN : 0;

  const distributionClassic =
    avgPriceChange <= -0.0005 &&
    priceStabilityRatioVal < 0.52 &&
    sellAggrClusters > buyAggrClusters &&
    sellerAbsorptionEvents >= 2;

  const distributionSoft =
    sellerAbsorptionEvents >= 3 &&
    absorptionEvents === 0 &&
    dominantSellerRatioWeighted > dominantBuyerRatioWeighted + 0.1;

  const distributionLike =
    !lowLiquidity &&
    dominantSellerRatioWeighted > dominantBuyerRatioWeighted + 0.05 &&
    (distributionClassic || distributionSoft);

  const meaningfulTape =
    tradesN >= 25 || absorptionEvents >= 1 || totalClusters >= 15;

  // hitung cross-cluster repeated order SEBELUM classifier biar bisa dipakai sebagai boost
  const sellOrderClusters = new Map();
  const buyOrderClusters = new Map();
  clusterGroups.forEach((g, idx) => {
    const sellSet = new Set(g.map((t) => t.sellOrderNumber).filter(Boolean));
    const buySet = new Set(g.map((t) => t.buyOrderNumber).filter(Boolean));
    for (const o of sellSet) {
      if (!sellOrderClusters.has(o)) sellOrderClusters.set(o, new Set());
      sellOrderClusters.get(o).add(idx);
    }
    for (const o of buySet) {
      if (!buyOrderClusters.has(o)) buyOrderClusters.set(o, new Set());
      buyOrderClusters.get(o).add(idx);
    }
  });
  let crossClusterRepeatedSell = 0;
  for (const s of sellOrderClusters.values()) {
    if (s.size >= 3) crossClusterRepeatedSell++;
  }
  let crossClusterRepeatedBuy = 0;
  for (const s of buyOrderClusters.values()) {
    if (s.size >= 3) crossClusterRepeatedBuy++;
  }

  const {
    signal,
    confidence,
    reasoning,
  } = classifySignalPipeline({
    lowLiquidity,
    distributionLike,
    distributionSoft,
    avgAbsorptionScore,
    absorptionConsistency,
    absorptionEvents,
    sellerAbsorptionEvents,
    uniqueTimeBuckets,
    multiCounterpartyRatio: multiCounterpartyRatioFixed,
    meaningfulTape,
    netFlowRatio: netFlow.net_flow_ratio,
    icebergPatternCount,
    foreignNetLots: fdFlow.foreign_net_lots,
    totalTradedLots: netFlow.buy_lots + netFlow.sell_lots + netFlow.neutral_lots,
    avgPriceChange,
    crossClusterRepeatedBuy,
    maxScore,
  });

  // fragmentasi sisi lawan saat salah satu sisi dominan
  let fragSumWhenSellStrong = 0;
  let fragNWhenSellStrong = 0;
  let fragSumWhenBuyStrong = 0;
  let fragNWhenBuyStrong = 0;
  for (let i = 0; i < scored.length; i++) {
    const sc = scored[i];
    if (sc.domSell.ratio > sc.domBuy.ratio) {
      fragSumWhenSellStrong += sc.buyerFragmentation;
      fragNWhenSellStrong++;
    } else if (sc.domBuy.ratio > sc.domSell.ratio) {
      fragSumWhenBuyStrong += sc.sellerFragmentation;
      fragNWhenBuyStrong++;
    }
  }
  const opposing_side_fragmentation_when_seller_leads = round2(
    fragNWhenSellStrong ? fragSumWhenSellStrong / fragNWhenSellStrong : 0
  );
  const opposing_side_fragmentation_when_buyer_leads = round2(
    fragNWhenBuyStrong ? fragSumWhenBuyStrong / fragNWhenBuyStrong : 0
  );

  return {
    signal,
    confidence,
    reasoning,
    features: {
      total_clusters: totalClusters,
      absorption_events: absorptionEvents,
      seller_absorption_events: sellerAbsorptionEvents,
      avg_absorption_score: round2(avgAbsorptionScore),
      max_absorption_score: maxScore,
      absorption_consistency: round3(absorptionConsistency),
      unique_time_buckets: uniqueTimeBuckets,
      active_tape_minutes: uniqueTimeBuckets,
      dominant_seller_ratio: round2(dominantSellerRatioWeighted),
      dominant_buyer_ratio: round2(dominantBuyerRatioWeighted),
      participation_weak: multiCounterpartyRatioFixed < PARTICIPATION_FLOOR,
      absorption_quality_ok: avgAbsorptionScore >= QUALITY_SCORE_FLOOR,
      repeated_order_ratio: round2(
        totalClusters ? repOrderClusters / totalClusters : 0
      ),
      multi_counterparty_ratio: round2(multiCounterpartyRatioFixed),
      price_stability_ratio: round2(
        totalClusters ? priceStableClusters / totalClusters : 0
      ),
      avg_price_change_per_cluster: round2(
        priceDeltaN ? priceDeltaSum / priceDeltaN : 0
      ),
      iceberg_pattern_count: icebergPatternCount,
      net_money_flow: netFlow,
      foreign_domestic_flow: fdFlow,
      cross_cluster_repeated_sell_orders: crossClusterRepeatedSell,
      cross_cluster_repeated_buy_orders: crossClusterRepeatedBuy,
    },
    featuresExtended: {
      opposing_side_fragmentation_when_seller_leads,
      opposing_side_fragmentation_when_buyer_leads,
    },
  };
}

// ---------- signal classification ----------

/**
 * @param {object} p
 * @param {boolean} p.lowLiquidity
 * @param {boolean} p.distributionLike
 * @param {boolean} p.distributionSoft
 * @param {number} p.avgAbsorptionScore
 * @param {number} p.absorptionConsistency
 * @param {number} p.absorptionEvents
 * @param {number} p.sellerAbsorptionEvents
 * @param {number} p.uniqueTimeBuckets
 * @param {number} p.multiCounterpartyRatio
 * @param {boolean} p.meaningfulTape
 * @param {number} p.netFlowRatio
 * @param {number} p.icebergPatternCount
 * @param {number} p.foreignNetLots
 * @param {number} p.totalTradedLots
 * @param {number} p.avgPriceChange
 * @param {number} p.crossClusterRepeatedBuy
 * @param {number} p.maxScore
 */
function classifySignalPipeline(p) {
  /** @type {string[]} */
  const reasoning = [];
  reasoning.push(
    'Dominan buyer (lot-weighted) = satu pihak serap supply banyak seller (akumulasi). Dominan seller = distribusi. Skor cluster: domBuy +3, banyak seller +2, volume +2.5, order ulang +1.5, harga stabil +1.'
  );
  reasoning.push(
    `BUYER_ABSORPTION: ${p.absorptionEvents} evt | SELLER_ABSORPTION: ${p.sellerAbsorptionEvents} evt | konsistensi = ${p.absorptionEvents}/${p.uniqueTimeBuckets} ≈ ${round3(p.absorptionConsistency)} evt/bucket.`
  );
  reasoning.push(
    `Net flow ratio: ${round2(p.netFlowRatio)} (positif = buyer aggressor dominan, negatif = seller aggressor dominan).`
  );

  if (p.lowLiquidity) {
    reasoning.push(
      'Tape tipis: sample trade atau menit unik rendah — interpretasi lemah.'
    );
    return {
      signal: 'LOW_LIQUIDITY',
      confidence: 'low',
      reasoning,
    };
  }

  if (p.distributionLike) {
    if (p.distributionSoft) {
      reasoning.push(
        `Distribusi halus: seller_absorption (${p.sellerAbsorptionEvents}) tinggi, buyer_absorption = 0, seller dominan.`
      );
    } else {
      reasoning.push(
        `Distribusi klasik: drift negatif + seller dominan + agresi jual + seller_absorption (${p.sellerAbsorptionEvents}) >= 2.`
      );
    }
    /** @type {'high'|'medium'|'low'} */
    let conf = 'medium';
    if (p.multiCounterpartyRatio < 0.15) {
      conf = 'low';
    } else if (
      p.sellerAbsorptionEvents >= 4 &&
      p.multiCounterpartyRatio >= PARTICIPATION_FLOOR
    ) {
      conf = 'high';
    }
    // cross-validate: net flow negatif confirms distribusi
    if (p.netFlowRatio < -0.25 && conf === 'medium') {
      conf = 'high';
      reasoning.push(
        `Net flow ${round2(p.netFlowRatio)} confirms distribusi (seller aggressor dominan).`
      );
    } else if (p.netFlowRatio > 0.15 && conf !== 'low') {
      conf = 'low';
      reasoning.push(
        `Net flow positif (${round2(p.netFlowRatio)}) kontradiksi distribusi — confidence turun.`
      );
    }
    // foreign flow cross-validation untuk distribusi
    const distForeignRatio = p.totalTradedLots > 0
      ? p.foreignNetLots / p.totalTradedLots
      : 0;
    if (distForeignRatio < -0.1 && conf === 'medium') {
      conf = 'high';
      reasoning.push(
        `Foreign net sell ${round2(Math.abs(distForeignRatio) * 100)}% volume confirms distribusi.`
      );
    } else if (distForeignRatio > 0.1 && conf !== 'low') {
      conf = 'low';
      reasoning.push(
        `Foreign net buy ${round2(distForeignRatio * 100)}% volume kontradiksi distribusi.`
      );
    }
    return {
      signal: 'DISTRIBUTION',
      confidence: conf,
      reasoning,
    };
  }

  /** @type {'STRONG_ACCUMULATION'|'EARLY_ACCUMULATION'|'NEUTRAL_ACTIVITY'|'NO_SIGNAL'} */
  let signal;
  // flag: tier ini dihasilkan dari rescue (bypass filter kualitas di bawah)
  let fromRescue = false;
  if (
    p.avgAbsorptionScore >= STRONG_SCORE_FLOOR &&
    p.absorptionConsistency >= HIGH_CONSISTENCY_PER_MIN &&
    p.avgPriceChange >= STRONG_MIN_AVG_PRICE_CHANGE
  ) {
    signal = 'STRONG_ACCUMULATION';
    reasoning.push(
      `Skor cluster avg ${round2(p.avgAbsorptionScore)} >= ${STRONG_SCORE_FLOOR} + konsistensi ${round3(p.absorptionConsistency)} >= ${HIGH_CONSISTENCY_PER_MIN}, harga tidak drop signifikan.`
    );
  } else if (p.avgAbsorptionScore >= QUALITY_SCORE_FLOOR) {
    signal = 'EARLY_ACCUMULATION';
    reasoning.push(
      `Skor avg ${round2(p.avgAbsorptionScore)} >= ${QUALITY_SCORE_FLOOR} — fase akumulasi awal.`
    );
  } else if (
    // rescue: skor avg rendah tapi ada bid-refill kuat + net flow positif
    p.crossClusterRepeatedBuy >= CROSS_CLUSTER_BUY_BOOST_MIN &&
    p.netFlowRatio > 0.05 &&
    p.absorptionEvents >= 1
  ) {
    signal = 'EARLY_ACCUMULATION';
    fromRescue = true;
    reasoning.push(
      `Rescue via bid-refill: ${p.crossClusterRepeatedBuy} order buy muncul di >=3 cluster + net flow +${round2(p.netFlowRatio)} + ${p.absorptionEvents} absorpsi.`
    );
  } else if (!p.meaningfulTape) {
    signal = 'NO_SIGNAL';
    reasoning.push('Aktivitas struktural minim.');
  } else {
    signal = 'NEUTRAL_ACTIVITY';
    reasoning.push(
      `Skor avg ${round2(p.avgAbsorptionScore)} di bawah floor ${QUALITY_SCORE_FLOOR} — aktivitas tidak membentuk akumulasi.`
    );
  }

  /** @type {'high'|'medium'|'low'} */
  let confidence = 'high';

  // filter kualitas tidak berlaku untuk sinyal rescue — rescue sudah punya bukti struktural lain
  if (!fromRescue && p.avgAbsorptionScore < QUALITY_SCORE_FLOOR) {
    if (signal === 'STRONG_ACCUMULATION') {
      signal = 'EARLY_ACCUMULATION';
      reasoning.push(
        `Filter kualitas: avg skor < ${QUALITY_SCORE_FLOOR} — turunkan tier.`
      );
    } else if (signal === 'EARLY_ACCUMULATION') {
      signal = 'NEUTRAL_ACTIVITY';
      reasoning.push(
        `Filter kualitas: avg skor < ${QUALITY_SCORE_FLOOR} — ke NEUTRAL.`
      );
    }
  }
  if (fromRescue && confidence === 'high') confidence = 'medium';

  if (p.multiCounterpartyRatio < PARTICIPATION_FLOOR) {
    // rescue: sinyal kompensasi kuat cegah drop tier (hanya confidence turun)
    const hasStrongCompensation =
      p.absorptionEvents >= 10 &&
      p.netFlowRatio > 0.05 &&
      (p.foreignNetLots > 0 || p.icebergPatternCount >= 3);

    if (signal === 'STRONG_ACCUMULATION') {
      signal = 'EARLY_ACCUMULATION';
      reasoning.push(
        `Partisipasi sempit: multi-CP < ${PARTICIPATION_FLOOR} — STRONG turun ke EARLY.`
      );
    } else if (signal === 'EARLY_ACCUMULATION') {
      if (hasStrongCompensation) {
        reasoning.push(
          `Partisipasi sempit (multi-CP ${round2(p.multiCounterpartyRatio)}) tapi dikompensasi ${p.absorptionEvents} absorption events + net flow positif — tier dipertahankan.`
        );
      } else {
        signal = 'NEUTRAL_ACTIVITY';
        reasoning.push(
          `Partisipasi lemah: multi_counterparty < ${PARTICIPATION_FLOOR}.`
        );
      }
    }
    if (confidence === 'high') confidence = 'medium';
  }

  if (p.multiCounterpartyRatio < PARTICIPATION_WEAK_HARD) {
    confidence = 'low';
  } else if (
    signal === 'STRONG_ACCUMULATION' &&
    confidence === 'high' &&
    p.multiCounterpartyRatio < 0.35
  ) {
    confidence = 'medium';
  }

  // boost via cross-cluster repeated buy (bid refill/mirroring)
  if (
    p.crossClusterRepeatedBuy >= CROSS_CLUSTER_BUY_BOOST_MIN &&
    (signal === 'EARLY_ACCUMULATION' || signal === 'NEUTRAL_ACTIVITY')
  ) {
    reasoning.push(
      `Bid refill terdeteksi: ${p.crossClusterRepeatedBuy} order buy berulang lintas cluster.`
    );
    if (
      signal === 'EARLY_ACCUMULATION' &&
      p.absorptionEvents >= 3 &&
      p.netFlowRatio > 0.1 &&
      p.maxScore >= STRONG_SCORE_FLOOR
    ) {
      signal = 'STRONG_ACCUMULATION';
      reasoning.push(
        'Upgrade ke STRONG: bid refill + absorpsi cukup + net flow positif + ada cluster dgn skor tinggi.'
      );
      if (confidence === 'low') confidence = 'medium';
    } else if (confidence === 'low') {
      confidence = 'medium';
    }
  }

  // cross-validate dengan net money flow
  if (
    p.netFlowRatio > 0.25 &&
    (signal === 'STRONG_ACCUMULATION' || signal === 'EARLY_ACCUMULATION')
  ) {
    reasoning.push(
      `Net flow +${round2(p.netFlowRatio)} confirms akumulasi.`
    );
    if (confidence === 'medium') confidence = 'high';
  } else if (
    p.netFlowRatio < -0.15 &&
    (signal === 'STRONG_ACCUMULATION' || signal === 'EARLY_ACCUMULATION')
  ) {
    reasoning.push(
      `Net flow negatif (${round2(p.netFlowRatio)}) kontradiksi akumulasi — confidence turun.`
    );
    if (confidence === 'high') confidence = 'medium';
    if (signal === 'STRONG_ACCUMULATION') signal = 'EARLY_ACCUMULATION';
  }

  // foreign flow cross-validation untuk akumulasi
  const accForeignRatio = p.totalTradedLots > 0
    ? p.foreignNetLots / p.totalTradedLots
    : 0;
  if (
    accForeignRatio > 0.1 &&
    (signal === 'EARLY_ACCUMULATION' || signal === 'STRONG_ACCUMULATION')
  ) {
    reasoning.push(
      `Foreign net buy ${round2(accForeignRatio * 100)}% dari volume — confirms akumulasi.`
    );
    if (confidence === 'low') confidence = 'medium';
  } else if (
    accForeignRatio < -0.1 &&
    (signal === 'EARLY_ACCUMULATION' || signal === 'STRONG_ACCUMULATION')
  ) {
    reasoning.push(
      `Foreign net sell ${round2(Math.abs(accForeignRatio) * 100)}% dari volume — kontradiksi akumulasi.`
    );
    if (confidence === 'high') confidence = 'medium';
  }

  if (signal === 'NEUTRAL_ACTIVITY') {
    confidence = confidence === 'high' ? 'medium' : confidence;
  }
  if (signal === 'NO_SIGNAL') {
    confidence = 'low';
  }

  return { signal, confidence, reasoning };
}

// ---------- helpers ----------

function round2(x) {
  return Math.round(x * 100) / 100;
}

function round3(x) {
  return Math.round(x * 1000) / 1000;
}

/**
 * bucket waktu unik: tanggal + menit sesi (ada >= 1 print)
 * @param {import('./cluster-engine.js').NormalizedTrade[]} trades
 */
function countUniqueTimeBuckets(trades) {
  if (!trades.length) return 1;
  const keys = new Set();
  for (const t of trades) {
    const minuteOfDay = Math.floor(t.timeSec / 60);
    keys.add(`${t.date}:${minuteOfDay}`);
  }
  return Math.max(keys.size, 1);
}
