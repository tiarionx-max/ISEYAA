---
phase: 22
slug: scheduled-ministry-exports-lga-heatmap
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-21
---

# Phase 22 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 29.7.0 + ts-jest 29.1.2 (unit/integration, backend); separate `jest-e2e.json` config for e2e suites |
| **Config file** | `backend/package.json` (`jest` unit config, implicit default); `backend/test/jest-e2e.json` (e2e config) |
| **Quick run command** | `npm run test -- ministry` (from `backend/`) |
| **Full suite command** | `npm run test` (from `backend/`) |
| **Estimated runtime** | ~60 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run test -- ministry` (from `backend/`)
- **After every plan wave:** Run `npm run test` (backend full unit suite)
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 22-01-01 | 01 | 1 | MIN-08a | — | Digest cron generates CSV+PDF and calls SendGrid on a due tick | unit | `npm run test -- ministry-export-scheduler.service.spec` | ❌ W0 | ⬜ pending |
| 22-01-02 | 01 | 1 | MIN-08a | — | `MinistryPdfService.renderPdf()` correctly assembles all 3 reports into one multi-section PDF | unit | `npm run test -- ministry-pdf.service.spec` | ⚠️ existing file, needs new cases | ⬜ pending |
| 22-02-01 | 02 | 1 | MIN-08b | T-22-01 | Subscription CRUD routes are `SUPER_ADMIN`-gated and persist recipients/cadence | unit + e2e | `npm run test -- ministry-export-subscription.controller.spec` | ❌ W0 | ⬜ pending |
| 22-01-03 | 01 | 1 | MIN-08c | — | A SendGrid failure (after cockatiel retries exhausted) marks `lastStatus=FAILED`, leaves `lastSentAt` unchanged, and logs | unit | `npm run test -- ministry-export-scheduler.service.spec` | ❌ W0 | ⬜ pending |
| 22-01-04 | 01 | 1 | MIN-08c | — | Scheduler tick is guarded by `setNx('cron-lock:checkMinistryExportSubscriptions', ...)`, skips when lock is held | unit | `npm run test -- ministry-export-scheduler.service.spec` | ❌ W0 | ⬜ pending |
| 22-03-01 | 03 | 2 | MIN-09 | — | `getVisitorEntriesByLgaAndMonth()` unchanged/still returns the exact shape the heatmap consumes | unit | `npm run test -- ministry.service.spec` | ✅ existing | ⬜ pending |
| 22-03-02 | 03 | 2 | MIN-09 | — | Heatmap component aggregates rows by `(lgaName, month)`, summing across `userRole`, without double-counting | unit (RTL if configured) | new `web` test file (verify RTL tooling exists at planning time; if absent, extract `buildGrid()` as a pure independently-testable function) | ❌ W0 — verify web test tooling | ⬜ pending |
| 22-02-02 | 02 | 1 | MIN-08b | T-22-02 | Non-`SUPER_ADMIN` roles cannot read/mutate subscription recipients/cadence | unit | `npm run test -- ministry-export-subscription.controller.spec` (role-gating case) | ❌ W0 | ⬜ pending |
| 22-02-03 | 02 | 1 | MIN-08b | T-22-03 | Malformed emails in `recipients` are rejected at the DTO boundary (`@IsEmail({}, {each:true})`) before reaching `sgMail.send()` | unit | `npm run test -- ministry-export-subscription.controller.spec` (validation case) | ❌ W0 | ⬜ pending |
| 22-01-05 | 01 | 1 | MIN-08c | T-22-04 | `lastError` is truncated/sanitized (mirrors `ResilienceService.summarizeVendorError()`) before persisting — never raw vendor response bodies | unit | `npm run test -- ministry-export-scheduler.service.spec` (error-persistence case) | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/src/modules/ministry/__tests__/ministry-export-scheduler.service.spec.ts` — covers MIN-08a, MIN-08c (cron guard, digest window computation, resilience wrapping, success/failure status updates, error sanitization)
- [ ] `backend/src/modules/ministry/__tests__/ministry-export-subscription.controller.spec.ts` — covers MIN-08b (CRUD, `SUPER_ADMIN` gating, email validation)
- [ ] Extend `backend/src/common/services/__tests__/sendgrid.service.spec.ts` with `sendMinistryDigest()` attachment-shape assertions — verify at planning time whether this file already exists
- [ ] Web-side: confirm whether `web/` has React Testing Library or any component-test tooling configured before committing to an automated test for heatmap aggregation logic; if absent, extract `buildGrid()` as a pure, independently-unit-testable function regardless

*Wave 0 tasks must be sequenced before their dependent per-task verifications above.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|--------------------|
| Digest email renders correctly in a real inbox (PDF attachment opens, CSV attachment opens, branding matches FOREST/GOLD palette) | MIN-08a | Email client rendering + attachment fidelity cannot be asserted by unit tests | Trigger a manual digest send via the CRUD-created test subscription pointed at a real inbox; open the received email, verify PDF/CSV attachments open cleanly and content matches expected data |
| Heatmap visual legibility (color-intensity scale readable, all 20 LGAs visible, no layout overflow) | MIN-09 | Visual/perceptual check, not a unit-testable property | Load `/admin/ministry` in a browser with seeded multi-month visitor data, visually confirm the grid renders all 20 LGA rows and the color scale is legible against FOREST/GOLD |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
