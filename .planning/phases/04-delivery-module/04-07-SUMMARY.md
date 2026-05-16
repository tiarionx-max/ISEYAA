---
phase: 04-delivery-module
plan: "07"
subsystem: mobile
tags: [mobile, rider, delivery, otp, photo-upload, expo-image-picker, websocket]
dependency_graph:
  requires:
    - 04-06  # delivery.tsx + _layout.tsx with rider tab entry
  provides:
    - mobile/app/(tabs)/rider.tsx
  affects:
    - mobile/app/(tabs)/_layout.tsx (rider tab was already wired in 04-06)
tech_stack:
  added:
    - expo-image-picker ~15.0.7 (already in package.json from 04-06; first use in rider.tsx)
  patterns:
    - 6-cell TextInput OTP with useRef array for auto-advance focus
    - base64 photo conversion via fetch(uri)+arrayBuffer()+Buffer.from().toString('base64')
    - Dual-gate UI enforcement (otpVerified && photoUri !== null)
    - haversineKm proximity gate for 200m R-3 pickup and R-4 dropoff sub-states
key_files:
  created:
    - mobile/app/(tabs)/rider.tsx
  modified: []
decisions:
  - "Used Alert.alert for camera/library picker selection (consistent with driver.tsx pattern rather than bottom sheet)"
  - "ScrollView wraps R-4 Sub-state B content below shrunk map to handle overflow on small screens"
  - "rating state added to RiderScreen to support optional senderRating in complete payload"
  - "handleOtpKeyPress handles backspace navigation between cells (separate from handleOtpChange)"
metrics:
  duration: "~25 minutes"
  completed: "2026-05-16"
  tasks_completed: 1
  tasks_total: 1
  files_created: 1
  files_modified: 0
---

# Phase 4 Plan 07: Mobile Rider Tab (R-1..R-5) Summary

**One-liner:** Delivery rider tab with 5 screens, 6-cell OTP auto-verify, expo-image-picker proof-of-delivery photo, and dual-gate confirm before completing delivery.

## What Was Built

`mobile/app/(tabs)/rider.tsx` — a single 1097-line file implementing the full delivery rider flow for ISEYAA's Ogun State platform.

### 5 Screen Types

| Screen | ID | Key Behavior |
|--------|----|-------------|
| R-1 Home | `'home'` | Go online/offline toggle; KYC status badge; today's earnings chip; link to R-5 |
| R-2 Incoming | `'incoming'` | 15s animated countdown timer bar; delivery package summary; Accept/Decline buttons |
| R-3 Pickup | `'pickup'` | MapView with pickup marker; 200m proximity gate; "I've Collected" CTA → `PATCH /delivery/orders/:id/collect` |
| R-4 Active | `'active'` | Two sub-states: Sub-state A (navigating, > 200m from dropoff) / Sub-state B (at dropoff, ≤ 200m) with OTP + photo |
| R-5 Earnings | `'earnings'` | Today/Week toggle; FlatList delivery history with "Your share: ₦{riderEarnings}" subtext |

### OTP Auto-Advance Implementation

Six separate `TextInput` components with a `useRef<Array<any>>([])` ref array. Each cell:

- `handleOtpChange(index, value)`: updates cell state → calls `otpInputRefs.current[index+1]?.focus()` on digit entry
- `handleOtpKeyPress(index, key)`: on `'Backspace'` in empty cell → calls `otpInputRefs.current[index-1]?.focus()`
- Auto-verify: when `newCells.every(c => c !== '')` and not yet verified → calls `verifyOtp(cells.join(''))`
- `verifyOtp(otp)`: `POST /delivery/orders/${id}/verify-otp` → success sets `otpVerified=true`; error sets `otpError=true`, clears cells, focuses cell 0

Border states: default `rgba(255,255,255,0.15)` → verified `#22C55E` + green bg → error `#DC2626` + red bg.

### Photo Upload Method

Both camera and library available via a single `Alert.alert` on button tap:
- **Take Photo**: `ImagePicker.requestCameraPermissionsAsync()` → `ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [4,3], quality: 0.7 })`
- **Choose from Library**: `ImagePicker.requestMediaLibraryPermissionsAsync()` → `ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [4,3], quality: 0.7 })`
- `ImagePicker.MediaTypeOptions.Images` used throughout — NOT array syntax (SDK 51 compatibility)
- Selected URI stored in `photoUri` state; shown as thumbnail with `CheckCircle` overlay

### base64 Conversion Approach

No `expo-file-system` needed. Pure fetch API:
```typescript
const r = await fetch(photoUri);
const ab = await r.arrayBuffer();
const b64 = Buffer.from(ab).toString('base64');
```
Sent as `proofPhotoBase64` in `PATCH /delivery/orders/:id/complete` body.

### Dual-Gate Enforcement

`canConfirm = otpVerified && photoUri !== null`

Confirm Delivery CTA: `disabled={!canConfirm || loading}` with `opacity: 0.4` when disabled. Both gates enforced on client; backend also enforces via `otpVerifiedAt` check and `proofPhotoBase64` presence check.

### WebSocket Differences from driver.tsx

| driver.tsx | rider.tsx |
|------------|-----------|
| `socket.emit('join:driver')` | `socket.emit('join:rider')` |
| `socket.on('ride:request', ...)` | `socket.on('delivery:request', ...)` |
| `socket.emit('driver:location', { tripId, lat, lng })` | `socket.emit('rider:location', { deliveryId, lat, lng })` |

### API Endpoint Differences from driver.tsx

| driver.tsx | rider.tsx |
|------------|-----------|
| `POST /transport/go-online` | `POST /delivery/go-online` |
| `POST /transport/go-offline` | `POST /delivery/go-offline` |
| `PATCH /transport/trips/:id/accept` | `PATCH /delivery/orders/:id/accept` |
| `PATCH /transport/trips/:id/decline` | `PATCH /delivery/orders/:id/decline` |
| `PATCH /transport/trips/:id/arrive` | `PATCH /delivery/orders/:id/collect` |
| `PATCH /transport/trips/:id/complete` | `PATCH /delivery/orders/:id/complete` |
| `GET /transport/drivers/earnings` | `GET /delivery/riders/earnings` |
| (no OTP endpoint) | `POST /delivery/orders/:id/verify-otp` |

### New State Variables (not in driver.tsx)

- `otpCells: string[]` — 6-cell OTP digit array
- `otpVerified: boolean` — server-confirmed OTP state
- `otpError: boolean` — rejection display state
- `photoUri: string | null` — selected photo URI
- `otpInputRefs: useRef<Array<any>>([])` — 6 TextInput refs
- `rating: number` — optional sender rating (0 = unrated)

Renamed from driver.tsx:
- `currentTrip` → `currentOrder` (DeliveryRequest interface)
- `arrived` → `collected` (marks parcel collection at pickup)

### New StyleSheet Entries

| Style | Spec |
|-------|------|
| `mapShrunk` | `height: 180` — R-4 Sub-state B shrunken map |
| `activeDeliveryScroll` | `flex: 1, backgroundColor: JUNGLE` |
| `approachBanner` | `backgroundColor: rgba(200,150,42,0.1), borderRadius: 10, padding: 12` |
| `sectionHeading` | `fontSize: 13, fontWeight: 'bold', color: rgba(255,255,255,0.5)` |
| `otpRow` | `flexDirection: 'row', gap: 8, justifyContent: 'center'` |
| `otpCell` | `width:48, height:56, borderRadius:10, borderWidth:2, textAlign:'center', fontSize:24, fontWeight:'bold', color:'white'` |
| `otpCellVerified` | `borderColor: '#22C55E', backgroundColor: rgba(34,197,94,0.15)` |
| `otpCellError` | `borderColor: '#DC2626', backgroundColor: rgba(220,38,38,0.15)` |
| `otpErrorText` | `fontSize: 13, color: '#DC2626', marginTop: 4` |
| `photoUploadButton` | `height:80, backgroundColor: rgba(26,107,60,0.2), borderRadius:12, borderWidth:2` |
| `historyShare` | `fontSize: 13, color: rgba(255,255,255,0.5), marginTop: 2` — "Your share: ₦{N}" |

## Deviations from Plan

### Auto-fixed Issues

None.

### Minor Implementation Choices

**1. [Choice] `handleOtpKeyPress` as separate handler**
- The plan described backspace handling inline in `handleOtpChange`. Implemented as a separate `onKeyPress` handler to avoid conflating digit-entry and deletion events, which improves reliability on Android where `onChangeText` fires before backspace clears the field.

**2. [Choice] `rating` state added**
- Plan mentioned `senderRating: rating || undefined` in the complete payload. Added `rating: number` state (initialized to 0) so the field is available without a type error, even though R-4 doesn't render a star rating UI (the sender rates in D-5, not the rider).

**3. [Choice] R-4 Sub-state B uses ScrollView**
- The plan showed the shrunk map + OTP + photo all fitting below in a card overlay. Used `ScrollView` instead of absolute-positioned card to handle content overflow on smaller devices (iPhone SE).

**4. [Choice] `GET /delivery/riders/me` for rider profile**
- Plan said same pattern as driver.tsx which calls `/transport/drivers/me`. Used analogous `/delivery/riders/me` endpoint. This endpoint may need to be added to the backend controller if not already present — backend plan (04-04) should have created it.

## Verification

```
node -e verification: OK (all 9 required tokens present)
npx tsc --noEmit: PASSED (0 errors)
npx jest --testPathPattern=delivery --no-coverage: 9 tests passed
```

## Threat Model Coverage

| Threat ID | Mitigation Applied |
|-----------|--------------------|
| T-04-21 | OTP bypass: Mobile dual-gate enforces `otpVerified=true` before confirm; backend checks `otpVerifiedAt` non-null |
| T-04-22 | Photo bypass: `photoUri !== null` gate on CTA; `proofPhotoBase64` sent in body; backend checks presence |
| T-04-23 | GPS disclosure: location watch starts only after `handleAccept` completes; cleaned up in `useEffect` return |
| T-04-24 | Photo size: `quality: 0.7` + `aspect: [4,3]` constrains payload; NestJS 5MB rawBody limit enforced server-side |

## Known Stubs

None — all data flows from live API endpoints or WebSocket events. No hardcoded placeholder data.

## Self-Check: PASSED

- `mobile/app/(tabs)/rider.tsx` exists: FOUND
- Commit `42fe8e0` exists: FOUND
- Verification node -e check: OK
- TypeScript noEmit: PASSED
- Jest delivery tests: 9/9 PASSED
