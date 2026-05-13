---
plan: 03-07
phase: 03-transport-module
status: complete
wave: 7
requirements: [TRANSPORT-01, TRANSPORT-04, TRANSPORT-06, TRANSPORT-07, TRANSPORT-08]
completed: 2026-05-13
---

# Plan 03-07 — Mobile Driver Tab Summary

## What Was Built

Driver-side mobile experience: go-online/offline toggle with GPS watch, incoming-request modal with 15-second timer, active-pickup flow with explicit PATCH /arrive + PATCH /start two-step lifecycle, active-trip completion with wallet credit banner, and earnings dashboard. Both transport and driver tabs registered in the tab navigator.

## Key Changes

### mobile/app/(tabs)/_layout.tsx (modified)
- Added `Car` and `Truck` to lucide imports
- Inserted `Tabs.Screen name="transport"` and `Tabs.Screen name="driver"` before the profile tab
- Both tabs now reachable in the running mobile app

### mobile/app/(tabs)/driver.tsx (800 lines, created)

Five-screen state machine (`'home' | 'incoming' | 'pickup' | 'active' | 'earnings'`):

**D-1 Home:**
- Status dot (online: #22C55E, offline: #6B7280) + label
- Large 120×120 circular go-online/offline toggle (FOREST tint + green border when online; gray when offline)
- Go-offline confirmation Alert before toggling
- Today's earnings chip (GOLD 24px)
- Driver-status warning banner for PENDING_REVIEW / REJECTED / SUSPENDED states
- "View Earnings Dashboard" link → D-5

**D-2 Incoming Request:**
- Animated.timing progress bar (GOLD → red when <5s)
- "{N}s to respond" countdown (15s)
- Pickup/dropoff address rows, distance, 24px GOLD fare
- Accept (FOREST) + Decline (red destructive) side-by-side buttons
- Auto-dismiss after 15s timeout

**D-3 Active Pickup (two-step lifecycle):**
- MapView with rider pickup marker (GOLD) + driver marker (FOREST)
- `provider={Platform.OS === 'android' ? 'google' : undefined}` — Pitfall 6 compliant
- **Step 1:** "I've Arrived" CTA (disabled/relabeled "Approach pickup point" when >200m from pickup)
  → `PATCH /transport/trips/:id/arrive` → `setArrived(true)` → CTA swaps to Step 2
- **Step 2:** "Start Trip" CTA (FOREST)
  → `PATCH /transport/trips/:id/start` → transitions to D-4 'active'

**D-4 Active Trip:**
- MapView with destination marker (GOLD) + driver marker (FOREST)
- Fare reminder: "₦{fare} — your share: ₦{driverEarnings}" (24px GOLD)
- "Complete Trip" CTA (FOREST) → Alert confirmation → `PATCH /transport/trips/:id/complete`
- Inline credit banner: "₦{driverEarnings} credited to your wallet." (green tint)
- Auto-transitions to Earnings after 2s

**D-5 Earnings Dashboard:**
- Today / This Week period segmented control (FOREST bg on active)
- 48px GOLD total earnings
- Stats row: Trips, Acceptance %, Avg Rating
- FlatList trip history rows
- Empty state: "No trips completed {period}. Go online to start earning."

**GPS lifecycle:**
- `Location.watchPositionAsync({ accuracy: High, timeInterval: 2000, distanceInterval: 0 })`
- Started on go-online, stopped on go-offline or unmount
- Each update: `socket.emit('driver:location', { tripId, lat, lng })` + `api.post('/transport/go-online', ...)` heartbeat

**WebSocket:**
- `io(WS_BASE, { transports: ['websocket'], auth: { token } })` — Pitfall 3 compliant
- `socket.emit('join:driver')` on connect → joins `driver:{userId}` room
- `socket.on('ride:request', ...)` → D-2 incoming request modal

## Commits

| Hash | Message |
|------|---------|
| 663f69d | feat(03-07): mobile Driver tab (5-screen, GPS watch, PATCH arrive+start) + tab layout |

## Verification

| Check | Result |
|-------|--------|
| ≥400 lines | ✅ 800 lines |
| `transports: ['websocket']` | ✅ |
| `Platform.OS === 'android' ? 'google' : undefined` | ✅ 2 occurrences |
| `watchPositionAsync` | ✅ |
| `timeInterval: 2000` | ✅ |
| `/transport/go-online` + `/transport/go-offline` | ✅ |
| `/transport/trips/:id/` (accept, decline, arrive, start, complete) | ✅ 5 occurrences |
| `/arrive` + `/start` explicit PATCHes | ✅ |
| `/transport/drivers/earnings` | ✅ 2 occurrences |
| `ride:request` + `join:driver` WS events | ✅ |
| "credited to your wallet" copy | ✅ 2 occurrences |
| "I've Arrived" + "Start Trip" CTAs | ✅ |
| PENDING_REVIEW / REJECTED / SUSPENDED branches | ✅ 3 occurrences |
| `name="transport"` + `name="driver"` in _layout.tsx | ✅ |

## Self-Check: PASSED

## Notes
- Wave 6 (Plan 06) ran first — react-native-maps, expo-location, socket.io-client were installed before this plan ran
- Visual verification deferred to Plan 08 human checkpoint
- `/transport/drivers/me` endpoint (used to load driverStatus) is not in Plan 05's controller — if missing, driver status will silently remain null (no crash); endpoint can be added as a future enhancement or in Plan 08 gap closure
