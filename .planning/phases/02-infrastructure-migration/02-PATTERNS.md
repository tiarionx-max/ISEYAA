# Phase 2: Infrastructure Migration - Pattern Map

**Mapped:** 2026-05-12
**Files analyzed:** 15 new/modified files
**Analogs found:** 12 / 15

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `backend/prisma/schema.prisma` | config | CRUD | `backend/prisma/schema.prisma` (self — datasource block only) | self-modify |
| `backend/prisma/migrations/0_baseline/migration.sql` | migration | batch | existing `backend/prisma/migrations/20260511*` files | role-match |
| `backend/src/common/services/s3.service.ts` | service | file-I/O | `backend/src/common/services/s3.service.ts` (self — constructor only) | self-modify |
| `backend/src/redis/redis.service.ts` | service | request-response | `backend/src/redis/redis.service.ts` (self — constructor only) | self-modify |
| `backend/src/instrumentation.ts` | utility | event-driven | `backend/src/main.ts` (bootstrap entry point analog) | partial |
| `backend/src/main.ts` | config | request-response | `backend/src/main.ts` (self — add gRPC connectMicroservice) | self-modify |
| `backend/src/app.module.ts` | config | request-response | `backend/src/app.module.ts` (self — add new modules) | self-modify |
| `backend/src/search/search.service.ts` | service | request-response | `backend/src/modules/notifications/notifications.service.ts` | role-match |
| `backend/src/search/search.module.ts` | config | request-response | `backend/src/redis/redis.module.ts` | role-match |
| `backend/src/kafka/kafka.service.ts` | service | event-driven | `backend/src/modules/webhooks/webhooks.service.ts` | partial |
| `backend/src/kafka/kafka.module.ts` | config | event-driven | `backend/src/redis/redis.module.ts` | role-match |
| `packages/proto/auth.proto` | config | request-response | none (no proto files in codebase) | no-analog |
| `packages/proto/wallet.proto` | config | request-response | none (no proto files in codebase) | no-analog |
| `backend/Dockerfile` | config | batch | `backend/Dockerfile.dev` | role-match |
| `backend/railway.toml` | config | batch | `docker-compose.yml` (deployment config analog) | partial |

---

## Pattern Assignments

### `backend/prisma/schema.prisma` (config, datasource modification)

**Analog:** Self-modification — only the `datasource db` block changes.

**Current datasource pattern** (`backend/prisma/schema.prisma`, lines 1-8):
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

**Replace with Neon dual-URL pattern** (INFRA-01):
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")   // pooled: ep-xxx-pooler.neon.tech?pgbouncer=true&connection_limit=1
  directUrl = env("DIRECT_URL")     // direct: ep-xxx.neon.tech (no -pooler, for migrations)
}
```

**Environment variable change:**
```bash
# Add to .env / Infisical:
DATABASE_URL="postgresql://user:pass@ep-xxx-pooler.us-east-2.aws.neon.tech/iseyaa?sslmode=require&pgbouncer=true&connection_limit=1"
DIRECT_URL="postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/iseyaa?sslmode=require"
```

---

### `backend/prisma/migrations/0_baseline/migration.sql` (migration, batch)

**Analog:** No direct code analog — this is a one-time generated SQL file.

**Generation command pattern** (from RESEARCH.md Pattern 2):
```bash
# Run from monorepo root after switching DATABASE_URL to Neon DIRECT_URL
npx prisma migrate diff \
  --from-empty \
  --to-schema-datamodel backend/prisma/schema.prisma \
  --script > backend/prisma/migrations/0_baseline/migration.sql

# Mark applied (do NOT run it — Neon DB already has tables from above step)
npx prisma migrate resolve --applied 0_baseline

# Verify
npx prisma migrate status
```

**Pre-condition:** Archive or remove existing `backend/prisma/migrations/20260511*` files before running this.

---

### `backend/src/common/services/s3.service.ts` (service, file-I/O — R2 migration)

**Analog:** Self — `backend/src/common/services/s3.service.ts` (lines 1-45, full file already in context)

**Constructor change only** (replace lines 13-24 of current file):
```typescript
// BEFORE (AWS S3):
constructor(private config: ConfigService) {
  this.bucket = config.get<string>('AWS_S3_BUCKET', 'iseyaa-media-dev');
  this.cdnBase = config.get<string>('AWS_CLOUDFRONT_URL', '');
  this.region = config.get<string>('AWS_REGION', 'af-south-1');
  this.s3 = new S3Client({
    region: this.region,
    credentials: {
      accessKeyId: config.get<string>('AWS_ACCESS_KEY_ID', ''),
      secretAccessKey: config.get<string>('AWS_SECRET_ACCESS_KEY', ''),
    },
  });
}

// AFTER (Cloudflare R2 — only the constructor changes; upload() is identical):
constructor(private config: ConfigService) {
  this.bucket = config.get<string>('R2_BUCKET', 'iseyaa-media');
  this.cdnBase = config.get<string>('R2_PUBLIC_URL', '');
  this.s3 = new S3Client({
    region: 'auto',  // MUST be 'auto' for R2 — not 'af-south-1'
    endpoint: `https://${config.get('CF_ACCOUNT_ID')}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.get<string>('R2_ACCESS_KEY_ID', ''),
      secretAccessKey: config.get<string>('R2_SECRET_ACCESS_KEY', ''),
    },
  });
}
```

**URL return in upload() stays the same pattern** (lines 37-39 unchanged):
```typescript
return this.cdnBase
  ? `${this.cdnBase}/${key}`
  : `https://<CF_ACCOUNT_ID>.r2.cloudflarestorage.com/${this.bucket}/${key}`;
```

**New env vars:** `CF_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL`
**Remove env vars:** `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET`, `AWS_REGION`, `AWS_CLOUDFRONT_URL`

---

### `backend/src/redis/redis.service.ts` (service, request-response — Upstash migration)

**Analog:** Self — `backend/src/redis/redis.service.ts` (lines 1-59, full file in context)

**Constructor change only** (replace lines 12-21 of current file):
```typescript
// BEFORE (local Redis — host/port/password):
onModuleInit() {
  this.client = new Redis({
    host: this.config.get('REDIS_HOST', 'localhost'),
    port: this.config.get<number>('REDIS_PORT', 6379),
    password: this.config.get('REDIS_PASSWORD') || undefined,
    lazyConnect: true,
  });
  this.client.on('error', (err) => this.logger.error('Redis error', err));
  this.client.connect().catch((err) => this.logger.error('Redis connect failed', err));
}

// AFTER (Upstash Redis — TLS URL preferred; fallback to host/port + tls: {}):
onModuleInit() {
  const redisUrl = this.config.get<string>('REDIS_URL');
  if (redisUrl) {
    // Upstash provides a single TLS URL: rediss://default:xxx@xxx.upstash.io:6379
    this.client = new Redis(redisUrl);
  } else {
    this.client = new Redis({
      host: this.config.get('REDIS_HOST', 'localhost'),
      port: this.config.get<number>('REDIS_PORT', 6379),
      password: this.config.get('REDIS_PASSWORD') || undefined,
      tls: {},      // required for Upstash TLS when not using URL
      lazyConnect: true,
    });
  }
  this.client.on('error', (err) => this.logger.error('Redis error', err));
}
```

All other methods (`get`, `set`, `del`, `exists`, `ttl`, `incr`, `expire`) are **unchanged**.

**New env var:** `REDIS_URL=rediss://default:xxx@xxx.upstash.io:6379`

---

### `backend/src/instrumentation.ts` (utility, event-driven — new file)

**Analog:** `backend/src/main.ts` (lines 1-41) — bootstrap entry point pattern; same `ConfigService`-free pattern since OTel must load before NestJS.

**Imports pattern (copy from RESEARCH.md Pattern 10):**
```typescript
// backend/src/instrumentation.ts
// CRITICAL: This file must be loaded via --require BEFORE main.ts
// Do NOT import NestJS modules here — OTel must patch before NestJS loads

import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
```

**Core initialization pattern:**
```typescript
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
process.on('SIGTERM', () => {
  sdk.shutdown().finally(() => process.exit(0));
});
```

**package.json start command change:**
```json
"start:prod": "node --require ./dist/instrumentation.js dist/main.js"
```

**New env vars:** `OTEL_EXPORTER_OTLP_ENDPOINT`, `GRAFANA_CLOUD_OTLP_TOKEN`

---

### `backend/src/main.ts` (config, request-response — gRPC + Sentry addition)

**Analog:** Self — `backend/src/main.ts` (lines 1-41, full file in context)

**Existing imports + new additions** (lines 1-8 become):
```typescript
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';  // NEW
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import * as Sentry from '@sentry/nestjs';                                 // NEW
import helmet from 'helmet';
import * as compression from 'compression';
import { join } from 'path';                                              // NEW
import { AppModule } from './app.module';
```

**Sentry init before bootstrap** (add before line 9):
```typescript
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.APP_ENV ?? 'development',
});
```

**Swagger gate (security fix — gate behind non-prod):**
```typescript
// Replace unconditional SwaggerModule.setup() with:
if (config.get('APP_ENV') !== 'production') {
  const swaggerConfig = new DocumentBuilder()
    .setTitle('ISEYAA API')
    .setDescription('Ogun State Digital Super-Platform — REST API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swaggerConfig));
}
```

**gRPC hybrid app addition** (add before `app.listen(port)`):
```typescript
// During Wave 3 decomposition — connect gRPC microservice listener
// Monolith phase: skip this block; add service by service during decomposition
app.connectMicroservice<MicroserviceOptions>({
  transport: Transport.GRPC,
  options: {
    package: 'auth',
    protoPath: join(__dirname, '../../../packages/proto/auth.proto'),
    url: '0.0.0.0:5001',
  },
});
await app.startAllMicroservices();
```

---

### `backend/src/search/search.service.ts` (service, request-response — new file)

**Analog:** `backend/src/modules/notifications/notifications.service.ts` (lines 1-45, full file in context) — same pattern: `@Injectable()` service wrapping an external SDK client initialized in constructor, with `Logger`, `ConfigService`, try/catch error handling that degrades gracefully.

**Imports pattern** (copy structure from `notifications.service.ts` lines 1-5):
```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Typesense from 'typesense';
```

**Constructor pattern** (copy structure from `notifications.service.ts` lines 7-14):
```typescript
@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);
  private readonly client: Typesense.Client;

  constructor(private config: ConfigService) {
    this.client = new Typesense.Client({
      nodes: [{
        host: config.get<string>('TYPESENSE_HOST', 'localhost'),
        port: 8108,
        protocol: config.get<string>('TYPESENSE_PROTOCOL', 'http'),
      }],
      apiKey: config.get<string>('TYPESENSE_API_KEY', ''),
      connectionTimeoutSeconds: 2,
    });
  }
```

**Error handling pattern** (copy from `notifications.service.ts` lines 33-44):
```typescript
  async search(query: string, userLat?: number, userLng?: number) {
    try {
      const results = await this.client.multiSearch.perform({
        searches: [
          { collection: 'attractions', q: query, query_by: 'name,description' },
          { collection: 'events',      q: query, query_by: 'title,description' },
          { collection: 'properties',  q: query, query_by: 'name,description' },
          { collection: 'products',    q: query, query_by: 'name,description' },
        ],
      }, {});
      return results;
    } catch (err) {
      this.logger.error('Typesense search failed', err);
      return { results: [] };  // degrade gracefully — same pattern as notifications.service.ts:40-42
    }
  }
```

**New env vars:** `TYPESENSE_HOST`, `TYPESENSE_API_KEY`, `TYPESENSE_PROTOCOL`

---

### `backend/src/search/search.module.ts` (config, request-response — new file)

**Analog:** `backend/src/redis/redis.module.ts` (lines 1-9, full file in context) — `@Global()` module that exports a single service.

**Copy this exact pattern** (`backend/src/redis/redis.module.ts` lines 1-9):
```typescript
import { Global, Module } from '@nestjs/common';
import { SearchService } from './search.service';

@Global()
@Module({
  providers: [SearchService],
  exports: [SearchService],
})
export class SearchModule {}
```

---

### `backend/src/kafka/kafka.service.ts` (service, event-driven — new file)

**Analog:** `backend/src/modules/webhooks/webhooks.service.ts` (lines 1-77, full file in context) — handles event-driven message flow with `Logger`, `ConfigService`, async operations, and `@OnEvent()`-like handlers. Also analog to `ai.service.ts` for the pattern of initializing an external SDK client in the constructor.

**Imports pattern** (combine `webhooks.service.ts` lines 1-5 style with Kafka SDK):
```typescript
import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Producer, Consumer } from 'kafkajs';
```

**Constructor + lifecycle pattern** (copy from `redis.service.ts` lines 6-21 lifecycle pattern):
```typescript
@Injectable()
export class KafkaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaService.name);
  private readonly kafka: Kafka;
  private producer: Producer;

  constructor(private config: ConfigService) {
    this.kafka = new Kafka({
      brokers: [config.get<string>('KAFKA_BROKER_URL', '')],
      sasl: {
        mechanism: 'scram-sha-256',
        username: config.get<string>('KAFKA_USERNAME', ''),
        password: config.get<string>('KAFKA_PASSWORD', ''),
      },
      ssl: true,
    });
    this.producer = this.kafka.producer();
  }

  async onModuleInit() {
    await this.producer.connect();
    this.logger.log('Kafka producer connected');
  }

  async onModuleDestroy() {
    await this.producer.disconnect();
  }
```

**Producer pattern** (replaces `eventEmitter.emit()` from `webhooks.service.ts` lines 32-45):
```typescript
  async emit(topic: string, payload: Record<string, unknown>): Promise<void> {
    try {
      await this.producer.send({
        topic,
        messages: [{ value: JSON.stringify(payload) }],
      });
    } catch (err) {
      this.logger.error(`Kafka emit failed for topic ${topic}`, err.message);
      throw err;  // rethrow — same pattern as s3.service.ts:41
    }
  }
```

**Consumer pattern** (parallel to `@OnEvent()` handler pattern in `events.service.ts`):
```typescript
  async consume(
    topic: string,
    groupId: string,
    handler: (payload: Record<string, unknown>) => Promise<void>,
  ): Promise<void> {
    const consumer: Consumer = this.kafka.consumer({ groupId });
    await consumer.connect();
    await consumer.subscribe({ topic });
    await consumer.run({
      eachMessage: async ({ message }) => {
        try {
          const payload = JSON.parse(message.value.toString());
          await handler(payload);
        } catch (err) {
          this.logger.error(`Kafka consumer error on topic ${topic}`, err.message);
        }
      },
    });
  }
```

**New env vars:** `KAFKA_BROKER_URL`, `KAFKA_USERNAME`, `KAFKA_PASSWORD`

---

### `backend/src/kafka/kafka.module.ts` (config, event-driven — new file)

**Analog:** `backend/src/redis/redis.module.ts` (lines 1-9) — same `@Global()` pattern.

```typescript
import { Global, Module } from '@nestjs/common';
import { KafkaService } from './kafka.service';

@Global()
@Module({
  providers: [KafkaService],
  exports: [KafkaService],
})
export class KafkaModule {}
```

---

### `packages/proto/auth.proto` and `packages/proto/wallet.proto` (config, request-response — new files)

**Analog:** No proto files exist in the codebase. Use RESEARCH.md Pattern 8 directly.

**Proto file structure pattern** (from RESEARCH.md Pattern 8):
```protobuf
syntax = "proto3";
package auth;

service AuthService {
  rpc ValidateToken (ValidateTokenRequest) returns (ValidateTokenResponse);
  rpc GetUser (GetUserRequest) returns (GetUserResponse);
}

message ValidateTokenRequest {
  string token = 1;
}

message ValidateTokenResponse {
  bool valid = 1;
  string user_id = 2;
  string role = 3;
}

message GetUserRequest {
  string user_id = 1;
}

message GetUserResponse {
  string id = 1;
  string email = 2;
  string role = 3;
  string status = 4;
}
```

**NestJS gRPC method handler pattern** (from RESEARCH.md Code Examples):
```typescript
// In the service controller
@Controller()
export class AuthGrpcController {
  @GrpcMethod('AuthService', 'ValidateToken')
  async validateToken(data: ValidateTokenRequest, metadata: Metadata): Promise<ValidateTokenResponse> {
    const user = await this.authService.validateJwt(data.token);
    return { valid: !!user, userId: user?.id ?? '', role: user?.role ?? '' };
  }
}
```

**ClientsModule registration pattern** (for services calling auth-service):
```typescript
ClientsModule.register([{
  name: 'AUTH_PACKAGE',
  transport: Transport.GRPC,
  options: {
    package: 'auth',
    protoPath: join(__dirname, '../../../packages/proto/auth.proto'),
    url: process.env.AUTH_SERVICE_URL || 'auth-service.railway.internal:5001',
  },
}])
```

---

### `backend/Dockerfile` (config, batch — production Dockerfile, new file)

**Analog:** `backend/Dockerfile.dev` (lines 1-9, full file in context) — same base image and structure, different CMD and build steps.

**Dev Dockerfile pattern** (`backend/Dockerfile.dev` lines 1-9):
```dockerfile
FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache openssl
COPY package*.json ./
RUN npm install
COPY . .
RUN npx prisma generate
EXPOSE 3001
CMD ["npm", "run", "start:dev"]
```

**Production Dockerfile pattern** (extend dev pattern, add Infisical, multi-stage for size):
```dockerfile
# backend/Dockerfile — production
# Build context MUST be monorepo root (not backend/) for proto files
FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache openssl curl

# Install Infisical CLI
RUN curl -1sLf 'https://dl.cloudsmith.io/public/infisical/infisical-cli/setup.alpine.sh' | sh \
    && apk add infisical

# Copy workspace manifests first (cache layer)
COPY package*.json ./
COPY backend/package*.json ./backend/
COPY packages/ ./packages/

RUN npm ci --workspace=backend --only=production

# Copy source
COPY backend/ ./backend/

# Generate Prisma client
RUN cd backend && npx prisma generate

EXPOSE 3001

# Start: Infisical injects secrets → OTel instrumentation → NestJS
CMD ["infisical", "run", \
     "--projectId", "<INFISICAL_PROJECT_ID>", \
     "--env", "production", \
     "--", \
     "node", "--require", "./backend/dist/instrumentation.js", \
     "./backend/dist/main.js"]
```

**Railway env var required:** `INFISICAL_TOKEN` (machine identity token — only env var committed to Railway)

---

### `backend/railway.toml` (config, batch — per-service Railway config, new file)

**Analog:** `docker-compose.yml` (lines 1-80) — deployment configuration; `railway.toml` is the Railway equivalent.

**Pattern from RESEARCH.md Pattern 12:**
```toml
# backend/railway.toml (monolith service — Wave 1)
[build]
dockerfilePath = "backend/Dockerfile"
buildContext = "."  # monorepo root — required for packages/proto/ access

[deploy]
startCommand = ""  # defined in Dockerfile CMD
healthcheckPath = "/api/v1/health"
restartPolicyType = "on_failure"

# Wave 3: per-microservice toml at backend/apps/auth-service/railway.toml
# watchPaths = ["backend/apps/auth-service/**", "backend/prisma/**", "packages/proto/**"]
```

---

### Test files (new spec files for Wave 0 gaps)

**Analog:** `backend/src/modules/auth/__tests__/auth.service.spec.ts` (lines 1-57) — canonical test pattern.

**Test file structure pattern** (copy from `auth.service.spec.ts` lines 1-57):
```typescript
// backend/src/redis/__tests__/redis.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { RedisService } from '../redis.service';
import { ConfigService } from '@nestjs/config';

const mockConfig = {
  get: jest.fn((key: string, def?: unknown) => {
    const vals: Record<string, string> = {
      REDIS_URL: 'rediss://default:test@localhost:6379',
    };
    return vals[key] ?? def;
  }),
};

// Mock ioredis — same pattern as mockPrisma in auth.service.spec.ts
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    exists: jest.fn(),
    quit: jest.fn(),
  }));
});

describe('RedisService', () => {
  let service: RedisService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedisService,
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();
    service = module.get<RedisService>(RedisService);
  });
  // ... tests
});
```

**S3 test file pattern** (same structure, mock `@aws-sdk/client-s3`):
```typescript
// backend/src/common/services/__tests__/s3.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { S3Service } from '../s3.service';
import { ConfigService } from '@nestjs/config';

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: jest.fn() })),
  PutObjectCommand: jest.fn(),
}));
// ... same beforeEach pattern as auth.service.spec.ts
```

---

## Shared Patterns

### Logger Pattern
**Source:** Every service in `backend/src/` (e.g., `s3.service.ts` line 7, `redis.service.ts` line 8, `notifications.service.ts` line 8)
**Apply to:** All new services (`search.service.ts`, `kafka.service.ts`, microservice controllers)
```typescript
private readonly logger = new Logger(SearchService.name);
// Then use:
this.logger.error('Typesense search failed', err.message);
this.logger.log('Kafka producer connected');
this.logger.warn('No FCM token for user');
```

### ConfigService Injection Pattern
**Source:** `backend/src/common/services/s3.service.ts` (lines 13-24), `backend/src/redis/redis.service.ts` (lines 10-11)
**Apply to:** All new services that read env vars
```typescript
// Constructor injection — NO @Inject() decorator needed (NestJS resolves by type)
constructor(private config: ConfigService) {}
// Then use:
this.config.get<string>('ENV_VAR_NAME', 'default-value')
this.config.get<number>('PORT', 3001)
```

### Global Module Pattern
**Source:** `backend/src/redis/redis.module.ts` (lines 1-9), `backend/src/common/common.module.ts` (lines 1-13)
**Apply to:** `SearchModule`, `KafkaModule` — both should be `@Global()` so all feature services can use search/kafka without per-module imports
```typescript
@Global()
@Module({
  providers: [ServiceClass],
  exports: [ServiceClass],
})
export class ServiceModule {}
```

### External SDK Client Initialization Pattern
**Source:** `backend/src/modules/ai/ai.service.ts` (lines 10-18) — `Anthropic` client in constructor
**Apply to:** `SearchService` (Typesense client), `KafkaService` (Kafka client)
```typescript
// SDK client initialized in constructor, stored as private readonly field
private readonly anthropic: Anthropic;

constructor(private config: ConfigService) {
  this.anthropic = new Anthropic({ apiKey: config.get('ANTHROPIC_API_KEY') ?? 'dummy' });
}
```

### Error Handling Pattern (External Services)
**Source:** `backend/src/common/services/s3.service.ts` (lines 40-44), `backend/src/modules/notifications/notifications.service.ts` (lines 33-44)
**Apply to:** `SearchService.search()`, `KafkaService.emit()`
```typescript
// Two patterns — choose by whether failure should propagate or degrade:

// Pattern A: rethrow (file upload, Kafka emit — failure must propagate):
} catch (err) {
  this.logger.error(`S3 upload failed for key ${key}`, err.message);
  throw err;
}

// Pattern B: degrade gracefully (search, push notification — failure returns empty/false):
} catch (err) {
  this.logger.error('Typesense search failed', err);
  return { results: [] };
}
```

### OnModuleInit / OnModuleDestroy Lifecycle Pattern
**Source:** `backend/src/redis/redis.service.ts` (lines 12-25), `backend/src/prisma/prisma.service.ts` (lines 5-12)
**Apply to:** `KafkaService` (connect producer on init, disconnect on destroy)
```typescript
// redis.service.ts lines 6-25:
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  onModuleInit() {
    this.client = new Redis({ ... });
    this.client.on('error', (err) => this.logger.error('Redis error', err));
  }
  async onModuleDestroy() {
    await this.client.quit();
  }
}
```

### AppModule Registration Pattern
**Source:** `backend/src/app.module.ts` (lines 1-47, full file in context)
**Apply to:** Add `SearchModule`, `KafkaModule` to the imports array
```typescript
// Add to backend/src/app.module.ts imports array (after existing modules):
import { SearchModule } from './search/search.module';
import { KafkaModule } from './kafka/kafka.module';

// In @Module({ imports: [...] }):
SearchModule,
KafkaModule,
```

### NestJS Test Module Pattern
**Source:** `backend/src/modules/auth/__tests__/auth.service.spec.ts` (lines 1-57), `backend/src/modules/wallet/__tests__/wallet.service.spec.ts` (lines 1-38)
**Apply to:** All new `*.service.spec.ts` files (`redis.service.spec.ts`, `s3.service.spec.ts`, `search.service.spec.ts`, `kafka.service.spec.ts`)
```typescript
// Standard test module setup — copy verbatim, change service + mocks:
beforeEach(async () => {
  jest.clearAllMocks();
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      ServiceUnderTest,
      { provide: PrismaService, useValue: mockPrisma },
      { provide: ConfigService, useValue: mockConfig },
    ],
  }).compile();
  service = module.get<ServiceUnderTest>(ServiceUnderTest);
});
```

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `packages/proto/auth.proto` | config | request-response | No .proto files in codebase — use RESEARCH.md Pattern 8 |
| `packages/proto/wallet.proto` | config | request-response | No .proto files in codebase — use RESEARCH.md Pattern 8 |
| `backend/src/instrumentation.ts` | utility | event-driven | No OTel initialization in codebase — use RESEARCH.md Pattern 10 exactly; must load via `--require` before main.ts |

---

## Metadata

**Analog search scope:** `backend/src/` (all subdirectories), `backend/prisma/`, root Docker/compose files
**Files scanned:** 18 source files read directly
**Key insight — most Phase 2 changes are surgical modifications, not new files:** S3Service, RedisService, schema.prisma, and main.ts are all self-modifications (constructor or block changes only). The truly new files are: `instrumentation.ts`, `search/search.{service,module}.ts`, `kafka/kafka.{service,module}.ts`, `.proto` files, production `Dockerfile`, and `railway.toml`.
**Pattern extraction date:** 2026-05-12
