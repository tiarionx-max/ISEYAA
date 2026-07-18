---
phase: 14
slug: ministry-dashboard
status: draft
nyquist_compliant: false
wave_0_complete: false
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
| 14-01-01 | TBD | 1 | MIN-01 | V4 Access Control | `MINISTRY_VIEWER` route access denied to other roles; every `MinistryController` route carries `@Roles(UserRole.MINISTRY_VIEWER)` | unit | `npm test --workspace=backend -- ministry.controller` | ❌ W0 | ⬜ pending |
| 14-01-02 | TBD | 1 | MIN-02 | — | Visitor entries grouped correctly by LGA + month | unit | `npm test --workspace=backend -- ministry.service` | ❌ W0 | ⬜ pending |
| 14-01-03 | TBD | 1 | MIN-03 | — | Purpose-of-visit breakdown reflects `VisitorLog.purpose` values | unit | `npm test --workspace=backend -- ministry.service` | ❌ W0 | ⬜ pending |
| 14-01-04 | TBD | 1 | MIN-04 | Tampering (SQLi via unparameterized filters) | Revenue-to-government-share matches Ministry wallet ledger; `$queryRaw` filters are tagged-template parameterized | unit | `npm test --workspace=backend -- ministry.service` | ❌ W0 | ⬜ pending |
| 14-01-05 | TBD | 1 | MIN-05 | Tampering (CSV injection, low relevance) | CSV export produces correctly-escaped, parseable output | unit | `npm test --workspace=backend -- csv-export` | ❌ W0 | ⬜ pending |
| 14-01-06 | TBD | 1 | MIN-06 | — | PDF export renders without throwing, uses Forest Green/Gold branded colors | unit | `npm test --workspace=backend -- ministry-pdf` | ❌ W0 | ⬜ pending |
| 14-01-07 | TBD | 1 | MIN-07 | Information Disclosure (response-shape drift) | No PII field name or PII-shaped value ever appears in any Ministry response (dual key-denylist + value-canary) | unit | `npm test --workspace=backend -- ministry-pii-allowlist` | ❌ W0 | ⬜ pending |
| 14-01-08 | TBD | 1 | D-07/D-08 | — | `VisitorLogService.record()` writes correct shape from all three confirmation points | unit | `npm test --workspace=backend -- visitor-log.service` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/src/modules/ministry/__tests__/ministry.service.spec.ts` — covers MIN-02, MIN-03, MIN-04
- [ ] `backend/src/modules/ministry/__tests__/ministry-pii-allowlist.spec.ts` — covers MIN-07 (dual key-denylist + value-canary pattern specified in RESEARCH.md)
- [ ] `backend/src/modules/ministry/__tests__/ministry.controller.spec.ts` (or e2e RBAC spec mirroring `roles.guard.spec.ts`) — covers MIN-01
- [ ] `backend/src/common/services/__tests__/visitor-log.service.spec.ts` — covers D-07/D-08 write-path correctness
- [ ] No new test framework/config needed — reuses existing Jest setup verbatim

---

## Manual-Only Verifications

*None — all phase behaviors have automated verification per RESEARCH.md's Phase Requirements → Test Map.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
