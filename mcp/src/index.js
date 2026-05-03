// Server MCP Stockbit (stdio). Di-spawn dari API: node + path ini — env STOCKBIT_* diwariskan dari proses API (bukan file .env MCP saja).
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { METRIC_IDS_DOC_URI } from './shared/config.js';
import { registerScreenerMetricIdsResource } from './resources/screener-metric-ids.js';
import { registerStockbitGetScreenerMetricIds } from './tools/stockbit-get-screener-metric-ids.js';
import { registerStockbitRunScreener } from './tools/stockbit-run-screener.js';
import { registerStockbitGetOrderbook } from './tools/stockbit-get-orderbook.js';
import { registerStockbitGetRunningTrade } from './tools/stockbit-get-running-trade.js';
import { registerStockbitGetBandarmology } from './tools/stockbit-get-bandarmology.js';
import { registerStockbitGetKeystats } from './tools/stockbit-get-keystats.js';
import { registerStockbitGetProfile } from './tools/stockbit-get-profile.js';
import { registerStockbitGetChartSummary } from './tools/stockbit-get-chart-summary.js';
import { registerStockbitLiveMoneyflowAccumulationAnalysis } from './tools/stockbit-live-moneyflow-accumulation-analysis.js';

const mcpServer = new McpServer(
  {
    name: 'stockbit-screener',
    version: '1.0.0',
  },
  {
    instructions: `Server Stockbit: screener, order book, running trade, bandarmology, keystats, profil emiten, chart ringkas, analisis money flow dari running trade. Screener: sebelum menyusun filters, panggil stockbit_get_screener_metric_ids atau baca resource ${METRIC_IDS_DOC_URI}. ID metrik tidak intuitif (2892 = Market Cap, PB = 2896, PE = 12148). Aturan payload screener (operator, urutan sort, body vs wire) lengkapnya ada di deskripsi tool stockbit_run_screener + schema input — ikuti itu. Order book: stockbit_get_orderbook + ticker; compact=true untuk ringkasan + depth. Running trade: stockbit_get_running_trade + ticker (sort/limit/order_by opsional; compact=true untuk baris normalisasi). Money flow / akumulasi: stockbit_live_moneyflow_accumulation_analysis + ticker (date, days_back, limit; signal STRONG|EARLY|NEUTRAL_ACTIVITY|DISTRIBUTION|LOW_LIQUIDITY|NO_SIGNAL, confidence, reasoning[], features, llm_summary). Bandarmology: stockbit_get_bandarmology + ticker (market detectors; compact=true memotong broker). Keystats: stockbit_get_keystats + ticker (GET keystats/ratio/v1; year_limit opsional; compact=true tanpa financial_year_parent). Profil: stockbit_get_profile + ticker (GET emitten/.../profile; compact=true ringkas). Chart: stockbit_get_chart_summary (overall/segments/key_events bernama eksplisit + how_to_read).`,
  }
);

registerScreenerMetricIdsResource(mcpServer);
registerStockbitGetScreenerMetricIds(mcpServer);
registerStockbitRunScreener(mcpServer);
registerStockbitGetOrderbook(mcpServer);
registerStockbitGetRunningTrade(mcpServer);
registerStockbitGetBandarmology(mcpServer);
registerStockbitGetKeystats(mcpServer);
registerStockbitGetProfile(mcpServer);
registerStockbitGetChartSummary(mcpServer);
registerStockbitLiveMoneyflowAccumulationAnalysis(mcpServer);

async function main() {
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
