---
created: 2026-07-17T22:11:51.458Z
title: Wire ResilienceModule into gRPC service scaffolds (INT-01)
area: general
files:
  - backend/apps/*-service/*/app.module.ts
  - backend/src/common/services/resilience.service.ts
---

## Problem

`ResilienceModule` (built in Phase 11) is `@Global()` but is only imported by the monolith's `app.module.ts` — never by any of the 8 `backend/apps/*-service` gRPC scaffolds Phase 10 fixed, each of which boots as its own independent `NestFactory.createMicroservice()` with its own DI container. `PaystackService` (in the globally-shared `CommonModule`, imported by all 8 scaffolds) constructor-injects `ResilienceService`, so every scaffold fails identical DI resolution errors when instantiated (`Test.createTestingModule` reproduces this for all 8: 7 fail through `CommonModule`'s `PaystackService`, 1 — auth-service — fails independently through `AuthModule`'s `AuthService`).

Currently latent: nothing boots these scaffolds in production today (no docker-compose/Railway reference), so this is inert. But it will hard-block Phase 17's first live extraction (`notifications-service`) unless fixed first.

Surfaced by: `.planning/v2.0-MILESTONE-AUDIT.md` (2026-07-17 audit), finding INT-01.

## Solution

Import `ResilienceModule` into each of the 8 `backend/apps/*-service` scaffolds' `app.module.ts`. Likely a Phase 16 or Phase 17 prerequisite task — surface during those phases' discuss/plan steps.
