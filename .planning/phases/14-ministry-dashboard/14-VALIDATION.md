---
phase: 14
slug: ministry-dashboard
status: ready
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-17
---

# Phase 14 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 29.7.x + ts-jest 29.1.x |
| **Config file** | `backend/package.json` `"jest"` block (referenced by `npm test`); separate `test/jest-e2e.json` exists for e2e specs |
| **Quick run command** | `npm test --workspace=backend -- ministry` |
| **Full suite command** | `npm test --workspace=backend` |
| **Estimated runtime** | ~60 seconds (backend unit suite) |

---

## Sampling Rate

- **After every task commit:** Run `npm test --workspace=backend -- ministry`
- **After every plan wave:** Run `npm test --workspace=backend`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 14-01-01 | 14-01 | 1 | MIN-01 | V4 Access Control | `MINISTRY_VIEWER` route access denied to other roles; every `MinistryController` route carries `@Roles(UserRole.MINISTRY_VIEWER)` | unit | `npm test --workspace=backend -- ministry.controller` | ✅ | ⬜ pending |
| 14-01-02 | 14-03 | 2 | MIN-02 | — | Visitor entries grouped correctly by LGA + month | unit | `npm test --workspace=backend -- ministry.service` | ✅ | ⬜ pending |
| 14-01-03 | 14-03 | 2 | MIN-03 | — | Purpose-of-visit breakdown reflects `VisitorLog.purpose` values | unit | `npm test --workspace=backend -- ministry.service` | ✅ | ⬜ pending |
| 14-01-04 | 14-06 | 3 | MIN-04 | Tampering (SQLi via unparameterized filters) | Revenue-to-government-share matches Ministry wallet ledger; `$queryRaw` filters are tagged-template parameterized | unit | `npm test --workspace=backend -- ministry.service` | ✅ | ⬜ pending |
| 14-01-05 | 14-07 | 4 | MIN-05 | Tampering (CSV injection, low relevance) | CSV export produces correctly-escaped, parseable output | unit | `npm test --workspace=backend -- ministry.controller` | ✅ | ⬜ pending |
| 14-01-06 | 14-07 | 4 | MIN-06 | — | PDF export renders without throwing, uses Forest Green/Gold branded colors | unit | `npm test --workspace=backend -- ministry-pdf` | ✅ | ⬜ pending |
| 14-01-07 | 14-06 | 3 | MIN-07 | Information Disclosure (response-shape drift) | No PII field name or PII-shaped value ever appears in any Ministry response (dual key-denylist + value-canary, both key AND value checks) | unit | `npm test --workspace=backend -- ministry-pii-allowlist` | ✅ | ⬜ pending |
| 14-01-08 | 14-01/14-02 | 1 | D-07/D-08 | — | `VisitorLogService.record()` writes correct shape from all three confirmation points | unit | `npm test --workspace=backend -- visitor-log.service` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `backend/src/modules/ministry/__tests__/ministry.service.spec.ts` — covers MIN-02, MIN-03, MIN-04 (Plans 14-03, 14-06)
- [x] `backend/src/modules/ministry/__tests__/ministry-pii-allowlist.spec.ts` — covers MIN-07 (dual key-denylist + value-canary pattern specified in RESEARCH.md; both halves genuinely implemented per Plan 14-06 revision)
- [x] `backend/src/modules/ministry/__tests__/ministry.controller.spec.ts` (RBAC spec mirroring `roles.guard.spec.ts`) — covers MIN-01 (Plan 14-03), extended for export routes (Plan 14-07)
- [x] `backend/src/common/services/__tests__/visitor-log.service.spec.ts` — covers D-07/D-08 write-path correctness (Plan 14-01/14-02)
- [x] No new test framework/config needed — reuses existing Jest setup verbatim

---

## Manual-Only Verifications

*None — all phase behaviors have automated verification per RESEARCH.md's Phase Requirements → Test Map.*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies — every task across Plans 14-01 through 14-08 carries a real `<automated>` command (Nyquist Checks 8a-8d satisfied structurally)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references — all 4 Wave 0 spec files above exist and are populated by their owning plans
- [x] No watch-mode flags — all commands use `npm test --workspace=backend -- <pattern>`, non-watch
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved — all 8 plans (14-01 through 14-08) carry real `<automated>` verify commands; Plan 14-06's PII allowlist spec now implements both the key-denylist and value-canary halves of MIN-07's pattern per the revision in this pass.
