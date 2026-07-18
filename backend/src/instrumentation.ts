// CRITICAL: loaded via --require BEFORE main.ts; do NOT import NestJS modules here
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';

// OTLP_BASE stays undefined (not '') when unset, so the exporters fall back to the
// OTel SDK's own env-based URL resolution instead of constructing an invalid relative
// URL that throws synchronously at --require time, before main.ts ever runs.
const OTLP_BASE = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
const otlpAuthHeader = {
  Authorization: `Basic ${process.env.GRAFANA_CLOUD_OTLP_TOKEN ?? ''}`,
};

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({
    url: OTLP_BASE ? `${OTLP_BASE}/v1/traces` : undefined,
    headers: otlpAuthHeader,
  }),
  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({
      url: OTLP_BASE ? `${OTLP_BASE}/v1/metrics` : undefined,
      headers: otlpAuthHeader,
    }),
    exportIntervalMillis: 30000,
  }),
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start();

process.on('SIGTERM', () => {
  sdk.shutdown().finally(() => process.exit(0));
});
