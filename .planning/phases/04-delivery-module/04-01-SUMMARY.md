---
phase: 04-delivery-module
plan: "01"
subsystem: delivery
tags: [prisma-schema, mobile-deps, delivery, expo-image-picker]
dependency_graph:
  requires: []
  provides:
    - DeliveryRider model in schema.prisma
    - DeliveryOrder model in schema.prisma
    - DeliveryEvent model in schema.prisma
    - DeliveryOrderStatus enum in schema.prisma
    - expo-image-picker ~15.0.7 in mobile/package.json
  affects:
    - backend/prisma/schema.prisma (User model extended with 2 new back-relations)
    - mobile/package.json (new dependency)
tech_stack:
  added:
    - expo-image-picker@15.0.7 (mobile)
  patterns:
    - Prisma model extension following Driver/Trip/TripEvent pattern
    - Enum reuse (DriverStatus reused for DeliveryRider.status)
key_files:
  modified:
    - backend/prisma/schema.prisma
    - mobile/package.json
    - package-lock.json
decisions:
  - "Reused DriverStatus enum for DeliveryRider.status — no new enum needed for rider approval lifecycle"
  - "Delivery riders use DRIVER UserRole — adding a RIDER enum value would have wide side-effects across guards and auth logic"
  - "No DB push performed — schema file changes only; Plan 02 owns the prisma migrate step"
metrics:
  duration: "2 minutes"
  completed: "2026-05-16"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 3
---

# Phase 4 Plan 01: Delivery Module Prerequisites Summary

Established the two foundational prerequisites for the Delivery Module: Prisma schema extended with delivery models + enum, and expo-image-picker added to mobile dependencies. No backend NestJS code or database changes were performed.

## What Was Built

**Task 1 — expo-image-picker dependency**

Added `expo-image-picker@15.0.7` (`~15.0.7` range) to `mobile/package.json` dependencies. This is the Expo SDK 51-compatible version for proof-of-delivery photo capture. Version 16.x is excluded as it requires SDK 52+ and uses a different `MediaTypeOptions` API (array syntax vs. enum).

**Task 2 — Prisma schema delivery models**

Added to `backend/prisma/schema.prisma`:

1. `DeliveryOrderStatus` enum (7 members):
   - `SEARCHING`, `MATCHED`, `COLLECTING`, `IN_TRANSIT`, `DELIVERED`, `CANCELLED`, `EXPIRED`

2. `DeliveryRider` model — mapped to `delivery_riders`:
   - Fields: `id`, `userId` (unique FK to User), `status` (DriverStatus), `approvedById`, `approvedAt`, `isOnline`, `lastSeenAt`, `avgRating`, `totalDeliveries`, `acceptanceRate`, `metadata`, `createdAt`, `updatedAt`, `deletedAt`
   - Relation: `orders DeliveryOrder[] @relation("RiderOrders")`

3. `DeliveryOrder` model — mapped to `delivery_orders`:
   - Fields: `id`, `senderId` (FK to User via "SenderOrders"), `riderId` (optional FK to DeliveryRider via "RiderOrders"), `pickupAddress`, `pickupLat`, `pickupLng`, `dropoffAddress`, `dropoffLat`, `dropoffLng`, `itemDescription`, `weightKg`, `recipientPhone`, `fee`, `platformFee`, `riderEarnings`, `status` (DeliveryOrderStatus), `proofPhotoUrl`, `otpVerifiedAt`, `requestedAt`, `matchedAt`, `collectedAt`, `completedAt`, `cancelReason`, `senderRating`, `metadata`, `createdAt`, `updatedAt`, `deletedAt`
   - Relation: `events DeliveryEvent[]`

4. `DeliveryEvent` model — mapped to `delivery_events`:
   - Fields: `id`, `orderId` (FK to DeliveryOrder), `event` (String), `metadata`, `createdAt`

5. `User` model extended with two new virtual back-relations:
   - `deliveryRiderProfile DeliveryRider?`
   - `senderOrders DeliveryOrder[] @relation("SenderOrders")`

## Verification

- `prisma validate` exits 0 — schema valid
- All 11 grep acceptance criteria pass (1 match each for models, enum, relation fields, @@map directives)
- `npm ls expo-image-picker --workspace=mobile` shows `15.0.7` with no UNMET PEER warnings
- No DB push performed — confirmed by absence of any `prisma migrate` or `prisma db push` call

## Deviations from Plan

### Auto-format whitespace adjustment

`prisma format` adjusted whitespace alignment in the User model's relation fields section (reformatted the column alignment of `driverProfile`/`riderTrips` alongside the new delivery fields). This is expected behavior — documented as a known deviation in the plan output spec.

No functional changes were introduced by the formatter.

## Known Stubs

None — this plan adds only schema definitions and a dependency declaration. No runtime behavior is implemented.

## Threat Flags

No new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries beyond what the plan's threat model covers. All three threats (T-04-01, T-04-02, T-04-03) are schema-level declarations; mitigations will be applied in Plans 03 and 07 as specified.
