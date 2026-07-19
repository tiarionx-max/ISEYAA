---
phase: 17-grpc-proof-of-pattern-extraction-notifications-service
verified: 2026-07-19T13:07:22Z
status: passed
score: 4/4 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 3/4
  gaps_closed:
    - "Web/mobile REST responses that depend on notifications are unchanged in shape and behavior before and after extraction — no client-visible regression (Truth #3)"
  gaps_remaining: []
  regressions: []
---

# Phase 17: gRPC Proof-of-Pattern Extraction (Notifications Service) Verification Report

**Phase Goal:** `notifications-service` runs as a genuinely separate deployable process, called from the monolith exclusively via `ClientGrpc`, proving the extraction pattern end-to-end with zero behavior change to REST clients — while confirming no other payment-path module is extracted this milestone
**Verified:** 2026-07-19T13:07:22Z
**Status:** passed
**Re-verification:** Yes — after gap closure (Plan 17-07)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A documented caller-graph audit (every direct injection of `NotificationsService`, grepped across the whole monolith) precedes the extraction cutover | ✓ VERIFIED | Unchanged since prior pass (regression check only). `.planning/phases/17-.../17-CALLER-GRAPH-AUDIT.md` still present, committed (`dab61bc`) before the cutover commits (`8e70aab`, `47043c3`). No files touched by Plan 17-07 affect this truth. |
| 2 | `notifications-service` runs as a separately deployed process (own Railway service + local docker-compose block), called exclusively via `ClientGrpc` — zero remaining in-process direct injections of the notifications class | ✓ VERIFIED | Regression check: `docker-compose.yml` still has the `notifications-service:` block (port 5008, own Dockerfile, bidirectional `depends_on`); `NOTIFICATIONS_SERVICE_URL: notifications-service:5008` on the `backend` service. `railway.toml` still declares the standalone build/deploy config. Re-ran the exclusion grep (see Truth 4) — unaffected by 17-07. |
| 3 | Web/mobile REST responses that depend on notifications are unchanged in shape and behavior before and after extraction — no client-visible regression | ✓ VERIFIED (was FAILED) | **Gap closed by Plan 17-07.** Read `backend/apps/notifications-service/src/notifications-grpc.controller.ts` directly: `sendPush()` now captures `NotificationsService.sendPush()`'s real return value into `result` and returns `{ success: result.sent }` (line 12-13) — no longer hardcodes `true`. Read `backend/src/modules/notifications-client/notifications-client.service.ts` directly: `sendPush()` now captures `resilience.execute<notifications.SendPushResponse>(...)`'s resolved value into `res` and returns `{ sent: res.success }` (line 63-67) — no longer hardcodes `true`. Independently ran `grep -n "success: true\|success: result.sent"` on the controller: only the (correctly out-of-scope) `registerToken` handler's `success: true` remains, confirmed legitimate by reading `notifications.service.ts:57-65` — `registerToken()` has zero failure branches, always resolves `{ registered: true }` unless it throws, so a static `success: true` there is not a bug. Independently ran `grep -n "sent: true\|res.success"` on the client facade: no hardcoded `sent: true` remains; `res.success` is read. |
| 4 | Wallet, Transport, Delivery, Events, Stays, Marketplace, Auth, and all Tour Packages/Guides/Bookings modules remain in-process and are not marked "extracted" — zero `ClientGrpc`/`ClientProxyFactory` usage for those modules | ✓ VERIFIED | Regression check, independently re-run: `grep -rln "ClientGrpc\|ClientsModule" backend/src/modules/{wallet,transport,delivery,events,stays,marketplace,auth,tour-bookings,tour-packages,tour-guides}` returns zero matches (exit code 1). Unaffected by 17-07's diff. |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/apps/notifications-service/src/notifications-grpc.controller.ts` | `sendPush` maps real send outcome, not hardcoded success | ✓ VERIFIED | Read directly: `const result = await this.notificationsService.sendPush(...); return { success: result.sent };` |
| `backend/src/modules/notifications-client/notifications-client.service.ts` | `sendPush()` reads gRPC response body's `success` field | ✓ VERIFIED | Read directly: `const res = await this.resilience.execute<notifications.SendPushResponse>(...); return { sent: res.success };` |
| `backend/src/modules/notifications-client/__tests__/notifications-client.service.spec.ts` | New test proving the no-token/business-failure path resolves `{ sent: false }` | ✓ VERIFIED | Test `4c` present (lines 123-131): mocks `mockGrpcService.sendPush.mockReturnValue(of({ success: false }))`, asserts `svc.sendPush(...)` resolves `{ sent: false }` without throwing. Ran independently: passes. |
| All other Phase 17 artifacts (caller-graph audit, docker-compose, railway.toml, .env.example, resilience.service.ts gRPC status mapping, proto `data` field) | Unchanged since prior verification pass | ✓ VERIFIED (regression) | No file outside Plan 17-07's declared `files_modified` list was touched; spot-checked docker-compose.yml and the exclusion grep above. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `notifications-grpc.controller.ts` (server) | `NotificationsService.sendPush()` real result | response mapping | ✓ WIRED (was NOT WIRED) | Real `{ sent, reason }` result is now captured into `result` and mapped to `{ success: result.sent }` — no longer discarded. This closes the Truth 3 gap. |
| `notifications-client.service.ts` (client) | gRPC `SendPushResponse` body | response mapping | ✓ WIRED (was NOT WIRED) | `res.success` is now read from the resolved `resilience.execute()` value instead of being ignored. |
| `notifications.controller.ts` | `notifications-client.service.ts` | constructor injection | ✓ WIRED | Unchanged since prior pass — regression check only. |
| `tour-notifications.service.ts` | `notifications-client.service.ts` | constructor injection | ✓ WIRED | Unchanged since prior pass — cron/event handlers still catch-and-log without rethrowing (D-07); `tour-notifications.service.spec.ts` still passes unmodified per Plan 17-07 Task 2, confirming the facade's Promise-returning contract/external signature was not broken by the internal response-mapping fix. |
| `backend/src/app.module.ts` | `notifications-client.module.ts` | root module import | ✓ WIRED | Unchanged since prior pass. |
| `docker-compose.yml` backend | `docker-compose.yml notifications-service` | `NOTIFICATIONS_SERVICE_URL` + `depends_on` | ✓ WIRED | Unchanged since prior pass, independently re-confirmed above. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| New regression test 4c + all prior notifications-client tests pass | `cd backend && npx jest notifications-client.service.spec.ts tour-notifications.service.spec.ts` (run independently by verifier) | 2 suites, 18 tests passed | ✓ PASS |
| Full backend suite green, no regressions | `cd backend && npm test` (run independently by verifier) | 53 suites, 619 tests passed (baseline 53/618 + 1 new test, exactly as claimed) | ✓ PASS |
| Monolith builds cleanly | `cd backend && npm run build` (run independently by verifier) | `prisma generate` + `nest build` exit 0 | ✓ PASS |
| `success: true`/`sent: true` hardcodes removed from sendPush paths | `grep -n "success: true\|success: result.sent"` on controller; `grep -n "sent: true\|res.success"` on client facade (run independently by verifier) | Controller: only `registerToken`'s legitimate `success: true` remains (line 19), `sendPush` uses `result.sent` (line 13). Client: no `sent: true` hardcode remains, `res.success` read (line 67). | ✓ PASS |
| Excluded modules (Wallet/Transport/Delivery/Events/Stays/Marketplace/Auth/Tour*) still have zero `ClientGrpc`/`ClientsModule` usage | `grep -rln "ClientGrpc\|ClientsModule" backend/src/modules/{wallet,transport,delivery,events,stays,marketplace,auth,tour-bookings,tour-packages,tour-guides}` (run independently by verifier) | no matches, exit 1 | ✓ PASS |
| `POST /notifications/send` returns an accurate `sent` boolean when no FCM token is registered | Code trace confirms `result.sent`/`res.success` propagation end-to-end (static, run independently by verifier); live REST confirmation performed by human per 17-07 Task 3 blocking checkpoint (`{ "sent": false }` observed and approved) | Code trace: accurate propagation confirmed by this verifier. Live HTTP call requires a running server + DB fixture (userId with no FCM token) — not independently re-run by this verifier; relies on the documented, gated human checkpoint. | ✓ PASS (code trace) / human-confirmed live |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| GRPC-03 | 17-01 through 17-07 | `notifications-service` runs as a genuinely separate deployable process, called via `ClientGrpc`, with zero behavior change to REST responses | ✓ SATISFIED | Both halves now hold: deployment/wiring (confirmed in prior pass, regression-checked here) and "zero behavior change" (Truth 3 gap closed by Plan 17-07, independently verified above). `.planning/REQUIREMENTS.md` now shows `[x] GRPC-03` (line 28) and its traceability table marks it "Complete" (line 106). |
| GRPC-04 | 17-04 | Documented caller-graph audit precedes and gates extraction | ✓ SATISFIED | Unchanged since prior pass — `17-CALLER-GRAPH-AUDIT.md` committed before cutover commits, confirmed via git log. Note: `.planning/REQUIREMENTS.md` checkbox (line 29) and traceability table (line 107) still show this as unchecked/"Pending" — this is a documentation-lag issue in REQUIREMENTS.md itself, not a code gap; the underlying requirement is independently code-verified as satisfied both here and in the prior pass, and unaffected by 17-07's diff. |
| GRPC-05 | 17-04 | Wallet/Transport/Delivery/Events/Stays/Marketplace/Auth/Tour* remain in-process, not extracted | ✓ SATISFIED | Unchanged since prior pass — grep gate re-confirmed independently above. Same REQUIREMENTS.md documentation-lag note as GRPC-04 applies (checkbox/table say "Pending" despite code evidence being satisfied). |

**Orphaned requirements:** None. All 3 declared IDs (GRPC-03/04/05) are accounted for above; Plan 17-07's frontmatter declares `requirements: [GRPC-03]` only (correct — it's a scoped gap-closure plan targeting the one failing requirement), and GRPC-04/05 were already satisfied and unaffected by this plan's diff.

**Documentation note (non-blocking):** `.planning/REQUIREMENTS.md`'s traceability table (lines 106-108) shows GRPC-03 as "Complete" (correctly updated by 17-07-SUMMARY.md) but GRPC-04 and GRPC-05 still show "Pending" despite being code-verified as satisfied in both this pass and the prior one. This is a stale-documentation gap in REQUIREMENTS.md, not a functional gap in the codebase — flagged as an anti-pattern/info item below, not a blocking gap, since the underlying code evidence for GRPC-04/05 is sound.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `.planning/REQUIREMENTS.md` | 29-30, 107-108 | GRPC-04/GRPC-05 checkboxes and traceability table still marked unchecked/"Pending" despite both being independently code-verified as satisfied (in this pass and the prior one) | ℹ️ Info | Documentation bookkeeping lag only — no code impact. Should be corrected for accurate project tracking but does not block phase completion. |
| `backend/src/modules/notifications/notifications.controller.ts` | 8, 25-29 | Pre-existing missing `RolesGuard`/`@Roles` on `POST /notifications/send` (CR-01, carried forward from 17-REVIEW.md) | ℹ️ Info | Confirmed pre-existing, predates Phase 17, not introduced or affected by this phase's changes. Not a phase-17 goal blocker; remains a live production security gap worth a follow-up fix outside this phase. |

No `TBD`/`FIXME`/`XXX` unresolved debt markers found in any file modified by Plan 17-07. No new anti-patterns introduced by the gap-closure fix — it is a minimal, correctly-scoped 4-line diff across two source files plus one new test.

### Human Verification Required

None outstanding. Plan 17-07's Task 3 human checkpoint (blocking gate) specifically re-tested the exact scenario this gap concerned — `POST /api/v1/notifications/send` for a user with no registered FCM token — and the human confirmed the response body is `{ "sent": false }`, not `{ "sent": true }`. This closes the one item the prior verification pass flagged as needing re-confirmation ("Human checkpoint 17-06 should be re-run once fixed... its manual REST diff evidently did not exercise the no-token/not-configured business-failure branch"). Combined with the independently-run full test suite (619/619 passing) and independently-read source diff confirming the fix, this truth is now VERIFIED rather than routed back to human verification.

### Gaps Summary

No gaps remain. The single failing truth from the prior verification pass (Truth #3 — gRPC SendPush silently hardcoded `success: true` regardless of real send outcome) has been closed by Plan 17-07:

- `notifications-grpc.controller.ts`'s `sendPush` handler now maps `{ success: result.sent }` from the real, captured `NotificationsService.sendPush()` result instead of discarding it and hardcoding `true` — verified by direct file read.
- `notifications-client.service.ts`'s `sendPush()` now reads `{ sent: res.success }` from the real, captured gRPC response body instead of hardcoding `true` — verified by direct file read.
- A new regression test (`4c`) proves the no-token/business-failure path resolves `{ sent: false }` without throwing — independently re-run by this verifier and confirmed passing.
- The full backend suite (53 suites / 619 tests) and build were independently re-run by this verifier (not merely trusted from SUMMARY.md) and confirmed green.
- The excluded-modules grep gate (Wallet/Transport/Delivery/Events/Stays/Marketplace/Auth/Tour*) was independently re-run and confirmed zero `ClientGrpc`/`ClientsModule` usage, unaffected by this fix.
- `registerToken`'s unchanged `success: true` hardcode was independently checked against its underlying service method and confirmed legitimate (zero failure branches exist), not a residual instance of the bug class.
- The human checkpoint that the prior pass explicitly requested (re-testing the no-FCM-token REST path) was performed and approved.

All three requirement IDs for this phase (GRPC-03, GRPC-04, GRPC-05) are satisfied by code evidence. GRPC-03 is now marked complete in REQUIREMENTS.md; GRPC-04/05's REQUIREMENTS.md tracking rows remain stale ("Pending") despite being code-verified — flagged as a non-blocking documentation anti-pattern, not a phase gap.

Phase 17 goal is achieved: `notifications-service` runs as a genuinely separate deployable process, called from the monolith exclusively via `ClientGrpc`, with zero behavior change to REST clients now confirmed end-to-end (both the deployment/wiring half and the response-fidelity half), while Wallet/Transport/Delivery/Events/Stays/Marketplace/Auth/Tour* remain in-process and unextracted this milestone.

---

_Verified: 2026-07-19T13:07:22Z_
_Verifier: Claude (gsd-verifier)_
