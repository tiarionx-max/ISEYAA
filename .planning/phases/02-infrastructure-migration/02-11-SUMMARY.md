---
plan: 02-11
phase: 02-infrastructure-migration
status: complete
wave: 3
requirements: [INFRA-09]
completed: 2026-05-12
---

# Plan 02-11 — Upstash Kafka Event Bus Summary

## What Was Built

Replaced EventEmitter2 as the cross-service payment event trigger with Upstash Kafka, using a two-step dual-write migration: (1) Kafka producers added alongside existing EventEmitter2 emits in WebhooksService; (2) Kafka consumers added to feature services in onModuleInit; (3) @OnEvent decorator usages removed from all feature services. EventEmitterModule registration kept as no-op per plan.

## Key Changes

### backend/src/kafka/kafka.service.ts (NEW)
- SASL/SCRAM-SHA-256 + SSL for Upstash Kafka
- `emit(topic, payload)`: produces JSON-serialised message; logs and rethrows on failure
- `consume(topic, groupId, handler)`: creates consumer per call; handler errors caught and logged (consumer loop does not die)
- `onModuleInit()`: connects producer; `onModuleDestroy()`: disconnects producer

### backend/src/kafka/kafka.module.ts (NEW)
`@Global()` module exporting KafkaService — injected everywhere without re-importing

### backend/src/kafka/__tests__/kafka.service.spec.ts (NEW)
6 unit tests covering constructor config, onModuleInit, emit, emit failure rethrow, consume, and consumer handler error isolation

### backend/src/modules/webhooks/webhooks.service.ts
Dual-write: each `eventEmitter.emit()` call now followed by `kafkaService.emit()` with `.catch()` — Kafka failure does NOT block EventEmitter2 path

Topics published:
- `payment.ticket_purchase`
- `payment.stay_booking`
- `payment.order_payment`
- `payment.studio_booking`

### backend/src/modules/events/events.service.ts
- `onModuleInit()`: consumes `payment.ticket_purchase` / group `events-service-prod` → calls `handleTicketPayment()`
- `@OnEvent('payment.ticket_purchase')` decorator removed; `OnEvent` import removed

### backend/src/modules/stays/stays.service.ts
- `onModuleInit()`: consumes `payment.stay_booking` / group `stays-service-prod` → calls `handleStayPayment()`
- `@OnEvent('payment.stay_booking')` decorator removed; `OnEvent` import removed

### backend/src/modules/marketplace/marketplace.service.ts
- `onModuleInit()`: consumes `payment.order_payment` / group `marketplace-service-prod` → calls `handleOrderPayment()`
- `@OnEvent('payment.order_payment')` decorator removed; `OnEvent` import removed

### backend/src/modules/studio/studio.service.ts
- `onModuleInit()`: consumes `payment.studio_booking` / group `studio-service-prod` → calls `handleStudioPayment()`
- `@OnEvent('payment.studio_booking')` decorator removed; `OnEvent` import removed

### backend/src/app.module.ts
KafkaModule added to imports (globally available); EventEmitterModule preserved as no-op

## Verification

| Check | Result |
|-------|--------|
| kafka.service.ts contains `scram-sha-256` | ✅ |
| kafka.service.ts contains `ssl: true` | ✅ |
| KafkaModule in app.module.ts | ✅ |
| `@OnEvent` in stays/marketplace/events/studio services | ✅ 0 matches |
| EventEmitterModule in app.module.ts | ✅ Preserved |
| eventEmitter.emit() dual-write in webhooks | ✅ Preserved |
| KafkaService unit tests | ✅ 6/6 passing |
| Full test suite | ✅ 179 tests, 15 suites, 0 failures |
| INFRA-09 | ✅ Complete |

## Self-Check: PASSED

## Notes
- Kafka consumers connect on `onModuleInit()` and will silently skip if `KAFKA_BROKER_URL` is empty (local dev without Upstash configured)
- Handler method bodies are fully intact — only the `@OnEvent` decorator triggers were removed; Kafka callbacks invoke the same logic
- Studio service Kafka consumer uses group `studio-service-prod` on topic `payment.studio_booking` (studio was not in original plan scope but had @OnEvent — added consumer before removing decorator to maintain correctness)
