# Phase 2: Infrastructure Migration - Research

**Researched:** 2026-05-12
**Domain:** Cloud infrastructure migration (Neon + Upstash + R2 + Railway + Infisical + Grafana), NestJS microservices with gRPC, Typesense search
**Confidence:** MEDIUM-HIGH (stack is well-documented; microservices decomposition sequencing is ASSUMED)

---

## Summary

Phase 2 migrates a working NestJS modular monolith from a local dev stack (PostgreSQL + Redis + AWS S3 + EventEmitter2) to a production-ready free-first cloud stack while simultaneously decomposing it into independent microservices that communicate via gRPC. This is the most architecturally complex phase of the entire roadmap — it touches every layer of the system simultaneously.

The migration has two independent axes that must be sequenced carefully: (1) the **infrastructure swap** (Neon, Upstash, R2, Infisical, Grafana), which can be done without breaking the REST API; and (2) the **decomposition** (gRPC microservices), which restructures how services communicate internally. The safest approach is to complete the infrastructure swap first on the existing monolith, validate it works end-to-end, then decompose into microservices.

The highest-risk item is the Prisma migration baseline — the project has been using `prisma db push --accept-data-loss` with 3 migration files that partially represent the schema. A baseline migration must be generated from the current schema state and marked as applied on Neon before any future schema changes occur. This process is well-documented but must be done exactly right or production data migration history will be corrupted.

**Primary recommendation:** Migrate infrastructure layer-by-layer on the monolith first (Neon → Upstash → R2 → Infisical → Grafana), deploy as a single Railway service to validate the full stack, then decompose into microservices in a second wave. Do NOT attempt simultaneous infrastructure + decomposition.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| REST API gateway (external clients) | API / Backend | — | REST remains the external surface; NestJS HTTP adapter stays |
| Inter-service communication | API / Backend (gRPC) | — | gRPC is internal-only; clients never speak gRPC |
| Database (all domain data) | Database / Storage (Neon) | — | PostgreSQL 16 via Prisma; Neon is a hosted PG |
| Session / OTP / JWT blacklist | API / Backend (Upstash Redis) | — | Ephemeral KV; ioredis connects via TLS URL |
| File storage (images, QR, docs) | CDN / Static (Cloudflare R2) | API / Backend | R2 via S3-compatible SDK; CDN serves files |
| Event bus (payment events) | API / Backend (Upstash Kafka) | — | Replaces EventEmitter2; SASL/SCRAM auth |
| Secrets management | API / Backend (Infisical) | Railway env vars | CLI inject at container start |
| Observability (traces/metrics/logs) | API / Backend (OTel → Grafana) | — | SDK initialized before NestJS bootstrap |
| Search (attractions/events/stays/products) | API / Backend (Typesense) | — | Self-hosted on Railway; federated multi-search |
| Microservice deployment | CDN / Static (Railway Docker) | — | One Railway service per microservice |

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| INFRA-01 | Developer can run `prisma migrate` against Neon serverless PostgreSQL 16 in both dev and production branches | Neon requires `DATABASE_URL` (pooled) + `DIRECT_URL` (direct) in Prisma schema; baseline procedure documented |
| INFRA-02 | All Redis operations (cache, sessions, rate limiting, queues) run against Upstash Redis with zero idle cost | Upstash Redis supports ioredis via TLS URL; `REDIS_URL` format works with existing `ioredis` client |
| INFRA-03 | All file uploads write to Cloudflare R2 with zero egress; existing S3 SDK calls require no logic change | R2 uses same `@aws-sdk/client-s3`; only endpoint + region (`auto`) + credentials change |
| INFRA-04 | All microservices deploy as Docker containers on Railway with auto-deploy from GitHub main branch | Railway detects Dockerfiles; watch paths prevent cross-service rebuilds; monorepo support confirmed |
| INFRA-05 | All secrets stored in Infisical and injected at runtime; no .env files in repo | Infisical CLI `infisical run --` wraps container start command; `INFISICAL_TOKEN` from Railway env |
| INFRA-06 | Grafana Cloud receives OTel traces, metrics, logs; Sentry captures unhandled errors | OTel SDK must be initialized before NestJS bootstrap via `--require`; OTLP HTTP exporter for Grafana Cloud |
| INFRA-07 | NestJS monolith decomposed into independent microservices each with own Dockerfile and Railway service | Strangler-fig approach; hybrid app pattern (HTTP + gRPC in same process during transition) |
| INFRA-08 | Microservices communicate via gRPC (proto in `packages/proto`); REST remains external API | `@nestjs/microservices` 11.x; `@grpc/grpc-js` 1.14.x; `ts-proto` for TypeScript generation |
| INFRA-09 | Upstash Kafka replaces EventEmitter2 for cross-service payment events | KafkaJS with SASL/SCRAM-SHA-256; `@upstash/kafka` or direct kafkajs with Upstash credentials |
| INFRA-10 | Typesense indexes attractions, events, properties, products; results < 100ms with geo-ranking | Typesense 3.x; `typesense` npm 3.0.6; self-hosted on Railway with persistent volume |
| SEARCH-01 | Unified search bar with typo tolerance across attractions/events/properties/products | Typesense `multiSearch.perform()` across 4 collections in single request |
| SEARCH-02 | Attractions and properties support geo-ranking (closest first) from user location | Typesense `geopoint` field type + `filter_by location:(lat,lng, radius km)` + `sort_by location(lat,lng):asc` |
| SEARCH-03 | Search returns results within 100ms for indexes up to 100,000 documents | Typesense is designed for < 50ms; 100ms target is achievable on Railway with persistent volume |
</phase_requirements>

---

## Standard Stack

### Core Infrastructure Packages

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@nestjs/microservices` | 11.1.19 | gRPC transport, ClientsModule, GrpcMethod | Official NestJS; required for Transport.GRPC |
| `@grpc/grpc-js` | 1.14.3 | gRPC runtime (pure JavaScript, no native deps) | Official Google; replaces `grpc` native package |
| `@grpc/proto-loader` | 0.8.1 | Loads .proto files at runtime | Required peer of grpc-js |
| `ts-proto` | 2.11.8 | Generates TypeScript from .proto files | `--nestJs=true` flag generates NestJS-compatible interfaces |
| `prisma` | 7.8.0 | ORM + migration CLI | Already in use; locked upgrade path |
| `@prisma/client` | 7.8.0 | Type-safe database client | Already in use |
| `typesense` | 3.0.6 | Typesense JavaScript/TypeScript client | Official Typesense client |

### Supporting Infrastructure Packages

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@opentelemetry/sdk-node` | 0.217.0 | OTel SDK for Node.js auto-instrumentation | Initialize before NestJS in instrumentation.ts |
| `@opentelemetry/auto-instrumentations-node` | 0.75.0 | Auto-patches http, pg, redis, express | Used with `--require ./instrumentation.ts` |
| `@opentelemetry/exporter-trace-otlp-http` | 0.217.0 | Sends traces to Grafana Cloud OTLP endpoint | Grafana Cloud uses `http/protobuf` protocol |
| `@sentry/nestjs` | 10.52.0 | Sentry error tracking for NestJS | Replaces non-existent error tracking in monolith |
| `kafkajs` | latest | Kafka client with SASL/SCRAM-SHA-256 support | Upstash Kafka uses KafkaJS-compatible API |
| `@infisical/sdk` | 5.0.2 | Infisical Node.js SDK (alternative to CLI) | Use CLI approach for Railway (simpler) |

### Version Verification

All versions verified against npm registry on 2026-05-12: [VERIFIED: npm registry]
- `prisma`: 7.8.0 (latest stable)
- `@nestjs/microservices`: 11.1.19 (latest stable)
- `@grpc/grpc-js`: 1.14.3 (latest stable)
- `@grpc/proto-loader`: 0.8.1 (latest stable)
- `ts-proto`: 2.11.8 (latest stable)
- `typesense`: 3.0.6 (latest stable)
- `@opentelemetry/sdk-node`: 0.217.0 (latest stable)
- `@opentelemetry/auto-instrumentations-node`: 0.75.0 (latest stable)
- `@sentry/nestjs`: 10.52.0 (latest stable)

**Installation (new packages only — existing ioredis and @aws-sdk/client-s3 remain):**
```bash
cd backend
npm install @nestjs/microservices @grpc/grpc-js @grpc/proto-loader ts-proto typesense kafkajs @opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node @opentelemetry/exporter-trace-otlp-http @sentry/nestjs
```

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `kafkajs` (direct) | `@upstash/kafka` HTTP client | `@upstash/kafka` is HTTP-based (better for serverless/edge); `kafkajs` uses TCP (better for long-running server processes). Railway containers are long-running → `kafkajs` is correct choice |
| `@grpc/proto-loader` (runtime load) | `ts-proto` (compile-time) | `proto-loader` loads at runtime (no codegen step); `ts-proto` generates full TypeScript types. Both work; `ts-proto --nestJs=true` gives better DX. Use both: proto-loader for runtime, ts-proto for types |
| Typesense self-hosted | Typesense Cloud | Self-hosted = free; Cloud = $25+/mo. Self-hosted on Railway ~$5-10/mo with persistent volume |
| `@infisical/sdk` (code) | `infisical run --` (CLI) | CLI approach is simpler for Railway (inject before process start); SDK approach good for dynamic secret rotation |

---

## Architecture Patterns

### System Architecture Diagram (Target State)

```
External Clients (Web + Mobile + Admin)
         │ HTTPS REST /api/v1/*
         ▼
┌─────────────────────────────────────┐
│   API Gateway Service               │
│   (NestJS HTTP — Railway service 1) │
│   port 3001                         │
│   Infisical secrets injected        │
│   OTel instrumented                 │
└────────────────┬────────────────────┘
                 │ gRPC (internal Railway private network)
    ┌────────────┼────────────────────────┐
    ▼            ▼                        ▼
┌────────┐ ┌──────────┐           ┌────────────┐
│ Auth   │ │ Wallet   │   ...     │ AI Service │
│Service │ │Service   │           │Service     │
│gRPC    │ │gRPC      │           │gRPC        │
└────────┘ └──────────┘           └────────────┘
    │            │                        │
    └────────────┴────────────────────────┘
                 │ (all services share)
    ┌────────────┼──────────────────────────────┐
    ▼            ▼                              ▼
┌────────┐ ┌──────────┐              ┌──────────────┐
│ Neon   │ │ Upstash  │              │ Typesense    │
│(PG 16) │ │ Redis    │              │(Railway svc) │
└────────┘ └──────────┘              └──────────────┘
                 │
         ┌───────┴────────┐
         ▼                ▼
┌──────────────┐ ┌──────────────────┐
│ Cloudflare   │ │ Upstash Kafka    │
│ R2 (files)   │ │ (payment events) │
└──────────────┘ └──────────────────┘
                        │
               Kafka consumers in:
               Wallet, Events, Stays,
               Marketplace services
```

### Recommended Project Structure (Post-Decomposition)

```
backend/
├── apps/
│   ├── api-gateway/       # HTTP REST + gRPC clients — public API
│   ├── auth-service/      # gRPC server — auth, OTP, JWT
│   ├── wallet-service/    # gRPC server — wallet, escrow, KYC tiers
│   ├── events-service/    # gRPC server — events, tickets
│   ├── stays-service/     # gRPC server — properties, bookings
│   ├── marketplace-service/ # gRPC server — vendors, products, orders
│   ├── admin-service/     # gRPC server — KPIs, approvals
│   ├── ai-service/        # gRPC server — Claude AI, itineraries
│   └── notifications-service/ # gRPC server — FCM push
packages/
├── proto/                 # .proto files + ts-proto generated types
│   ├── auth.proto
│   ├── wallet.proto
│   ├── events.proto
│   └── ...
└── shared/                # existing shared TypeScript types (unchanged)
```

Note: This is the **Phase 2 end state**. Implementation should start with the monolith approach (all services in one process) then extract.

### Pattern 1: Neon + Prisma Dual-URL Configuration (INFRA-01)

**What:** Prisma requires two connection strings with Neon — one pooled (app runtime) and one direct (migrations/CLI).
**When to use:** Always when running on Neon with Prisma.

```prisma
// backend/prisma/schema.prisma — updated datasource block
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")   // pooled: ep-xxx-pooler.neon.tech
  directUrl = env("DIRECT_URL")     // direct: ep-xxx.neon.tech (no -pooler)
}
```

```bash
# Environment variables (from Neon dashboard)
DATABASE_URL="postgresql://user:pass@ep-xxx-pooler.us-east-2.aws.neon.tech/iseyaa?sslmode=require"
DIRECT_URL="postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/iseyaa?sslmode=require"
```

**Source:** [CITED: neon.com/docs/guides/prisma]

### Pattern 2: Prisma Baseline Migration (INFRA-01)

**What:** Convert the existing `prisma db push` database history to proper migration history without destroying data.
**When to use:** One-time operation before the first `prisma migrate deploy` on Neon.

```bash
# Step 1: Generate baseline SQL from current schema against the Neon DB
npx prisma migrate diff \
  --from-empty \
  --to-schema-datamodel backend/prisma/schema.prisma \
  --script > backend/prisma/migrations/0_baseline/migration.sql

# Step 2: Mark it as applied (do NOT run it — Neon DB already has these tables)
npx prisma migrate resolve --applied 0_baseline

# Step 3: Verify
npx prisma migrate status
```

**CRITICAL:** The existing 3 migration files (`20260511*`) may conflict. They should be archived/removed and replaced with the single 0_baseline migration that reflects the current full schema state. [CITED: prisma.io/docs/orm/prisma-migrate/workflows/baselining]

### Pattern 3: Cloudflare R2 via AWS S3 SDK (INFRA-03)

**What:** R2 is S3-compatible — only the S3Client constructor changes. Upload logic is identical.
**When to use:** Drop-in replacement for existing `S3Service`.

```typescript
// backend/src/common/services/s3.service.ts — only constructor changes
this.s3 = new S3Client({
  region: 'auto',  // MUST be 'auto' for R2, not 'af-south-1'
  endpoint: `https://${config.get('CF_ACCOUNT_ID')}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: config.get<string>('R2_ACCESS_KEY_ID', ''),
    secretAccessKey: config.get<string>('R2_SECRET_ACCESS_KEY', ''),
  },
});
// All PutObjectCommand, GetObjectCommand calls are identical — no changes needed
```

New env vars: `CF_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL` (Cloudflare R2 public URL or custom domain).

**CDN note:** Replace `AWS_CLOUDFRONT_URL` with `R2_PUBLIC_URL`. Cloudflare R2 public buckets or custom domains serve files; presigned URLs use the `r2.cloudflarestorage.com` domain (not custom domain). [CITED: developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/]

### Pattern 4: Upstash Redis via ioredis TLS (INFRA-02)

**What:** Upstash Redis supports ioredis TCP connections via a `rediss://` TLS URL. No code changes to `RedisService` needed.
**When to use:** Drop-in replacement for existing ioredis client.

```typescript
// backend/src/redis/redis.service.ts — update constructor only
// Instead of host/port/password, use REDIS_URL
onModuleInit() {
  this.client = new Redis(this.config.get('REDIS_URL')); // rediss://default:password@host:port
  // OR keep existing approach:
  this.client = new Redis({
    host: this.config.get('REDIS_HOST'),   // xxx.upstash.io
    port: this.config.get<number>('REDIS_PORT', 6379),
    password: this.config.get('REDIS_PASSWORD'),
    tls: {},  // required for Upstash TLS
    lazyConnect: true,
  });
}
```

New env vars: `REDIS_URL` (e.g. `rediss://default:xxx@xxx.upstash.io:6379`) OR `REDIS_HOST` + `REDIS_PORT` + `REDIS_PASSWORD`.

**Note:** Upstash free tier supports up to 10,000 commands/day, 256MB storage, and single region. [ASSUMED — verify on Upstash pricing page]

### Pattern 5: Upstash Kafka via KafkaJS (INFRA-09)

**What:** Replace EventEmitter2's in-process emit/subscribe with KafkaJS producing to and consuming from Upstash Kafka.
**When to use:** Cross-service payment events after microservices decomposition.

```typescript
// Producer (in WebhooksService, replaces eventEmitter.emit())
import { Kafka } from 'kafkajs';

const kafka = new Kafka({
  brokers: [process.env.KAFKA_BROKER_URL],
  sasl: {
    mechanism: 'scram-sha-256',
    username: process.env.KAFKA_USERNAME,
    password: process.env.KAFKA_PASSWORD,
  },
  ssl: true,
});

const producer = kafka.producer();
await producer.send({
  topic: 'payment.charge_success',
  messages: [{ value: JSON.stringify({ reference, metadata, amount }) }],
});
```

```typescript
// Consumer (in WalletService, replaces @OnEvent('payment.*'))
const consumer = kafka.consumer({ groupId: 'wallet-service' });
await consumer.subscribe({ topic: 'payment.charge_success' });
await consumer.run({
  eachMessage: async ({ message }) => {
    const payload = JSON.parse(message.value.toString());
    // handle payment event
  },
});
```

New env vars: `KAFKA_BROKER_URL`, `KAFKA_USERNAME`, `KAFKA_PASSWORD`. [CITED: upstash Kafka docs via reetesh.in article]

**Migration path:** During transition, keep EventEmitter2 locally and add Kafka publishing in parallel. Remove EventEmitter2 only after all consumers are on Kafka.

### Pattern 6: NestJS Hybrid App (HTTP + gRPC) (INFRA-08)

**What:** Each microservice runs both an HTTP server (for REST API gateway) and a gRPC listener. External clients only hit HTTP; services call each other over gRPC.
**When to use:** The gateway service keeps both; internal services run gRPC-only (no HTTP).

```typescript
// main.ts for the API gateway (keeps HTTP REST + adds gRPC client)
const app = await NestFactory.create(AppModule);
const grpcMicroservice = app.connectMicroservice<MicroserviceOptions>({
  transport: Transport.GRPC,
  options: {
    package: 'auth',
    protoPath: join(__dirname, '../../../packages/proto/auth.proto'),
    url: '0.0.0.0:5001',  // internal gRPC port
  },
});
await app.startAllMicroservices();
await app.listen(3001);
```

```typescript
// main.ts for an internal microservice (gRPC only — no HTTP)
const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
  transport: Transport.GRPC,
  options: {
    package: 'wallet',
    protoPath: join(__dirname, '../../../packages/proto/wallet.proto'),
    url: '0.0.0.0:5002',
  },
});
await app.listen();
```

[CITED: docs.nestjs.com/microservices/grpc, docs.nestjs.com/faq/hybrid-application]

### Pattern 7: gRPC Client in NestJS Module (INFRA-08)

**What:** Inject a gRPC client into a service so it can call another microservice.

```typescript
// In a module that needs to call wallet-service
@Module({
  imports: [
    ClientsModule.register([{
      name: 'WALLET_PACKAGE',
      transport: Transport.GRPC,
      options: {
        package: 'wallet',
        protoPath: join(__dirname, '../../../packages/proto/wallet.proto'),
        url: process.env.WALLET_SERVICE_URL || 'wallet-service:5002',
      },
    }]),
  ],
})
```

```typescript
// In the service
@Injectable()
export class PaymentService {
  constructor(
    @Inject('WALLET_PACKAGE')
    private readonly client: ClientGrpc,
  ) {}

  onModuleInit() {
    this.walletService = this.client.getService<WalletService>('WalletService');
  }

  async creditWallet(walletId: string, amount: number) {
    return this.walletService.credit({ walletId, amount }).toPromise();
  }
}
```

[CITED: docs.nestjs.com/microservices/grpc]

### Pattern 8: Proto File Structure (INFRA-08)

```protobuf
// packages/proto/wallet.proto
syntax = "proto3";
package wallet;

service WalletService {
  rpc Credit (CreditRequest) returns (CreditResponse);
  rpc Debit (DebitRequest) returns (DebitResponse);
  rpc GetBalance (BalanceRequest) returns (BalanceResponse);
}

message CreditRequest {
  string wallet_id = 1;
  double amount = 2;
  string reference = 3;
  string description = 4;
}

message CreditResponse {
  bool success = 1;
  double new_balance = 2;
}
```

```bash
# Generate TypeScript types from proto files
npx ts-proto \
  --plugin=./node_modules/.bin/protoc-gen-ts_proto \
  --ts_proto_out=packages/proto/generated \
  --ts_proto_opt=nestJs=true \
  --ts_proto_opt=outputServices=grpc-js \
  packages/proto/*.proto
```

[CITED: github.com/stephenh/ts-proto — ts_proto_opt=nestJs=true flag]

### Pattern 9: Typesense Collection + Federated Search (INFRA-10, SEARCH-01, SEARCH-02)

```typescript
// TypesenseService initialization
import Typesense from 'typesense';

const client = new Typesense.Client({
  nodes: [{
    host: process.env.TYPESENSE_HOST,  // Typesense Railway service hostname
    port: 8108,
    protocol: 'http',
  }],
  apiKey: process.env.TYPESENSE_API_KEY,
  connectionTimeoutSeconds: 2,
});

// Collection schema — attractions (with geopoint for SEARCH-02)
const attractionsSchema = {
  name: 'attractions',
  fields: [
    { name: 'id',          type: 'string' },
    { name: 'name',        type: 'string' },
    { name: 'description', type: 'string', optional: true },
    { name: 'category',    type: 'string', facet: true },
    { name: 'lga_id',      type: 'string', facet: true },
    { name: 'location',    type: 'geopoint' },
  ],
  default_sorting_field: 'name',
};
```

```typescript
// Unified federated search (SEARCH-01)
const results = await client.multiSearch.perform({
  searches: [
    { collection: 'attractions', q: query, query_by: 'name,description' },
    { collection: 'events',      q: query, query_by: 'title,description' },
    { collection: 'properties',  q: query, query_by: 'name,description' },
    { collection: 'products',    q: query, query_by: 'name,description' },
  ]
}, {});
```

```typescript
// Geo-ranked search (SEARCH-02)
const results = await client.collections('attractions').documents().search({
  q: '*',
  query_by: 'name,description',
  filter_by: `location:(${userLat}, ${userLng}, 50 km)`,
  sort_by: `location(${userLat}, ${userLng}):asc`,
});
```

[CITED: typesense.org/docs/30.2/api/federated-multi-search.md, typesense.org/docs/30.2/api/geosearch.md]

### Pattern 10: OpenTelemetry Initialization (INFRA-06)

**CRITICAL: OTel SDK MUST be initialized before NestJS loads any module.**

```typescript
// backend/src/instrumentation.ts — loaded before main.ts
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
    headers: {
      Authorization: `Basic ${process.env.GRAFANA_CLOUD_OTLP_TOKEN}`,
    },
  }),
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start();
```

```json
// package.json start command — must use --require
"start:prod": "node --require ./dist/instrumentation.js dist/main.js"
```

[CITED: dev.to/siisee11/nestjs-opentelemetry-grafana-cloud-328f]

### Pattern 11: Infisical Secrets Injection (INFRA-05)

```dockerfile
# backend/Dockerfile — production version
FROM node:20-alpine
# Install Infisical CLI
RUN apk add --no-cache curl && \
    curl -1sLf 'https://dl.cloudsmith.io/public/infisical/infisical-cli/setup.alpine.sh' | sh && \
    apk add infisical

WORKDIR /app
COPY . .
RUN npm ci --only=production
RUN npx prisma generate

# Start with Infisical injecting secrets
CMD ["infisical", "run", "--projectId", "<PROJECT_ID>", "--env", "production", "--", "node", "--require", "./dist/instrumentation.js", "dist/main.js"]
```

Railway env vars needed: `INFISICAL_TOKEN` (machine identity token from Infisical dashboard). [CITED: infisical.com/docs/integrations/platforms/docker]

### Pattern 12: Railway Monorepo Multi-Service Deployment (INFRA-04)

Each microservice in the monorepo becomes a separate Railway service:
- Set **Root Directory** to the service folder (e.g., `backend/apps/auth-service`)
- Or configure **Watch Paths** to only trigger redeploy on changes to that service's files
- Each service gets its own Dockerfile

```toml
# backend/apps/auth-service/railway.toml (optional)
[build]
dockerfilePath = "Dockerfile"

[deploy]
watchPaths = ["backend/apps/auth-service/**", "backend/prisma/**", "packages/proto/**"]
```

[CITED: docs.railway.com/guides/monorepo]

### Anti-Patterns to Avoid

- **Starting decomposition before infrastructure migration:** Mixing two axes of change simultaneously dramatically increases failure surface. Infrastructure first, decomposition second.
- **Using `prisma db push` on Neon:** This wipes migration history. Always use `prisma migrate deploy` in production and `prisma migrate dev` locally.
- **Initializing OTel after NestJS bootstrap:** Auto-instrumentation of HTTP/pg/redis won't work because the patches need to be applied before the modules are imported.
- **Using `@upstash/kafka` HTTP client for long-running server processes:** `@upstash/kafka` is designed for serverless edge functions. KafkaJS with Upstash credentials is the correct approach for Railway-hosted NestJS services.
- **Setting R2 region to anything other than `'auto'`:** R2 silently ignores the region field but some SDK versions reject non-standard region names. `'auto'` is the R2-specified value.
- **Connecting gRPC services over public internet:** Railway private networking allows services in the same project to communicate via internal hostnames (e.g., `wallet-service.railway.internal:5002`). Always use internal URLs for gRPC.
- **Hardcoding proto paths:** Use `join(__dirname, '../../packages/proto/xxx.proto')` with absolute path from `__dirname` — relative paths break after Docker WORKDIR changes.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Search with typo tolerance | Custom fuzzy search | Typesense | BK-tree distance, prefix indexing, geo — dozens of edge cases |
| gRPC service discovery | Custom URL registry | Railway internal DNS | Railway services resolve by service name automatically |
| Secret rotation | Custom vault | Infisical | Encryption at rest, audit logs, RBAC, SOC2 |
| Distributed tracing | Custom trace IDs | OpenTelemetry | Propagation across gRPC + HTTP requires W3C TraceContext headers |
| Kafka schema validation | Custom message format | Proto + ts-proto | Protobuf binary encoding + compile-time type safety |
| Connection pooling | Manual pool logic | Neon PgBouncer + Prisma | Neon provides up to 10,000 concurrent connections via built-in PgBouncer |

**Key insight:** Every item in this table represents a problem that has subtle distributed-systems edge cases (network partitions, clock skew, partial failures). The libraries handle these; custom solutions inevitably don't.

---

## Common Pitfalls

### Pitfall 1: Prisma Migration Conflict (Existing 3 Migrations vs Baseline)

**What goes wrong:** The existing 3 migration files in `backend/prisma/migrations/` were created from `prisma db push` sessions. They partially represent the schema but may not match the current state exactly. Running `prisma migrate deploy` with these files against Neon will fail if the schema drift between files and actual DB state is large.

**Why it happens:** `prisma db push --accept-data-loss` doesn't record migrations — it just applies schema changes directly. The 3 migration files may have been created during early development and the schema diverged.

**How to avoid:** 
1. Run `prisma migrate diff --from-migrations-directory backend/prisma/migrations --to-schema-datamodel backend/prisma/schema.prisma` to check for drift
2. Archive the existing 3 files
3. Create a fresh `0_baseline` migration from `--from-empty` as described in Pattern 2
4. Mark it applied on Neon
5. From this point forward, all schema changes go through `prisma migrate dev`

**Warning signs:** `prisma migrate status` shows "Database schema is not in sync with migration history" or migration fails with "relation already exists"

### Pitfall 2: OTel SDK Initialization Order

**What goes wrong:** Traces are missing or incomplete; `pg`, `redis`, and `http` spans don't appear in Grafana Cloud.

**Why it happens:** NestJS loads modules when `NestFactory.create()` is called. If OTel SDK starts after that, the auto-instrumentation patches have already missed their window — modules are already imported with the un-patched versions.

**How to avoid:** Always initialize OTel via `--require ./instrumentation.js` before the NestJS `main.js` entry point. Never call `sdk.start()` inside `bootstrap()`.

**Warning signs:** Traces appear in Grafana but show no child spans for database queries or HTTP calls.

### Pitfall 3: Neon Connection Exhaustion in Serverless-Spiky Load

**What goes wrong:** Under burst load, Neon returns "connection limit exceeded" errors despite PgBouncer.

**Why it happens:** PgBouncer transaction-mode pooling doesn't support prepared statements by default. Prisma 5.11.x uses prepared statements by default in Node.js. When running with the pooled URL, prepared statement mode conflicts with PgBouncer transaction mode.

**How to avoid:** Add `?pgbouncer=true&connection_limit=1` to the pooled `DATABASE_URL`. This tells Prisma to disable prepared statements when using pgBouncer.

```
DATABASE_URL="postgresql://...ep-xxx-pooler.neon.tech/iseyaa?sslmode=require&pgbouncer=true&connection_limit=1"
```

[CITED: neon.com/docs/connect/connection-pooling]

### Pitfall 4: gRPC Proto Path After Docker Build

**What goes wrong:** NestJS crashes at startup with "proto file not found" in the Docker container.

**Why it happens:** The proto files at `packages/proto/` are outside the `backend/` Docker build context if the Dockerfile only COPYs the `backend/` directory.

**How to avoid:** Set Docker build context to the **monorepo root**, not `backend/`. The Dockerfile should be at the root or `backend/` Dockerfile should include the parent context.

```dockerfile
# backend/Dockerfile — build from repo root context
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
COPY backend/ ./backend/
COPY packages/ ./packages/   # <-- include proto files
COPY shared/ ./shared/
RUN npm install
RUN cd backend && npx prisma generate
```

**Warning signs:** Works locally, fails in Railway deployment.

### Pitfall 5: Cloudflare R2 Presigned URLs with Custom Domains

**What goes wrong:** Presigned URLs return 403 Forbidden when accessed via a custom domain.

**Why it happens:** R2 presigned URLs are signed against the `r2.cloudflarestorage.com` endpoint. If the CDN/public URL uses a custom domain, the signature doesn't match.

**How to avoid:** For file uploads (server-side via `PutObjectCommand`), return the custom domain URL from `S3Service.upload()`. For presigned upload URLs (client-side), always use the `r2.cloudflarestorage.com` endpoint.

**Warning signs:** Presigned upload URLs 403; direct server upload works fine.

### Pitfall 6: Kafka Consumer Group ID Conflicts

**What goes wrong:** Multiple microservice replicas on Railway consume the same Kafka message, processing payment events multiple times.

**Why it happens:** If all instances of a service share the same `groupId`, messages are load-balanced among them (correct). But if different service types accidentally share a `groupId`, one service "steals" messages meant for another.

**How to avoid:** Use service-scoped group IDs: `wallet-service-prod`, `events-service-prod`, `stays-service-prod`. Never use generic names like `consumers` or `payments`.

### Pitfall 7: Typesense Index Persistence on Railway Restart

**What goes wrong:** All indexed documents disappear after Railway redeploys or restarts the Typesense service.

**Why it happens:** Typesense stores its index in `--data-dir`. If Railway does not mount a persistent volume, this directory is ephemeral.

**How to avoid:** When deploying Typesense on Railway, add a persistent volume mounted at `/data`. Configure Typesense with `--data-dir=/data`. Railway templates for Typesense include this by default. Also run a re-indexing task after any schema collection changes. [CITED: railway.com/deploy/typesense-latest]

### Pitfall 8: Infisical CLI Not Found at Container Start

**What goes wrong:** Docker container fails to start with "infisical: command not found".

**Why it happens:** The Infisical CLI must be installed in the Docker image before the `CMD` can use it.

**How to avoid:** Install via Alpine package or curl during Docker build. Alternatively, use the `INFISICAL_TOKEN` environment variable in Railway and call the Infisical API from the app at startup using `@infisical/sdk` instead of the CLI.

---

## Code Examples

### Verified: NestJS gRPC Method Handler

```typescript
// Source: docs.nestjs.com/microservices/grpc
@Controller()
export class WalletController {
  @GrpcMethod('WalletService', 'Credit')
  async credit(data: CreditRequest, metadata: Metadata): Promise<CreditResponse> {
    const result = await this.walletService.creditWallet(
      data.walletId,
      data.amount,
      data.reference,
      data.description,
    );
    return { success: true, newBalance: result.balance };
  }
}
```

### Verified: Typesense Federated Search

```typescript
// Source: typesense.org/docs/30.2/api/federated-multi-search.md
const results = await client.multiSearch.perform({
  searches: [
    { collection: 'attractions', q: userQuery, query_by: 'name,description' },
    { collection: 'events',      q: userQuery, query_by: 'title,description' },
    { collection: 'properties',  q: userQuery, query_by: 'name,description' },
    { collection: 'products',    q: userQuery, query_by: 'name,description' },
  ]
}, { per_page: 5 });
```

### Verified: Typesense Geo Search

```typescript
// Source: typesense.org/docs/30.2/api/geosearch.md
const nearbyAttractions = await client.collections('attractions').documents().search({
  q: '*',
  query_by: 'name',
  filter_by: `location:(${lat}, ${lng}, 50 km)`,
  sort_by: `location(${lat}, ${lng}):asc`,
});
```

### Verified: Prisma Baseline Command

```bash
# Source: prisma.io/docs/orm/prisma-migrate/workflows/baselining
npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma \
  --script > prisma/migrations/0_baseline/migration.sql

npx prisma migrate resolve --applied 0_baseline
```

### Verified: R2 S3Client Configuration

```typescript
// Source: developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/
new S3Client({
  region: 'auto',
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId, secretAccessKey },
})
```

---

## Migration Sequence (Critical — Follow This Order)

The following order minimizes risk. Each step can be validated before proceeding to the next.

**Wave 1: Infrastructure Swap (Monolith Stays Intact)**
1. Provision Neon DB → copy schema → run baseline migration → switch `DATABASE_URL`
2. Provision Upstash Redis → update `REDIS_URL` + add `tls: {}` → smoke test auth
3. Provision Cloudflare R2 → update S3Service constructor → test file upload
4. Set up Infisical → migrate all secrets → configure Railway env vars
5. Set up Grafana Cloud → add OTel SDK → deploy instrumented monolith to Railway
6. Deploy Typesense to Railway (separate service) → create collections → index existing data
7. Add `/api/v1/search` endpoint → validate federated search + geo-ranking

**Wave 2: Event Bus Migration**
8. Set up Upstash Kafka → create topics (`payment.charge_success`, `payment.escrow_released`, `payment.order_delivered`)
9. Add Kafka producer to `WebhooksService` (alongside EventEmitter2 — dual write)
10. Add Kafka consumers to feature services (wallet, events, stays, marketplace)
11. Validate Kafka consumers process events correctly
12. Remove EventEmitter2 from payment flows

**Wave 3: Microservices Decomposition**
13. Create `packages/proto/` with proto files for each service
14. Run `ts-proto` codegen, publish types as workspace package
15. Extract first service (recommend: `auth-service` — well-isolated)
16. Deploy as separate Railway service, validate gRPC communication
17. Extract remaining services in dependency order: wallet → events → stays → marketplace → admin → ai
18. Update API gateway to call all services via gRPC
19. Remove direct service imports from monolith

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `grpc` npm package (native bindings) | `@grpc/grpc-js` (pure JS) | 2021 | No native compilation issues; works on Alpine Docker |
| Separate `DATABASE_URL` + `SHADOW_DATABASE_URL` + `DIRECT_URL` for Neon | Just `DATABASE_URL` (pooled) + `DIRECT_URL` | 2024 (Neon + Prisma 5.10+) | Simpler setup; shadow DB auto-managed |
| Manual OTel setup per instrumentation | `@opentelemetry/auto-instrumentations-node` | 2023 | Auto-patches http, pg, redis, grpc |
| `prisma migrate dev` creates shadow DB externally | Shadow DB created via `DROP DATABASE WITH (FORCE)` | Prisma 5.10.0 | Works with Neon's managed roles |

**Deprecated/Outdated:**
- `grpc` native package: Deprecated; replaced by `@grpc/grpc-js`
- Infisical CLI `infisical init` + `.infisical.json` commit: The `.infisical.json` file is being replaced by machine identity tokens; don't commit project config to repo
- Typesense `nestjs-typesense` community module: Not actively maintained; use `typesense` npm client directly with a custom NestJS provider

---

## Runtime State Inventory

> This is a cloud migration phase. Inventory covers what must change in running systems, not just files.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | PostgreSQL on local Docker: all 20 models, seed data (20 LGAs, 61 attractions) | Data export from local PG → import to Neon; Prisma baseline migration |
| Live service config | Upstash Redis: new empty instance (no existing data to migrate) | OTP state and JWT blacklist start fresh (acceptable — tokens expire naturally) |
| OS-registered state | No Windows Task Scheduler / systemd / launchd entries detected | None |
| Secrets/env vars | 20 env vars in `.env` / `.env.example` (AWS keys, DB URL, Redis, etc.) | Migrate ALL to Infisical; update Railway service env to only set `INFISICAL_TOKEN` |
| Build artifacts | `backend/Dockerfile.dev` (dev-only); no production Dockerfile exists yet | Create `backend/Dockerfile` (production) for each microservice |
| S3 media files | AWS S3 bucket `iseyaa-media-dev` — existing uploaded files | Migrate existing S3 objects to Cloudflare R2 using `rclone` or AWS S3 → R2 migration tool |
| Prisma migrations | 3 existing migration files (`20260511*`) that may have schema drift | Archive → replace with `0_baseline` migration as described in Pattern 2 |

**S3 → R2 data migration:** Existing media files in `iseyaa-media-dev` (S3) must be copied to the R2 bucket. Use:
```bash
aws s3 sync s3://iseyaa-media-dev r2://iseyaa-media --endpoint-url https://<CF_ACCOUNT_ID>.r2.cloudflarestorage.com
```
All `MediaContent.url` records in Postgres must be updated to use the R2/CDN base URL after migration.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Backend runtime | ✓ | >=20.0.0 | — |
| npm | Package management | ✓ | >=10.0.0 | — |
| Docker | Railway deployment | ✓ (in CI/CD) | — | — |
| Neon account | INFRA-01 | ✗ | — | Must provision before Wave 1 |
| Upstash Redis account | INFRA-02 | ✗ | — | Must provision before Wave 1 |
| Cloudflare R2 account | INFRA-03 | ✗ | — | Must provision before Wave 1 |
| Railway account | INFRA-04 | ✗ | — | Must provision before Wave 1 |
| Infisical account | INFRA-05 | ✗ | — | Must provision before Wave 1 |
| Grafana Cloud account | INFRA-06 | ✗ | — | Must provision before Wave 1 |
| Upstash Kafka account | INFRA-09 | ✗ | — | Must provision before Wave 2 |
| protoc (Proto compiler) | INFRA-08 | [ASSUMED] ✗ | — | Install via `brew install protobuf` or `apt-get install protobuf-compiler` |

**Missing dependencies with no fallback (must be provisioned):**
- Neon, Upstash Redis, Cloudflare R2, Railway, Infisical, Grafana Cloud, Upstash Kafka accounts

**Note:** All free tiers are available at time of research. Verify free tier limits before provisioning. [ASSUMED — verify current free tier limits]

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest 29.7.x + ts-jest 29.1.x |
| Config file | `backend/jest.config.ts` |
| Quick run command | `npm run test -- --testPathPattern=<module>` |
| Full suite command | `npm run test` (153 tests, 11 suites) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INFRA-01 | Prisma migrates against Neon without error | Integration (manual) | `npx prisma migrate status` | ❌ Wave 0 — add migration status check script |
| INFRA-02 | Upstash Redis OTP set/get/del round-trip | Unit (mock) | `npm run test -- --testPathPattern=redis` | ❌ Wave 0 — add RedisService spec |
| INFRA-03 | R2 file upload returns URL with R2 domain | Unit (mock S3Client) | `npm run test -- --testPathPattern=s3` | ❌ Wave 0 — add S3Service spec |
| INFRA-05 | No .env files committed to repo | CI check | `git ls-files .env*` returns only `.env.example` | ❌ Wave 0 — add CI script |
| INFRA-06 | OTel traces appear in Grafana Cloud | Smoke (manual) | Check Grafana Cloud Explore | — |
| INFRA-08 | gRPC method returns correct response | Unit | `npm run test -- --testPathPattern=grpc` | ❌ Wave 0 — per service |
| INFRA-09 | Kafka consumer processes payment event | Integration (mock) | `npm run test -- --testPathPattern=kafka` | ❌ Wave 0 — add KafkaService spec |
| INFRA-10 | Typesense returns results < 100ms | Smoke (manual) | `curl -w %{time_total} localhost:8108/collections/attractions/documents/search?q=*` | — |
| SEARCH-01 | Federated search returns results from all 4 collections | Integration | `npm run test -- --testPathPattern=search` | ❌ Wave 0 — add SearchService spec |
| SEARCH-02 | Geo-ranked results ordered by distance | Integration | Same test, verify order | ❌ Wave 0 — same file |
| SEARCH-03 | Search latency < 100ms | Performance | Manual or k6 | — |

### Sampling Rate
- **Per task commit:** Run affected module tests only
- **Per wave merge:** `npm run test` — all 153 existing tests must still pass
- **Phase gate:** Full suite green + smoke tests pass before Phase 3

### Wave 0 Gaps
- [ ] `backend/src/redis/__tests__/redis.service.spec.ts` — covers INFRA-02
- [ ] `backend/src/common/services/__tests__/s3.service.spec.ts` — covers INFRA-03
- [ ] `backend/src/search/__tests__/search.service.spec.ts` — covers SEARCH-01, SEARCH-02
- [ ] `.github/workflows/check-no-env.yml` — covers INFRA-05 CI gate
- [ ] Production `Dockerfile` at `backend/Dockerfile` — covers INFRA-04

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Infisical machine identity; JWT strategy unchanged |
| V3 Session Management | yes | Upstash Redis JWT blacklist; same patterns as Sprint 1 |
| V4 Access Control | yes | gRPC method-level auth; pass JWT/user context in gRPC metadata |
| V5 Input Validation | yes | Proto field types enforce basic types; service-level class-validator DTOs |
| V6 Cryptography | yes | Upstash Redis TLS required; Kafka SASL/TLS required; Neon SSL required |

### Known Threat Patterns for This Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Secret leakage via committed .env | Information Disclosure | Infisical + CI check for .env files |
| gRPC internal service spoofing | Spoofing | Railway private networking limits access to same-project services only |
| Kafka message tampering | Tampering | Proto binary encoding + Upstash SASL authentication |
| R2 presigned URL abuse | Spoofing | Short expiry (15-min max); sign only specific object keys |
| Typesense admin API exposure | Elevation of Privilege | Use read-only search API key for frontend; admin key server-side only |
| OTel trace data exfiltration | Information Disclosure | Sanitize PII (phone numbers, BVN) before spans; use `SpanProcessor` to filter |

**Phase 2 security items to address:**
1. Gate Swagger UI behind `APP_ENV !== 'production'` check (flagged in CONCERNS.md) — must be done before Railway deployment
2. Migrate `PAYSTACK_SECRET_KEY` and all secrets from `.env` to Infisical
3. gRPC metadata must propagate `userId` and `role` from HTTP request context for authorization checks in internal services

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Upstash Redis free tier supports sufficient commands/day for dev traffic | Standard Stack | Could hit rate limit; upgrade to $10/mo plan |
| A2 | Railway private networking allows gRPC communication between services in same project | Architecture Patterns (Pattern 6) | Services may need explicit private network config; verify in Railway docs |
| A3 | `protoc` compiler is not currently installed on developer machine | Environment Availability | Slight delay to install; no blocking issue |
| A4 | Existing S3 bucket `iseyaa-media-dev` has a manageable number of files for migration | Runtime State Inventory | Large S3 bucket could require extended migration time |
| A5 | Upstash Kafka free tier supports sufficient throughput for dev payment events | Standard Stack | Could hit message limit; upgrade to paid plan |
| A6 | Railway allows persistent volumes on the starter plan | Environment Availability | Typesense data loss on restart if volumes not available on free tier |
| A7 | The existing 3 Prisma migration files can be safely archived and replaced with 0_baseline | Common Pitfalls (Pitfall 1) | If Neon DB was provisioned from the 3 files, their history needs careful cross-checking |

---

## Open Questions

1. **Is the Neon DB being provisioned fresh or migrated from local Docker?**
   - What we know: Local dev uses `postgres:16-alpine` via Docker Compose with seed data
   - What's unclear: Whether the production Neon DB should be seeded from scratch (clean) or migrated from local (with existing data)
   - Recommendation: New Neon DB with baseline migration + seed script; don't migrate local dev data to production
   - **RESOLVED: Neon fresh provision. Prisma baseline migration generated from existing schema and marked as applied on Neon. No local dev data migrated to production.**

2. **Which microservices decompose first?**
   - What we know: Phase 2 requires all services (auth, wallet, events, stays, marketplace, admin, ai) decomposed
   - What's unclear: Whether decomposing all at once is expected or a sequential extraction
   - Recommendation: Sequential extraction starting with `auth-service` (most isolated); validate each before extracting next
   - **RESOLVED: Sequential as planned. Order: auth-service (Plan 08), wallet-service (Plan 08), events-service (Plan 09), stays-service + marketplace-service (Plan 09b), admin-service + ai-service (Plan 10), notifications-service (Plan 10b).**

3. **Does Infisical need to be self-hosted on Railway or can it use Infisical Cloud?**
   - What we know: Railway has a one-click Infisical self-hosted template; Infisical Cloud has a free tier
   - What's unclear: Project policy on third-party SaaS for secrets (government project — may require self-hosted)
   - Recommendation: Infisical Cloud free tier for MVP; self-hosted for production if compliance requires
   - **RESOLVED: Infisical Cloud acceptable for MVP. Revisit self-hosting post-launch if CBN compliance requires on-premises secrets management.**

4. **What is the Typesense indexing strategy — full re-index on deploy or incremental?**
   - What we know: Typesense data is lost if volume not mounted; existing Postgres data needs to be indexed
   - What's unclear: Whether indexing should happen via a one-time migration script or a post-startup hook
   - Recommendation: One-time indexing migration script; also add Prisma middleware hooks to sync on create/update
   - **RESOLVED: Full re-index on first deploy via SearchIndexerService.onModuleInit() with idempotency guard (skips if any collection has > 0 documents). Incremental indexing via Prisma middleware hooks deferred to Phase 3+.**

---

## Sources

### Primary (HIGH confidence)
- [CITED: neon.com/docs/guides/prisma] — Prisma dual-URL configuration, pooled vs direct
- [CITED: developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/] — R2 S3Client configuration
- [CITED: prisma.io/docs/orm/prisma-migrate/workflows/baselining] — Baseline migration procedure
- [CITED: typesense.org/docs/30.2/api/federated-multi-search.md] — Multi-collection search
- [CITED: typesense.org/docs/30.2/api/geosearch.md] — Geo search filter_by + sort_by
- [CITED: docs.nestjs.com/microservices/grpc — via Context7 /nestjs/docs.nestjs.com] — gRPC patterns, ClientsModule, GrpcMethod, hybrid app
- [CITED: infisical.com/docs/integrations/platforms/docker] — CLI injection pattern
- [CITED: railway.com/deploy/typesense-latest] — Typesense Railway deployment with persistent volume

### Secondary (MEDIUM confidence)
- [CITED: reetesh.in/blog/kafka-integration-in-node.js-with-upstash-kafka] — KafkaJS + Upstash SASL config (verified against Upstash docs structure)
- [CITED: dev.to/siisee11/nestjs-opentelemetry-grafana-cloud-328f] — OTel init order requirement
- [CITED: neon.com/docs/connect/connection-pooling] — pgbouncer=true param for Prisma

### Tertiary (LOW confidence — flag for validation)
- [ASSUMED] Upstash Redis/Kafka free tier limits
- [ASSUMED] Railway private networking gRPC support without additional config
- [ASSUMED] protoc not installed on developer machine

---

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — all versions verified via npm registry
- Neon + Prisma: HIGH — official Neon docs fetched
- R2 migration: HIGH — official Cloudflare docs fetched
- gRPC patterns: HIGH — Context7 NestJS docs
- Typesense: HIGH — official Typesense docs
- Upstash Redis ioredis: MEDIUM — indirect confirmation via community sources
- Upstash Kafka: MEDIUM — configuration from third-party blog confirmed against KafkaJS docs
- Railway monorepo: MEDIUM — docs fetched but Dockerfile-per-service specifics are ASSUMED
- Infisical: MEDIUM — CLI pattern confirmed; SDK pattern ASSUMED
- OTel + Grafana: MEDIUM — community article confirmed, not official NestJS docs
- Migration sequencing: LOW/ASSUMED — based on general microservices best practice

**Research date:** 2026-05-12
**Valid until:** 2026-06-12 (30 days — stable ecosystem, but Neon and Railway iterate quickly)
