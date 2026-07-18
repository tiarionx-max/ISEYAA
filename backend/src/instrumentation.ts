// CRITICAL: loaded via --require BEFORE main.ts; do NOT import NestJS modules here
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';

const OTLP_BASE = process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? '';
const otlpAuthHeader = {
  Authorization: `Basic ${process.env.GRAFANA_CLOUD_OTLP_TOKEN ?? ''}`,
};

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({
    url: `${OTLP_BASE}/v1/traces`,
    headers: otlpAuthHeader,
  }),
  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({
      url: `${OTLP_BASE}/v1/metrics`,
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
