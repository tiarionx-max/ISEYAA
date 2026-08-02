---
phase: quick
plan: 260802-6uu
status: complete
subsystem: marketplace
tags: [prisma, schema, marketplace, refactor]
key-files:
  created: []
  modified:
    - backend/prisma/schema.prisma
    - backend/src/modules/marketplace/marketplace.service.ts
commits:
  - f1ec918: "feat(marketplace): add optional Order<->Vendor Prisma relation"
  - e40f354: "refactor(marketplace): resolve order vendor via Prisma include"
---

# Quick Task 260802-6uu: Add Optional Order<->Vendor Prisma Relation Summary

Wired the missing `Order.vendorId` FK into a real Prisma relation (`Order.vendor` / `Vendor.orders`) and refactored `MarketplaceService.handleOrderPayment` to resolve the vendor via the order's `include` clause instead of a manual second `prisma.vendor.findUnique` round trip.

## What Changed

### Task 1 — `backend/prisma/schema.prisma`
- `Order` model: added `vendor Vendor? @relation(fields: [vendorId], references: [id])` directly below the existing `vendorId String?` field. `vendorId` itself is untouched — stays nullable, `@@index([vendorId])` unchanged.
- `Vendor` model: added `orders Order[]` back-relation alongside the existing `products Product[]` / `properties Property[]` relations.
- Commit: `f1ec918`

### Task 2 — `backend/src/modules/marketplace/marketplace.service.ts`
- `handleOrderPayment`'s `order.findUnique` call now includes `vendor: { select: { userId: true } }` alongside the existing `user` and `orderItems` includes.
- Removed the separate `const vendor = order.vendorId ? await this.prisma.vendor.findUnique(...) : null;` lookup.
- `vendorWallet` now resolves from `order.vendor?.userId` (`order.vendor ? await this.prisma.wallet.findUnique({ where: { userId: order.vendor.userId } }) : null`).
- Replaced the stale "Order.vendorId has no Prisma relation defined" comment with an accurate one-liner.
- `order.vendorId` scalar read in the `metadata: { vendorId: order.vendorId, orderId: order.id }` block (settlement recipients array) is unchanged, as required.
- `tour-settlement.service.ts` was not touched (its vendor-wallet resolution is polymorphic and unrelated to `Order.vendorId`).
- Commit: `e40f354`

## Deviations from Plan

None — plan executed exactly as written. All edits match the precise diff spec and interfaces given.

## Deferred (must run in an env with deps + Postgres)

This environment has no `node_modules`, no `DATABASE_URL`/PostgreSQL, so the following could not be run here and are deferred to an environment with dependencies installed and a database available:

1. `npm install` (root) — to restore `node_modules` across workspaces.
2. `cd backend && npx prisma generate` — regenerate the Prisma client so `order.vendor` / `vendor.orders` types resolve correctly in TypeScript.
3. `npm run prisma:migrate` (`prisma migrate dev`) — creates and applies the FK migration for the new `Order.vendor` relation.
   - **CAVEAT:** `vendorId` is nullable and pre-existing rows may hold orphan `vendorId` values that violate the new FK constraint. Clean up orphan rows first (set `vendorId` to `NULL` or delete the offending rows) or the migration will fail on apply.
   - **CAVEAT:** root `package.json` pins `prisma@^7.8.0` while `backend/package.json` pins `prisma@5.11.x` — run prisma commands via `backend`'s local binary (`cd backend && npx prisma ...`) to avoid picking up the mismatched root-level CLI version.
4. `cd backend && npx jest marketplace` — confirm marketplace tests still pass against the regenerated client.
   - **FOLLOW-UP FLAG:** `backend/src/modules/marketplace/__tests__/marketplace.service.spec.ts` — the `handleOrderPayment` describe block (around lines 354-480) currently calls `mockPrisma.vendor.findUnique.mockResolvedValue(mockVendor)` to stub the vendor lookup for the order-payment path. That standalone `vendor.findUnique` call no longer happens after this refactor (the vendor now arrives via the `order.findUnique`'s `include: { vendor: ... } }`). Those test mocks need to be updated to attach `vendor: { userId: ... }` directly onto the mocked `order` object returned by `mockPrisma.order.findUnique` (or equivalent), instead of stubbing a separate `vendor.findUnique` call. Until updated, these specific `handleOrderPayment` tests will likely fail (vendorWallet resolution will silently receive `null` since `mockVendor` never gets attached to the order mock).

## Self-Check

```
FOUND: backend/prisma/schema.prisma (vendor relation + orders back-relation present)
FOUND: backend/src/modules/marketplace/marketplace.service.ts (include + vendorWallet refactor present)
FOUND commit: f1ec918
FOUND commit: e40f354
```

## Self-Check: PASSED
