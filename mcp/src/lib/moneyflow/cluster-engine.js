// klaster: harga sama + jendela waktu <= N detik dari titik jangkar (tanggal sama)
// window default dinaikkan ke 5s biar cluster tidak kekecilan di saham mid-liquid

const DEFAULT_CLUSTER_WINDOW_SECONDS = 5;

/**
 * @typedef {object} NormalizedTrade
 * @property {string} date
 * @property {string} time
 * @property {number} timeSec
 * @property {number} price
 * @property {number} lot
 * @property {'buy'|'sell'|null} action
 * @property {string} buyer
 * @property {string} seller
 * @property {string|null} buyerOrigin  'FOREIGN'|'DOMESTIC'|null
 * @property {string|null} sellerOrigin 'FOREIGN'|'DOMESTIC'|null
 * @property {string|null} buyerType    BROKER_TYPE_* dari API
 * @property {string|null} sellerType   BROKER_TYPE_* dari API
 * @property {string|null} marketBoard  'RG'|'TN'|dll
 * @property {string} buyOrderNumber
 * @property {string} sellOrderNumber
 * @property {string|null} id
 */

/**
 * window bisa di-override; kalau null/undefined pakai default.
 * @param {NormalizedTrade[]} trades sudah urut kronologis
 * @param {{ windowSeconds?: number }} [opts]
 * @returns {NormalizedTrade[][]}
 */
export function clusterByTimeAndPrice(trades, opts = {}) {
  const windowSec =
    Number.isFinite(opts.windowSeconds) && opts.windowSeconds > 0
      ? opts.windowSeconds
      : DEFAULT_CLUSTER_WINDOW_SECONDS;

  /** @type {NormalizedTrade[][]} */
  const clusters = [];
  let i = 0;
  while (i < trades.length) {
    const first = trades[i];
    const group = [first];
    const anchorSec = first.timeSec;
    const price = first.price;
    const date = first.date;
    i++;
    while (i < trades.length) {
      const t = trades[i];
      if (t.date !== date || t.price !== price) break;
      if (t.timeSec - anchorSec > windowSec) break;
      group.push(t);
      i++;
    }
    clusters.push(group);
  }
  return clusters;
}

export { DEFAULT_CLUSTER_WINDOW_SECONDS };
