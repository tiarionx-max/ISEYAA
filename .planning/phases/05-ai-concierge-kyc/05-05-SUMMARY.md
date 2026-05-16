---
phase: 05-ai-concierge-kyc
plan: "05"
subsystem: mobile
tags: [ai-chat, sse, react-native, expo, async-storage, driver-polling]
requires:
  - 05-04
provides:
  - mobile/app/ai-chat.tsx
  - ai-chat screen registration
  - Profile AI Concierge entry point
  - Driver APPROVED polling
affects:
  - mobile/app/_layout.tsx
  - mobile/app/(tabs)/profile.tsx
  - mobile/app/(tabs)/driver.tsx
tech-stack:
  added: []
  patterns:
    - react-native-sse EventSource for per-message SSE streaming
    - inverted FlatList for chat UI
    - AsyncStorage chat history persistence (ai_chat_history key, 100-message cap)
    - useQuery refetchInterval lambda for conditional polling
key-files:
  created:
    - mobile/app/ai-chat.tsx
  modified:
    - mobile/app/_layout.tsx
    - mobile/app/(tabs)/profile.tsx
    - mobile/app/(tabs)/driver.tsx
key-decisions:
  - SSE connection is per-message (open, stream, close) not persistent — react-native-sse EventSource opened in handleSend, closed in onDone/handleError
  - Tool card icon-to-name mapping: get_attractions=MapPin, get_events=Calendar, get_stays=Home, get_ride_estimate=Car, get_weather=Cloud
  - AsyncStorage key ai_chat_history, trimmed to last 100 messages on every persist
  - Driver profile polling uses useQuery refetchInterval lambda stopping at APPROVED status
requirements-completed: [AI-01, AI-04, AI-05]
duration: "2 min"
completed: "2026-05-16"
---

# Phase 5 Plan 05: Mobile AI Chat Screen Summary

Full-screen SSE chat screen wired to the Wave 4 backend, with AsyncStorage history persistence, tool-call result cards, and driver APPROVED status polling.

## Duration

- Start: 2026-05-16T17:50:49Z
- End: 2026-05-16T17:53:17Z
- Duration: ~2 min
- Tasks completed: 3/3
- Files created: 1
- Files modified: 3

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Build mobile/app/ai-chat.tsx | 17cea68 | mobile/app/ai-chat.tsx (608 lines) |
| 2 | Register screen in _layout.tsx + Profile menu | 36f0d8d | mobile/app/_layout.tsx, mobile/app/(tabs)/profile.tsx |
| 3 | Driver APPROVED polling (AI-04) | cfd385c | mobile/app/(tabs)/driver.tsx |

## What Was Built

### Task 1 — AI Chat Screen (`mobile/app/ai-chat.tsx`)

A 608-line React Native screen implementing the UI-SPEC Screen 1 contract:

- **SSE streaming**: Opens a `new EventSource(${API_BASE}/ai/chat, { method:'POST', ... })` per send. Events: `{"text":"..."}` appended to the current AI bubble in-place; `{"tool":"...","result":{...}}` attached as a ToolCard; `[DONE]` sentinel closes the stream and re-enables the send button.
- **Message bubbles**: User bubble (GOLD-tinted, `rgba(200,150,42,0.15)`, right-aligned); AI bubble (FOREST-tinted, `rgba(26,107,60,0.25)`, left-aligned). Both show formatted timestamps below.
- **Tool cards**: Inline cards inside AI bubble with `MapPin/Calendar/Home/Car/Cloud` icons per tool type. Label and body text derived from result payload.
- **Typing indicator**: Three `Animated.loop(Animated.sequence([...]))` dots with staggered delays 0/200/400ms. `accessibilityLabel="ISEYAA is typing"`, `accessibilityRole="progressbar"`.
- **Empty state**: Bot icon (size 48, GOLD) with heading "Ask me anything about Ogun State" and body copy from UI-SPEC.
- **Input bar**: Multiline TextInput + 44×44 Send button; disabled while streaming.
- **AsyncStorage**: Loads `ai_chat_history` on mount (JSON array); persists every message update, trimmed to last 100.
- **Cleanup**: `esRef.current?.close()` in `useEffect` cleanup on unmount.

### Task 2 — Navigation Registration + Profile Menu

- `_layout.tsx`: Added `<Stack.Screen name="ai-chat" options={{ title: 'AI Concierge', presentation: 'card' }} />` after qr-checkin. Inherits `headerStyle`/`headerTintColor` from `screenOptions`.
- `profile.tsx`: Added `MessageSquare` to the `lucide-react-native` import. Added `{ label: 'AI Concierge', icon: MessageSquare, onPress: () => router.push('/ai-chat') }` as the first item in the Account section (before Security and Settings).

### Task 3 — Driver APPROVED Polling (AI-04)

Replaced the `useEffect` API call for `/transport/drivers/me` with a `useQuery` call that includes:

```typescript
refetchInterval: (data: any) => data?.status === 'APPROVED' ? false : 5000,
```

Polling stops automatically once `status === 'APPROVED'`. A separate `useEffect` syncs the query result to the `driverStatus` state variable used for the online/offline toggle gate. This ensures a driver who completes KYC and receives admin approval sees the UI update within 5 seconds.

## Screen Structure

```
AiChatScreen
  KeyboardAvoidingView (JUNGLE background)
    SafeAreaView (flex:1, edges bottom)
      [messages.length === 0]
        EmptyState (Bot icon + copy)
      [messages.length > 0]
        FlatList (inverted, reversed data array)
          MessageBubble × N
          ListHeaderComponent: TypingIndicator (when isStreaming)
      InputBar (TextInput + Send button)
```

## Tool Card Icon-to-Name Mapping

| Tool name | Icon | Label format |
|-----------|------|--------------|
| get_attractions | MapPin | "Found {count} attractions" |
| get_events | Calendar | "{count} upcoming events" |
| get_stays | Home | "{count} properties found" |
| get_ride_estimate | Car | "Ride estimate: ₦{low} – ₦{high}" |
| get_weather | Cloud | "{location}: {temp}°C, {condition}" |

## SSE Error Handling

- `JSON.parse` wrapped in `try/catch` — malformed events silently ignored
- `parsed.error` field triggers `handleError()` → destructive-styled AI bubble
- `'error'` EventSource listener calls `handleError('connection')`
- Both paths: `setIsStreaming(false)`, `esRef.current?.close()`

## AsyncStorage Design

- Key: `'ai_chat_history'`
- Format: JSON array of `Message` objects (id, role, content, timestamp, toolCards, isError)
- Cap: 100 messages (`slice(-MAX_STORED_MESSAGES)`) on every persist
- On corrupt parse: silently ignored (empty state shown)
- Security: T-05-21 accepted — chat content is non-PII Ogun State information

## Deviations from Plan

**1. [Rule 1 - Bug] Removed `color` and `maxHeight` as direct TextInput props**
- **Found during:** Task 1 TypeScript compilation
- **Issue:** `color` is not a valid `TextInputProps` prop at the JSX level (it belongs in the style); `maxHeight` must be in the `style` object
- **Fix:** Moved both into `styles.inputBox` where they belong; the `as const` cast on `color: 'white'` ensures type safety
- **Files modified:** mobile/app/ai-chat.tsx
- **Commit:** 17cea68 (fixed before commit)

**Total deviations:** 1 auto-fixed (Rule 1 — bug). **Impact:** None — fix was caught by `tsc --noEmit` before commit; behavior unchanged.

## Threat Surface Scan

No new network endpoints or auth paths introduced by this plan. The SSE call uses the existing `/api/v1/ai/chat` endpoint (Wave 4). AsyncStorage usage is consistent with T-05-21 (accepted). No new threat surface.

## Self-Check

- [x] `mobile/app/ai-chat.tsx` exists (608 lines, ≥ 250 requirement met)
- [x] Imports `EventSource` from `react-native-sse`
- [x] Uses `inverted` prop on FlatList
- [x] Persists to `ai_chat_history` AsyncStorage key
- [x] Uses FOREST/GOLD/JUNGLE constants
- [x] `mobile/app/_layout.tsx` contains `name="ai-chat"`
- [x] `mobile/app/(tabs)/profile.tsx` contains `MessageSquare` and `AI Concierge`
- [x] `mobile/app/(tabs)/driver.tsx` contains `refetchInterval` and `APPROVED`
- [x] `cd mobile && npx tsc --noEmit` exits 0 (verified)
- [x] Commits exist: 17cea68, 36f0d8d, cfd385c

## Self-Check: PASSED

## Next

Phase 5 Plan 06 (KYC mobile screen) is the next plan in the phase.
