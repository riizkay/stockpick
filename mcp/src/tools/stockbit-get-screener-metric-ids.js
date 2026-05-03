import {
  METRIC_IDS_DOC_URI,
  STOCKBIT_SCREENER_METRICS,
  getScreenerMetricIdsText,
} from '../shared/config.js';

export function registerStockbitGetScreenerMetricIds(mcpServer) {
  mcpServer.registerTool(
    'stockbit_get_screener_metric_ids',
    {
      description:
        'Daftar ID metrik (item1) + nama untuk Stockbit screener /exodus/templates. Panggil ini dulu sebelum stockbit_run_screener agar tidak salah id (mis. PB = 2896 bukan 2892).',
      inputSchema: {},
    },
    async () => ({
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              metrics: STOCKBIT_SCREENER_METRICS,
              hints: {
                marketCapId: 2892,
                pbId: 2896,
                peAnnualisedId: 12148,
                doc: METRIC_IDS_DOC_URI,
              },
              plainText: getScreenerMetricIdsText(),
            },
            null,
            2
          ),
        },
      ],
    })
  );
}
