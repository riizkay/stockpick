import {
  METRIC_IDS_DOC_URI,
  getScreenerMetricIdsText,
} from '../shared/config.js';

export function registerScreenerMetricIdsResource(mcpServer) {
  mcpServer.registerResource(
    'screener-metric-ids',
    METRIC_IDS_DOC_URI,
    {
      title: 'ID metrik screener Stockbit',
      description:
        'Tabel item1 id + nama dari request Postman; hindari menebak id metrik.',
      mimeType: 'text/plain; charset=utf-8',
    },
    async () => ({
      contents: [
        {
          uri: METRIC_IDS_DOC_URI,
          text: getScreenerMetricIdsText(),
        },
      ],
    })
  );
}
