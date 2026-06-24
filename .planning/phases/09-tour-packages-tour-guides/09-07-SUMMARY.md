# 09-07 SUMMARY — Tour Notifications + Itinerary PDF

**Plan:** 09-07
**Wave:** 5 (parallel with 09-08)
**Status:** COMPLETE
**Commits:** 3 (ItineraryPdfService · TourNotificationsService · spec)

---

## What shipped

### `backend/src/common/services/itinerary-pdf.service.ts`
- `ItineraryPdfService` — pdfkit ^0.19.1 (lightweight, no headless Chrome dep)
- `renderPdf(booking, itinerary, packageInfo) → Buffer` — A4 doc with title block, hour-sorted items, guide name, footer
- `generateAndUpload(booking, itinerary, packageInfo) → string (publicUrl)` — uploads to `itineraries/{bookingId}.pdf` via S3Service; throws `ServiceUnavailableException` on failure
- Registered in CommonModule providers + exports (alphabetical order)

### `backend/src/modules/tour-bookings/tour-notifications.service.ts`
- `@OnEvent('tour_booking.confirmed')` → generates PDF, persists `Itinerary.pdfUrl`, emails buyer via SendgridService; idempotent via `metadata.pdfSent` flag
- `@Cron(EVERY_HOUR) pushTMinus24h` — window [now + (offset-1)h, now + (offset+1)h]; offset from PlatformConfig `tour.notify_t_minus_24h_hours` (default 24); sends push + email with PDF link; idempotent via `metadata.notifiedTMinus24h`
- `@Cron('*/15 * * * *') pushTMinus2h` — ±15min window around 2h-before-start; push-only; offset from `tour.notify_t_minus_2h_hours`; idempotent via `metadata.notifiedTMinus2h`
- `@Cron('*/15 * * * *') pushPostTourRating` — fires 45–75min after `tourDate + durationHours`; push "Rate your tour"; idempotent via `metadata.notifiedPostTour`
- **NEVER writes to wallets, NEVER changes BookingStatus**
- NotificationsModule imported in TourBookingsModule (not @Global)

### `backend/src/modules/tour-bookings/__tests__/tour-notifications.service.spec.ts`
- 9 scenarios: onBookingConfirmed happy + idempotent; pushTMinus24h happy + idempotent + window boundaries + PlatformConfig override; pushTMinus2h push-only; pushPostTourRating window check + out-of-window skip; push-failure leaves flag unset (retry on next tick)

---

## Key decisions
- **pdfkit** added (^0.19.1) — no existing PDF lib was in package.json; pdfkit preferred for <3MB overhead vs puppeteer/Playwright
- Cron debounce strategy: `EVERY_HOUR` for wide 2h-slop window (T-24h); `*/15` for tighter ±15min windows (T-2h, T+1h)
- Idempotency flag set ONLY after successful send — failures retry on next cron tick
- PlatformConfig offsets read per-cron-invocation (not cached) so operator changes take effect within 1 cron cycle

---

## Requirements closed
- TOUR-05: email PDF delivery + T-24h/T-2h/T+1h push cadence
