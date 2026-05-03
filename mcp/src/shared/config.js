/** URL & data statis Stockbit / MCP */

export const SCREENER_URL =
  process.env.STOCKBIT_SCREENER_URL?.trim() ||
  'https://exodus.stockbit.com/screener/templates';

export const ORDERBOOK_URL_BASE =
  process.env.STOCKBIT_ORDERBOOK_URL?.trim() ||
  'https://exodus.stockbit.com/company-price-feed/v2/orderbook/companies';

export const RUNNING_TRADE_URL =
  process.env.STOCKBIT_RUNNING_TRADE_URL?.trim() ||
  'https://exodus.stockbit.com/order-trade/running-trade';

export const MARKET_DETECTORS_URL_BASE =
  process.env.STOCKBIT_MARKET_DETECTORS_URL?.trim() ||
  'https://exodus.stockbit.com/marketdetectors';

export const KEYSTATS_RATIO_URL_BASE =
  process.env.STOCKBIT_KEYSTATS_RATIO_URL?.trim() ||
  'https://exodus.stockbit.com/keystats/ratio/v1';

/** Base path emitten: `{base}/{ticker}/profile` */
export const EMITTEN_PROFILE_URL_BASE =
  process.env.STOCKBIT_EMITTEN_PROFILE_URL?.trim() ||
  'https://exodus.stockbit.com/emitten';

/** Base chart: `{base}/{ticker}/daily?timeframe=...` */
export const CHART_DAILY_URL_BASE =
  process.env.STOCKBIT_CHART_DAILY_URL?.trim() ||
  'https://exodus.stockbit.com/charts';

export const METRIC_IDS_DOC_URI = 'stockbit://docs/screener-metric-ids';

export const STOCKBIT_SCREENER_METRICS = [
  { id: 3068, name: 'Cash and cash equivalents' },
  { id: 2892, name: 'Market Cap' },
  { id: 1486, name: 'Total Debt (Quarter)' },
  { id: 2896, name: 'Current Price to Book Value' },
  { id: 1461, name: 'Return on Equity (TTM)' },
  { id: 1460, name: 'Return on Assets (TTM)' },
  { id: 3112, name: 'Net Income (Annual)' },
  { id: 13438, name: 'Average (Net Profit Margin 5yr)' },
  { id: 1566, name: '6 Month Price Returns' },
  { id: 1567, name: '1 Year Price Returns' },
  { id: 1568, name: '3 Year Price Returns' },
  { id: 12148, name: 'Current PE Ratio (Annualised)' },
  { id: 16533, name: 'Current Price To Cashflow (TTM)' },
  { id: 15630, name: 'Cash Per Share (Quarter)' },
  { id: 3197, name: 'Net Profit Margin (Annual)(%)' },
  { id: 15881, name: 'Current Price To Free Cashflow (TTM)' },
  { id: 2545, name: 'Cash From Operations (TTM)' },
  { id: 1508, name: 'Debt to Equity Ratio (Quarter)' },
  { id: 13580, name: '1 Month Net Foreign Flow' },
  { id: 3218, name: 'Foreign Flow' },
  { id: 3194, name: 'Net Foreign Buy / Sell' },
  { id: 14400, name: 'Bandar Accum/Dist' },
  { id: 14399, name: 'Bandar Value' },
  { id: 21365, name: 'Net Insider Buy / Sell (3M) (%)' },
  { id: 21366, name: 'Net Insider Buy / Sell (6M) (%)' },
  { id: 13581, name: '3 Month Net Foreign Flow' },
  { id: 2916, name: 'Payout Ratio' },
  { id: 13382, name: 'EPS Rating' },
  { id: 13622, name: 'Previous Price' },
  { id: 16455, name: 'Value MA 50' },
  { id: 12466, name: 'Volume MA 50' },
  { id: 3196, name: 'Operating Profit Margin (Annual)(%)' },
  { id: 2544, name: 'Cash From Investing (TTM)' },
  { id: 2534, name: 'Capital expenditure (TTM)' },
  { id: 1470, name: 'EPS (Quarter YoY Growth)' },
  { id: 13417, name: 'EPS Growth Streak' },
  { id: 1469, name: 'EPS (QoQ Growth) ' },
  { id: 16475, name: 'EPS Growth Streak (Annual)' },
  { id: 21473, name: 'EBITDA (Annual)' },
  { id: 3111, name: 'Revenue (Annual)' },
  { id: 21474, name: 'EBITDA (Quarter)' },
];

export const DEFAULT_STOCKBIT_SCREENER_BODY = {
  name: 'Cash Rich',
  description: 'stock screener',
  save: '0',
  ordertype: 'DESC',
  ordercol: 3,
  page: 1,
  universe: { scope: 'IHSG', scopeID: '0', name: 'IHSG' },
  filters: JSON.parse(
    `[{"type":"compare","item1":3068,"item1name":"Cash and cash equivalents","operator":">=","item2":"2892","item2name":"Market Cap","multiplier":"0.7"},{"type":"basic","item1":2892,"item1name":"Market Cap","operator":">","item2":"1000000000","item2name":"","multiplier":"0"},{"type":"compare","item1":1486,"item1name":"Total Debt (Quarter)","operator":"<","item2":"3068","item2name":"Cash and cash equivalents","multiplier":"0.5"},{"type":"basic","item1":2896,"item1name":"Current Price to Book Value","operator":"<=","item2":"0","item2name":"","multiplier":"0"},{"type":"basic","item1":2896,"item1name":"Current Price to Book Value","operator":">=","item2":"0","item2name":"","multiplier":"0"},{"type":"basic","item1":1461,"item1name":"Return on Equity (TTM)","operator":">=","item2":"0","item2name":"","multiplier":"0"},{"type":"basic","item1":1460,"item1name":"Return on Assets (TTM)","operator":">=","item2":"0","item2name":"","multiplier":"0"},{"type":"basic","item1":3112,"item1name":"Net Income (Annual)","operator":">=","item2":"0","item2name":"","multiplier":"0"},{"type":"basic","item1":13438,"item1name":"Average (Net Profit Margin 5yr)","operator":">=","item2":"0","item2name":"","multiplier":"0"},{"type":"basic","item1":1566,"item1name":"6 Month Price Returns","operator":">=","item2":"0","item2name":"","multiplier":"0"},{"type":"basic","item1":1567,"item1name":"1 Year Price Returns","operator":">=","item2":"0","item2name":"","multiplier":"0"},{"type":"basic","item1":1568,"item1name":"3 Year Price Returns","operator":">=","item2":"0","item2name":"","multiplier":"0"},{"type":"basic","item1":12148,"item1name":"Current PE Ratio (Annualised)","operator":">=","item2":"0","item2name":"","multiplier":"0"},{"type":"basic","item1":16533,"item1name":"Current Price To Cashflow (TTM)","operator":">=","item2":"0","item2name":"","multiplier":"0"},{"type":"basic","item1":15630,"item1name":"Cash Per Share (Quarter)","operator":">=","item2":"0","item2name":"","multiplier":"0"},{"type":"basic","item1":3197,"item1name":"Net Profit Margin (Annual)(%)","operator":">=","item2":"0","item2name":"","multiplier":"0"},{"type":"basic","item1":15881,"item1name":"Current Price To Free Cashflow (TTM)","operator":">=","item2":"1","item2name":"","multiplier":"0"},{"type":"basic","item1":2545,"item1name":"Cash From Operations (TTM)","operator":">=","item2":"1","item2name":"","multiplier":"0"},{"type":"basic","item1":1508,"item1name":"Debt to Equity Ratio (Quarter)","operator":"<=","item2":"1","item2name":"","multiplier":"0"},{"type":"basic","item1":13580,"item1name":"1 Month Net Foreign Flow","operator":">=","item2":"0","item2name":"","multiplier":"0"},{"type":"basic","item1":3218,"item1name":"Foreign Flow","operator":">=","item2":"0","item2name":"","multiplier":"0"},{"type":"basic","item1":3194,"item1name":"Net Foreign Buy / Sell","operator":">=","item2":"0","item2name":"","multiplier":"0"},{"type":"basic","item1":14400,"item1name":"Bandar Accum/Dist","operator":">=","item2":"0","item2name":"","multiplier":"0"},{"type":"basic","item1":14399,"item1name":"Bandar Value","operator":">","item2":"0","multiplier":""},{"type":"basic","item1":21365,"item1name":"Net Insider Buy / Sell (3M) (%)","operator":">","item2":"0","multiplier":""},{"type":"basic","item1":21366,"item1name":"Net Insider Buy / Sell (6M) (%)","operator":">","item2":"0","multiplier":""},{"type":"basic","item1":13581,"item1name":"3 Month Net Foreign Flow","operator":">","item2":"0","multiplier":""},{"type":"basic","item1":13438,"item1name":"Average (Net Profit Margin 5yr)","operator":">","item2":"0","multiplier":""},{"type":"basic","item1":2916,"item1name":"Payout Ratio","operator":">","item2":"0","multiplier":""},{"type":"basic","item1":13382,"item1name":"EPS Rating","operator":">","item2":"0","multiplier":""},{"type":"basic","item1":13622,"item1name":"Previous Price","operator":">","item2":"0","multiplier":""},{"type":"basic","item1":16455,"item1name":"Value MA 50","operator":">","item2":"0","multiplier":""},{"type":"basic","item1":12466,"item1name":"Volume MA 50","operator":">","item2":"0","multiplier":""},{"type":"basic","item1":3196,"item1name":"Operating Profit Margin (Annual)(%)","operator":">","item2":"0","multiplier":""},{"type":"basic","item1":2544,"item1name":"Cash From Investing (TTM)","operator":">","item2":"0","multiplier":""},{"type":"basic","item1":2534,"item1name":"Capital expenditure (TTM)","operator":">","item2":"0","multiplier":""},{"type":"basic","item1":1470,"item1name":"EPS (Quarter YoY Growth)","operator":">","item2":"0","multiplier":""},{"type":"basic","item1":13417,"item1name":"EPS Growth Streak","operator":">","item2":"0","multiplier":""},{"type":"basic","item1":1469,"item1name":"EPS (QoQ Growth) ","operator":">","item2":"0","multiplier":""},{"type":"basic","item1":16475,"item1name":"EPS Growth Streak (Annual)","operator":">","item2":"0","multiplier":""},{"type":"basic","item1":21473,"item1name":"EBITDA (Annual)","operator":">","item2":"0","multiplier":""},{"type":"basic","item1":3111,"item1name":"Revenue (Annual)","operator":">","item2":"0","multiplier":""},{"type":"basic","item1":21474,"item1name":"EBITDA (Quarter)","operator":">","item2":"0","multiplier":""}]`
  ),
  sequence:
    '3068,2892,1486,2896,1461,1460,3112,13438,1566,1567,1568,12148,16533,15630,3197,15881,2545,1508,13580,3218,3194,14400,14399,21365,21366,13581,2916,13382,13622,16455,12466,3196,2544,2534,1470,13417,1469,16475,21473,3111,21474',
  screenerid: '0',
  type: 'TEMPLATE_TYPE_CUSTOM',
};

export function getScreenerMetricIdsText() {
  const lines = [
    'Referensi item1 (ID metrik) Stockbit screener Indonesia — dari request Postman yang valid.',
    'PENTING: 2892 = Market Cap. PB / Price to Book = 2896 (bukan 2892). PE = 12148.',
    'item1name di filter sebaiknya sama persis dengan kolom "name" di bawah supaya UI Stockbit konsisten.',
    '',
    ...STOCKBIT_SCREENER_METRICS.map((m) => `${m.id}\t${m.name}`),
    '',
    'compare: item2 sering berisi string ID metrik lain (mis. bandingkan kas vs market(cap) pakai item2 "2892").',
    'basic: item2 string nilai numerik (mis. "<=","10" untuk batas).',
    'Daftar tidak lengkap: metrik lain bisa dicopy dari Network tab Stockbit saat simpan screener di web.',
  ];
  return lines.join('\n');
}
