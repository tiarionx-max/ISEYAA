# 09-10 SUMMARY — Web Admin Tour Pages + Backend Analytics Endpoints

## Overview
Plan 09-10 added two new backend GET endpoints (revenue breakdown + utilization heatmap)
and five new admin web pages (3 queues + 2 analytics views) with two supporting chart
components.

---

## Backend Changes

### New Files
- `backend/src/modules/tour-bookings/tour-admin.service.ts`
- `backend/src/modules/tour-bookings/tour-admin.controller.ts`

### Modified Files
- `backend/src/modules/tour-bookings/tour-bookings.module.ts` — registered `TourAdminService`
  and `TourAdminController` in `providers` and `controllers` arrays respectively.

### New Endpoints

#### `GET /api/v1/admin/tours/revenue`
Query params: `packageId`, `from`, `to` (ISO date strings).

Finds all CONFIRMED TourBookings for the package within the window, loads CREDIT
transactions whose `metadata.module === 'tour'` and `metadata.bookingId` is in that set,
groups by `(vendorType, vendorId)` in JavaScript, and sums amounts. Transactions whose
`reference` ends with `-PLAT` are counted as platform commission.

Returns:
```json
{
  "totalAmountNgn": 150000,
  "packageName": "Olumo Rock Adventure",
  "vendorBreakdown": [
    { "vendorType": "GUIDE", "vendorId": "...", "totalCreditedNgn": 120000, "transactionCount": 3 }
  ],
  "platformCommissionNgn": 30000,
  "bookingCount": 4
}
```

#### `GET /api/v1/admin/tours/utilization`
Query params: `from`, `to` (ISO date strings).

Uses `prisma.$queryRaw` with `Prisma.sql` template tag (fully parameterized, no string
concatenation) to run a `date_trunc + GROUP BY` query that buckets confirmed bookings by
passenger count (`1-2`, `3-5`, `6-9`, `10-24`, `25-50`) per calendar day.

Returns:
```json
{
  "buckets": [
    { "date": "2024-01-15", "groupSizeBucket": "3-5", "bookingCount": 2, "totalPassengers": 9 }
  ]
}
```

### RBAC Guard Pattern (both endpoints)
```typescript
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.LGA_ADMIN, UserRole.STATE_ADMIN, UserRole.SUPER_ADMIN)
@Controller('admin/tours')
```
Matches the pattern established in `admin.controller.ts` and the existing
`TourPackagesAdminController` / `TourGuidesAdminController`.

---

## Frontend Changes

### New Chart Components
- `web/src/components/admin/tours/RevenueBreakdownChart.tsx`
  - Recharts `BarChart` (already in `web/package.json` — no new dependency added).
  - Merges platform commission as a "Platform" bar.
  - Custom tooltip showing `₦` formatted amounts.
  - No inline hex strings; uses Tailwind opacity variants for colour.

- `web/src/components/admin/tours/GroupUtilizationHeatmap.tsx`
  - Pure CSS Grid heatmap (not Recharts).
  - Rows = fixed bucket order `['1-2', '3-5', '6-9', '10-24', '25-50']`.
  - Columns = all dates in `[from, to]` (max 31 shown).
  - Cell intensity: `bg-gold/{10|20|35|50|65|85}` based on `bookingCount / max`.
  - `title` attribute on each cell for native tooltip: `"{date} · {bucket}: N bookings, P passengers"`.

### New Admin Pages

| Path | Purpose |
|------|---------|
| `/admin/tours/queue` | Tour package approval queue (Approve / Reject with modal) |
| `/admin/guides/queue` | Tour guide application queue (Approve / Reject with modal) |
| `/admin/reviews/queue` | Review flag queue (Resolve with modal / Dismiss inline) |
| `/admin/tours/revenue` | Revenue breakdown analytics with package + date filters |
| `/admin/tours/utilization` | Group-size utilization heatmap with date filters |

All pages:
- Check `session.user.role` against `['LGA_ADMIN', 'STATE_ADMIN', 'SUPER_ADMIN']` and
  redirect to `/admin` if not authorized.
- Use `useQuery` + `fetcher` from `web/src/lib/api.ts`.
- Use `sonner` `toast` for all mutation feedback.
- All action buttons have `min-h-[44px]` for 44pt touch targets.

### Queue Pages Note
The queue endpoints (`/admin/tour-packages/queue`, `/admin/tour-guides/queue`,
`/admin/reviews/queue`) already existed from plans 09-04, 09-03, and 09-08 respectively.
Plan 09-10 only added the **consumer pages** in the web app and the new analytics
endpoints on the backend.

---

## TypeScript Compilation
Both `cd backend && npx tsc --noEmit` and `cd web && npx tsc --noEmit` were run.
All errors found are pre-existing environment issues in the worktree (missing packages:
`@nestjs/swagger`, `framer-motion`, `sonner`, `recharts` — packages are present in
`package.json` but `npm install` has not been run in this worktree environment). The new
files contribute only "Cannot find module" errors of the same type as the 500+ pre-existing
errors, with zero logic or type-structure errors.

---

## No New Dependencies
- `recharts` was already present at `^3.8.0` in `web/package.json`.
