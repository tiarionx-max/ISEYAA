---
phase: 15
slug: multi-channel-otp
status: planned
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-18
---

# Phase 15 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 29.7.x + ts-jest 29.1.x |
| **Config file** | `backend/package.json` (`"test": "jest"`, no separate `jest.config.js` found) |
| **Quick run command** | `npm run test --workspace=backend -- auth.service.spec` |
| **Full suite command** | `npm run test --workspace=backend` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run test --workspace=backend -- <affected>.spec`
- **After every plan wave:** Run `npm run test --workspace=backend`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 15-03-T1/T2 | 15-03 | 2 | OTP-01 | — | Registration channel selection persists and defaults to SMS when unselected | unit | `npm run test --workspace=backend -- auth.service.spec -t "channel"` | ✅ planned in 15-03 Task 1/2 | ⬜ pending execution |
| 15-03-T1 | 15-03 | 2 | OTP-02 | — | WhatsApp/Email send failure triggers SMS fallback with SAME otp | unit | `npm run test --workspace=backend -- auth.service.spec -t "fallback"` | ✅ planned in 15-03 Task 1 | ⬜ pending execution |
| 15-03-T2 | 15-03 | 2 | OTP-03 | T-15-05 | Switching channel mid-lockout does not reset/bypass `otp_lock:<phone>` | unit | `npm run test --workspace=backend -- auth.service.spec -t "lockout"` | ✅ planned in 15-03 Task 2 — critical, proves the literal success criterion | ⬜ pending execution |
| 15-03-T1 | 15-03 | 2 | OTP-04 | T-15-04 | WhatsApp send uses correct Graph API template request shape (name/language/components) | unit | `npm run test --workspace=backend -- auth.service.spec -t "whatsapp"` | ✅ planned in 15-03 Task 1 | ⬜ pending execution |
| 15-03-T2 | 15-03 | 2 | (regression) | — | `resilience.service.spec.ts`'s "builds all 7 vendor policies" assertion becomes 9 (adds `metaWhatsapp`, `sendgrid`) | unit | `npm run test --workspace=backend -- resilience.service.spec` | ✅ planned in 15-03 Task 2 — existing test title updated, not created | ⬜ pending execution |
| 15-02-T2 | 15-02 | 1 | OTP-02 | T-15-03 | `SendgridService.sendOtpEmail()` rejects (doesn't swallow) on `sgMail.send()` failure — the fix that lets 15-03's fallback actually fire | unit | `npm run test --workspace=backend -- sendgrid.service.spec` | ✅ planned in 15-02 Task 2 (new spec file) | ⬜ pending execution |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `backend/src/modules/auth/__tests__/auth.service.spec.ts` — new test cases for channel selection, fallback-on-throw, and OTP-03's channel-switch-doesn't-bypass-lockout proof — assigned to 15-03 Task 1/2
- [x] `backend/src/resilience/__tests__/resilience.service.spec.ts` — update vendor count assertion (7 → 9) after adding `metaWhatsapp`/`sendgrid` — assigned to 15-03 Task 2
- [x] New unit tests for `SendgridService.sendOtpEmail()` — assert it rejects (doesn't swallow) on `sgMail.send()` failure, directly testing the email-swallowing pitfall's fix — assigned to 15-02 Task 2
- [x] Mock strategy for `fetch()` to the Meta Graph API — follow the existing `jest.spyOn(global, 'fetch').mockResolvedValue(...)` pattern already used in `auth.service.spec.ts:59` — reused as-is in 15-03 Task 1

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| WhatsApp template actually renders/sends via a live, Meta-approved WABA | OTP-04 | Meta template approval and live WABA credentials are a stakeholder/ops action outside the codebase (D-03/D-04 in CONTEXT.md) — cannot be automated in CI | After stakeholder confirms template approval, manually trigger registration with WhatsApp selected and confirm real message receipt on a test device |
| Fallback-notice UI copy renders correctly on registration/verification screen | OTP-02, D-10 | Visual/UX confirmation not covered by unit tests | Force a WhatsApp/email send failure in a dev environment and confirm the "sent via SMS instead" notice appears on-screen |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved — Per-Task Verification Map now reflects the actual plan/wave assignments in 15-01 through 15-06; every task listed carries a concrete automated verify command (no `MISSING` markers, no full E2E suites, no watch-mode flags).
