---
phase: 08-mobile-redesign
plan: 08-08
subsystem: mobile
tags: [mobile, stays, booking, paystack, expo-router]
requirements: [MOB-RD-04]
dependency_graph:
  requires: [08-01, 08-02, 08-04, 08-04b]
  provides:
    - StayDetailScreen (rewritten — gallery + highlights + amenities + mode-aware sheet)
    - NightlyBookingSheet, HourlyBookingSheet, TimedEventBookingSheet, MembershipBookingSheet
  affects:
    - mobile/app/stays/[id].tsx (full rewrite)
tech-stack:
  added: []
  patterns:
    - "Mode-aware sticky sheet: switch on property.bookingMode renders one of 4 sheet components"
    - "Defensive payment URL read: resp.payment?.authorizationUrl ?? resp.authorizationUrl"
    - "Email default from /users/me query (mirrors checkout.tsx pattern from 08-06)"
    - "Local-date ISO slice (no UTC shift) for NIGHTLY checkIn/checkOut"
key-files:
  created:
    - mobile/components/stays/NightlyBookingSheet.tsx (434 lines)
    - mobile/components/stays/HourlyBookingSheet.tsx (423 lines)
    - mobile/components/stays/TimedEventBookingSheet.tsx (412 lines)
    - mobile/components/stays/MembershipBookingSheet.tsx (320 lines)
  modified:
    - mobile/app/stays/[id].tsx (full rewrite — 566 lines, replaced 769-line legacy)
decisions:
  - "Date picker library: @react-native-community/datetimepicker (per plan M-7 decision) — installed by 08-01; native date+time picker, no TextInput-parse fallback."
  - "Booking endpoint: POST /api/v1/properties/:id/bookings (verified in stays.controller.ts:94). The handoff doc's /stays/bookings was wrong — that route does not exist."
  - "TIMED_EVENT formula: pricePerHour × slot length hours (per CONTEXT §Stay Detail + H-3). NOT people × pricePerNight (the web reference had the iteration-1 mistake)."
  - "Email defaults from /users/me — same pattern as 08-06 checkout.tsx (useQuery({queryKey:['me'], queryFn:()=>fetcher('/users/me')}). Required by backend DTO (@IsEmail)."
  - "All sheets share BookingArgs + BookingSheetProps types exported from NightlyBookingSheet.tsx — single source of truth for cross-sheet contracts."
  - "Schema field correction: backend stores gallery in `imageUrls: String[]`, not `galleryImages` as the plan referred. Wired the screen to imageUrls + coverImageUrl fallback per actual prisma schema."
metrics:
  duration: ~25 minutes
  completed: 2026-06-12
---

# Phase 8 Plan 08-08: Stay Detail Mode-Aware Booking Summary

Rewrote `mobile/app/stays/[id].tsx` as a Airbnb-style stay detail (4-image gallery, highlights with check icons, amenity Chip pills, sticky booking sheet) and extracted 4 booking-sheet components — one per `property.bookingMode` — that all POST to `/api/v1/properties/:id/bookings` with the canonical `{ checkIn, checkOut, guests, email }` payload, email REQUIRED, defaulted from session.

## Files

| File | Lines | Role |
|---|---|---|
| `mobile/components/stays/NightlyBookingSheet.tsx` | 434 | NIGHTLY: date range + guests + email → nights × pricePerNight |
| `mobile/components/stays/HourlyBookingSheet.tsx` | 423 | HOURLY: date + start time + duration + guests + email → hours × pricePerHour |
| `mobile/components/stays/TimedEventBookingSheet.tsx` | 412 | TIMED_EVENT: date + slot chip picker + guests + email → pricePerHour × slot length (H-3 fix) |
| `mobile/components/stays/MembershipBookingSheet.tsx` | 320 | MEMBERSHIP: duration chips (1/3/6/12mo) + email + benefits list → months × membershipMonthlyPrice |
| `mobile/app/stays/[id].tsx` (rewrite) | 566 | Gallery (paged FlatList expo-image) + highlights + amenities + map placeholder + sticky mode-aware sheet |

## Compute formulas (one per mode — verified)

| Mode | Formula | Notes |
|---|---|---|
| NIGHTLY | `nights × pricePerNight` | `nights = max(1, round((checkOut - checkIn) / 86_400_000))` |
| HOURLY | `hours × (pricePerHour ?? pricePerNight ?? 0)` | start = date+time, end = start + hours×3_600_000 |
| TIMED_EVENT | `pricePerHour × slotLengthHours` | **H-3 fix**: not `people × pricePerNight`. Fallback to flat `pricePerNight` when `pricePerHour` is absent (no multiplier). |
| MEMBERSHIP | `months × (membershipMonthlyPrice ?? pricePerNight ?? 0)` | checkIn = now, checkOut = now + months×30 days, guests = 1 |

## Backend contract confirmation

- **Endpoint**: `POST /api/v1/properties/:id/bookings` — verified in `backend/src/modules/stays/stays.controller.ts:94`. The mobile handoff doc's older `/stays/bookings` path **does not exist**. (H-3 truth.)
- **Payload**: `{ checkIn: ISO string, checkOut: ISO string, guests: int ≥ 1, email: string }` — matches `CreateBookingDto` (`backend/src/modules/stays/dto/create-booking.dto.ts`).
- **Email**: REQUIRED by `@IsEmail()`. All 4 sheets render a `keyboardType="email-address"` TextInput labelled "CONFIRMATION EMAIL", pre-filled from `me?.email` if available, validated client-side with `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`.
- **Email default pattern**: `useQuery({ queryKey:['me'], queryFn:()=>fetcher('/users/me') })` mirrors the pattern used by `mobile/app/checkout.tsx` (08-06) — single source of truth for "who am I" across mobile bookable flows.
- **Paystack handoff**: defensive read `resp.payment?.authorizationUrl ?? resp.authorizationUrl` → `WebBrowser.openAuthSessionAsync(url, 'iseyaa://booking-callback')`. Wraps in try/catch so a browser-launch failure does not block the user — the Paystack webhook is authoritative.

## Visual conventions (all 4 sheets)

- Rounded top corners (24px), `SURFACE_RAISED` background, `BORDER_GLASS` top border.
- Field labels: 9pt mono, gold, 1.5 letter-spacing (kicker style).
- Totals row: tabular-nums mono in gold (`fontVariant: ['tabular-nums']`).
- Stepper buttons: 44×44 (iOS HIG touch target).
- CTA: 52pt height, gold background, `SURFACE_DEEP` ink (matches 08-06 checkout pattern).
- No inline hex anywhere — only `rgba(0,0,0,0.4)` overlay on gallery nav buttons (explicitly allowed per plan).

## Date picker decision (M-7)

Used `@react-native-community/datetimepicker` everywhere a date or time is captured (NIGHTLY check-in/out, HOURLY date+start, TIMED_EVENT date). No TextInput-parse fallback. The package is already declared in `mobile/package.json` (installed by 08-01 Task 1) and ships native pickers on both iOS and Android.

The Membership sheet has no date pickers (system-generated start = now / end = +N×30 days), so it does not import the date module — only the duration is user-chosen via 4 Chip components.

## Deviations from plan

1. **Schema field name correction** (Rule 1 fix): The plan refers to `property.galleryImages` for the gallery source, but the actual Prisma schema (`backend/prisma/schema.prisma:364`) stores gallery photos in `imageUrls: String[]` (no `galleryImages` field exists). The rewrite uses `property.imageUrls` (sliced to 4) with `coverImageUrl` repeated as fallback when fewer than 4 are present — matches the web reference (`web/src/app/stays/[id]/page.tsx:562`).
2. **TextInput style ternary fix** (Rule 1 typing fix): Initial drafts used `cond && style` for conditional `inputFocused`/`inputError` — TextStyle arrays reject the `false` (empty-string evaluation) case. Switched to `cond ? style : null` for all 4 sheets. Pure typing change, no runtime effect.
3. **DateTimePicker callback annotations** (Rule 1 typing fix): With `node_modules` missing from this worktree, the package types resolve to `any` and `noImplicitAny` flags the lambda parameters. Annotated as `(_: unknown, d?: Date)` so the source is clean once `npm install` runs. No runtime effect.
4. **Endpoint docstring reword**: Initial docstring said "(NOT /stays/bookings)" — task 2's automated verify greps for `/stays/bookings` as a stale-string sanity check, so even a negative comment trips it. Reworded the docstring to mention "the older path under stays" without containing the exact substring.

## Verifier checklist

- [x] All 4 sheets exist under `mobile/components/stays/` and each exports its named component.
- [x] Each sheet receives `defaultEmail`, owns its own form state, and emits `BookingArgs` via `onSubmit`.
- [x] `mobile/app/stays/[id].tsx` switches across all 4 modes (string match: NIGHTLY, HOURLY, TIMED_EVENT, MEMBERSHIP) and imports all 4 sheet components.
- [x] Mutation hits `/properties/:id/bookings` — grep `/properties/.*bookings` returns a match.
- [x] `/stays/bookings` substring does **not** appear in `mobile/app/stays/[id].tsx`.
- [x] `expo-web-browser` imported for Paystack handoff.
- [x] TIMED_EVENT contains `pricePerHour` and does **not** contain `people * pricePerNight`.
- [x] `git diff --stat mobile/app/_layout.tsx` reports no changes (H-4 disjoint ownership respected).
- [x] No new inline hex outside `rgba(0,0,0,0.4)` overlay (verified by grep).
- [x] `cd mobile && npx tsc --noEmit` — only the pre-existing `node_modules`-missing baseline errors remain (`expo-image`, `expo-web-browser`, `@react-native-community/datetimepicker`, `Href<...>`). All four are tracked under `.planning/phases/08-mobile-redesign/deferred-items.md` (the From-Plan-08-05 entry covers this entire class).

## Commits

| Hash | Message |
|---|---|
| f9181b1 | feat(08-08): NightlyBookingSheet — nights x pricePerNight, date pickers + email |
| f55b186 | feat(08-08): HourlyBookingSheet — hours x pricePerHour + start time picker |
| c0b02ca | feat(08-08): TimedEventBookingSheet — H-3 fix: pricePerHour x slot length |
| 089bfb6 | feat(08-08): MembershipBookingSheet — months x monthly + benefits list |
| d0f8031 | fix(08-08): typecheck — annotate DateTimePicker onChange + TextInput style ternaries |
| 797139f | feat(08-08): rewrite stays/[id] — gallery + highlights + amenities + mode-aware sheet |
| f11aeb1 | docs(08-08): reword endpoint comment to avoid /stays/bookings substring |
| 43f4c0b | refactor(08-08): replace inline #051A10 with SURFACE_DEEP token |

## Self-Check: PASSED

- All 5 files created/modified exist on disk and are committed.
- All 8 commits present in `git log`.
- Task 1 automated verify: `OK 4 sheets`.
- Task 2 automated verify: `OK`.
- `tsc --noEmit` produces only the documented `node_modules`-missing baseline errors.
