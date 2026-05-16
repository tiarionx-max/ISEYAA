---
phase: 05-ai-concierge-kyc
plan: "04"
subsystem: backend/ai
tags: [ai, tool-use, sse, streaming, vector, agentic-loop, tdd-red-green]
dependency_graph:
  requires: [05-02]
  provides: [streamChatWithTools, getRecommendations, ChatDto, 5-tool-executors]
  affects:
    - backend/src/modules/ai/ai.service.ts
    - backend/src/modules/ai/ai.controller.ts
    - backend/src/modules/ai/ai.module.ts
    - backend/src/modules/ai/dto/chat.dto.ts
    - backend/src/modules/ai/__tests__/ai.service.spec.ts
tech_stack:
  added: []
  patterns: [claude-tool-use-agentic-loop, sse-streaming, upstash-vector-personalisation, tdd-red-green]
key_files:
  created:
    - backend/src/modules/ai/dto/chat.dto.ts
  modified:
    - backend/src/modules/ai/ai.service.ts
    - backend/src/modules/ai/ai.controller.ts
    - backend/src/modules/ai/ai.module.ts
    - backend/src/modules/ai/__tests__/ai.service.spec.ts
decisions:
  - "streamChat (single-message) replaced by streamChatWithTools (multi-turn ChatDto) — old signature breaks mobile but 05-05 catches up immediately"
  - "finalMessage() used instead of reconstructing tool input from input_json_delta deltas (RESEARCH Pitfall 1)"
  - "get_ride_estimate and get_weather are MVP stubs with logger.warn — real implementations deferred to Phase 6"
  - "getRecommendations returns {context, suggestions:[]} with empty suggestions — full ranking is Phase 6 enhancement"
  - "VectorService.upsertInteraction called fire-and-forget after res.end() — vector downtime cannot affect the already-closed SSE response"
metrics:
  duration: "18m"
  completed: "2026-05-16"
  tasks: 2
  files: 5
---

# Phase 5 Plan 04: AI Concierge Tool-Use Streaming + Vector Recommendations Summary

Upgraded AiService from single-turn chat to multi-turn agentic streaming with Claude tool_use. Five tools registered (get_attractions, get_events, get_stays, get_ride_estimate, get_weather). Added /ai/recommend endpoint backed by Upstash Vector personalisation. Controller updated to multi-turn ChatDto contract.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 (RED) | Failing tests for streamChatWithTools + getRecommendations | eb523bd | ai.service.spec.ts |
| 1 (GREEN) | ChatDto + streamChatWithTools + 5 tools + getRecommendations | e424bdc | chat.dto.ts, ai.service.ts, ai.module.ts |
| 2 | AiController: replace /ai/chat + add /ai/recommend | 3ad9ded | ai.controller.ts |

## Upgraded Endpoint Contracts

### POST /api/v1/ai/chat (upgraded)
**Auth:** JWT required (`@UseGuards(JwtAuthGuard)`)

**Request body (new multi-turn signature):**
```json
{
  "messages": [
    { "role": "user", "content": "Show me 3 attractions in Abeokuta" }
  ],
  "conversationId": "optional-uuid"
}
```

**Response:** SSE stream
```
data: {"text":"In Abeokuta, you'll find several beautiful attractions..."}
data: {"tool":"get_attractions","result":{"count":3,"items":[...]}}
data: {"text":"Here are the top 3 attractions I found for you:"}
data: [DONE]
```

**Limits:** ArrayMaxSize(20) messages; MaxLength(4000) per content; max 3 tool turns; max_tokens=1024 per Claude turn.

### POST /api/v1/ai/recommend (new)
**Auth:** JWT required

**Request body:**
```json
{ "query": "historical sites near Abeokuta" }
```

**Response:**
```json
{
  "context": "User previously asked about Olumo Rock and Ogun State history",
  "suggestions": []
}
```
Note: `suggestions` is empty in MVP — full ranking deferred to Phase 6. `context` string surfacing confirms vector personalisation is wired.

## Tool Schema Definitions

| Tool Name | Description | Required Inputs | Optional Inputs |
|-----------|-------------|-----------------|-----------------|
| `get_attractions` | Tourist attractions in Ogun State | `lgaSlug` | `category` (enum), `limit` |
| `get_events` | Upcoming events (approved/published) | none | `lgaSlug`, `days`, `limit` |
| `get_stays` | Accommodation listings | none | `lgaSlug`, `maxPriceNgn`, `limit` |
| `get_ride_estimate` | Ride cost estimate (stub) | `pickup`, `dropoff` | `vehicleType` |
| `get_weather` | Weather conditions (stub) | `location` | none |

## Example SSE Transcript

```
POST /api/v1/ai/chat
Content-Type: application/json
Authorization: Bearer <jwt>

{"messages":[{"role":"user","content":"What's on this weekend in Abeokuta?"}]}

---

data: {"text":"Let me check what events are happening in Abeokuta this weekend!"}
data: {"tool":"get_events","result":{"count":2,"items":[{"id":"ev-1","title":"Abeokuta Cultural Fiesta","startDate":"2026-05-17T10:00:00.000Z","venue":"Centenary Hall"},{"id":"ev-2","title":"Ogun Tourism Night","startDate":"2026-05-18T19:00:00.000Z","venue":"Olumo Rock Amphitheatre"}]}}
data: {"text":"This weekend in Abeokuta, there are two great events:\n\n1. **Abeokuta Cultural Fiesta** — Saturday at Centenary Hall\n2. **Ogun Tourism Night** — Sunday evening at Olumo Rock Amphitheatre\n\nWould you like to know more about either event, or shall I find accommodation nearby?"}
data: [DONE]
```

## Vector Personalisation Flow

```
streamChatWithTools(userId, dto, res)
  └─ vector.getPersonalisedContext(userId, lastUserMsg)
       └─ returns '' (stub mode) or top-5 matching past interactions
  └─ buildSystemPrompt(personalisedContext)
       └─ appends PERSONALISED CONTEXT block when non-empty
  └─ ... agentic loop ...
  └─ res.end()
  └─ vector.upsertInteraction(userId, lastUserMsg, accumulatedText).catch(...)
       └─ fire-and-forget: vector downtime cannot affect closed SSE response
```

## TDD Gate Compliance

- RED commit `eb523bd`: `test(05-04): add failing tests for streamChatWithTools + getRecommendations (RED)` — TypeScript compile errors on missing methods + VectorService injection
- GREEN commit `e424bdc`: `feat(05-04): implement streamChatWithTools + ChatDto + getRecommendations (GREEN)` — all 11 ai.service tests pass

## Test Results

```
Test Suites: 21 passed, 21 total
Tests:       270 passed, 270 total
```

Baseline was 264. Delta: +6 new ai.service tests (all pass). Zero regressions.

### ai.service.spec.ts test inventory (11 tests)

| Test | Status |
|------|--------|
| streamItinerary: emits status, delta, itinerary, and done events | pass |
| streamItinerary: emits parsed itinerary with title from Claude response | pass |
| streamItinerary: emits error event when LGA not found | pass |
| streamItinerary: fetches events only within the trip window | pass |
| streamChatWithTools: writes [DONE] to res and calls res.end() on end_turn | pass |
| streamChatWithTools: calls vector.upsertInteraction exactly once after stream ends | pass |
| streamChatWithTools: calls vector.getPersonalisedContext with userId and last user message | pass |
| streamChatWithTools: emits data:{tool:"get_attractions"} event + calls prisma.attraction.findMany | pass |
| getRecommendations: returns {context, suggestions:[]} and calls vector.getPersonalisedContext | pass |
| executeTool: get_weather returns stub object with correct location | pass |
| executeTool: get_ride_estimate returns stub object | pass |

## Deviations from Plan

### Plan reference says `import from './vector.service'` but correct path is `../../common/services/vector.service`

**Rule 3 — blocking issue:** The plan's `<action>` step 2a noted "NOTE: research/patterns spec puts the file under `ai/`, but per Wave 2 it lives in `common/services/`..." — correctly pre-documented. Used the `../../common/services/vector.service` import path as specified.

No other deviations.

## Known Stubs

| Stub | File | Reason |
|------|------|--------|
| `tool_get_ride_estimate` returns hardcoded {estimateNgn: 1500, stub: true} | ai.service.ts | Full implementation requires geocoder integration (Phase 6) |
| `tool_get_weather` returns hardcoded {temperatureC: 29, condition: 'partly cloudy', stub: true} | ai.service.ts | No weather provider in MVP scope |
| `getRecommendations` returns `suggestions: []` always | ai.service.ts | Full ranking algorithm is Phase 6 enhancement; context string from vector is functional |

These stubs are intentional and documented in plan `<behavior>`. They do not prevent the plan's goal (tool-use SSE streaming + vector personalisation wiring) from being achieved.

## Threat Surface Scan

Two new endpoints introduced: POST /ai/chat (upgraded) and POST /ai/recommend (new). Both are behind JwtAuthGuard. Threat mitigations verified:

| Threat ID | Status |
|-----------|--------|
| T-05-15 (Prompt injection) | Mitigated — system prompt established before user messages; all tools are read-only Prisma queries (isActive/status:PUBLISHED filter) |
| T-05-16 (Data leak via tool result) | Mitigated — tools query only public listings (attractions, events, properties); never wallet/transactions/KYC/other-user PII |
| T-05-17 (Unbounded tool loop DoS) | Mitigated — hard cap of 3 turns in loop; max_tokens=1024 per turn |
| T-05-19 (Upstash filter injection) | Mitigated — userId from req.user.userId (JWT), never from body; comment preserved in VectorService |
| T-05-20 (accumulatedText upserted) | Accepted per plan — index is per-user; Upstash erasure flow tracked for Phase 6 |

## Self-Check: PASSED

- [x] backend/src/modules/ai/dto/chat.dto.ts — created (ChatDto + MessageDto)
- [x] backend/src/modules/ai/ai.service.ts — streamChatWithTools + getRecommendations + 5 tool executors + TOOLS array
- [x] backend/src/modules/ai/ai.controller.ts — /ai/chat uses ChatDto + streamChatWithTools; /ai/recommend added
- [x] backend/src/modules/ai/ai.module.ts — VectorService comment added
- [x] backend/src/modules/ai/__tests__/ai.service.spec.ts — 11 tests, all pass
- [x] Commit eb523bd (RED) in git log
- [x] Commit e424bdc (GREEN) in git log
- [x] Commit 3ad9ded (Task 2) in git log
- [x] 270 backend tests pass (264 baseline + 6 new ai tests)
- [x] `grep -c "tools: this\\.TOOLS\|finalMessage()" backend/src/modules/ai/ai.service.ts` returns non-zero
- [x] `grep -c "vector\\.upsertInteraction\|getPersonalisedContext" backend/src/modules/ai/ai.service.ts` returns non-zero
