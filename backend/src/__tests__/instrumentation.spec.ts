// Crash-safety guard for instrumentation.ts (Phase 16 re-review CR-01 regression): this
// module is loaded via `node --require` before main.ts on every production process
// (monolith and notifications-service), so any exception it throws at import time is
// fatal to the whole process before the app's own error handling ever runs.
// OTEL_EXPORTER_OTLP_ENDPOINT is optional/observability-only and not guaranteed to be
// set in every environment — it must never be able to take down request-serving or
// notification-sending processes. No TestingModule/class mock — this is a bare
// process.env + module-reload assertion (same "No Analog Found" pattern as
// backend/src/prisma/__tests__/prisma-config.spec.ts; see 16-PATTERNS.md).
describe('instrumentation.ts OTLP endpoint handling', () => {
  const prevEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  const prevToken = process.env.GRAFANA_CLOUD_OTLP_TOKEN;

  afterEach(() => {
    if (prevEndpoint === undefined) delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    else process.env.OTEL_EXPORTER_OTLP_ENDPOINT = prevEndpoint;
    if (prevToken === undefined) delete process.env.GRAFANA_CLOUD_OTLP_TOKEN;
    else process.env.GRAFANA_CLOUD_OTLP_TOKEN = prevToken;
  });

  it('does not throw when OTEL_EXPORTER_OTLP_ENDPOINT is unset', () => {
    jest.resetModules();
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    delete process.env.GRAFANA_CLOUD_OTLP_TOKEN;
    expect(() => require('../instrumentation')).not.toThrow();
  });

  it('does not throw when OTEL_EXPORTER_OTLP_ENDPOINT is set', () => {
    jest.resetModules();
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'https://otlp-gateway-prod-us-east-0.grafana.net/otlp';
    process.env.GRAFANA_CLOUD_OTLP_TOKEN = 'dGVzdA==';
    expect(() => require('../instrumentation')).not.toThrow();
  });
});
