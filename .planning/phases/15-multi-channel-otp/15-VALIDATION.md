---
phase: 15
slug: multi-channel-otp
status: draft
nyquist_compliant: false
wave_0_complete: false
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
| 15-01-XX | TBD | TBD | OTP-01 | — | Registration channel selection persists and defaults to SMS when unselected | unit | `npm run test --workspace=backend -- auth.service.spec -t "channel"` | ❌ W0 | ⬜ pending |
| 15-01-XX | TBD | TBD | OTP-02 | — | WhatsApp/Email send failure triggers SMS fallback with SAME otp | unit | `npm run test --workspace=backend -- auth.service.spec -t "fallback"` | ❌ W0 | ⬜ pending |
| 15-01-XX | TBD | TBD | OTP-03 | T-15-01 | Switching channel mid-lockout does not reset/bypass `otp_lock:<phone>` | unit | `npm run test --workspace=backend -- auth.service.spec -t "lockout"` | ❌ W0 — critical, proves the literal success criterion | ⬜ pending |
| 15-01-XX | TBD | TBD | OTP-04 | — | WhatsApp send uses correct Graph API template request shape (name/language/components) | unit | `npm run test --workspace=backend -- auth.service.spec -t "whatsapp"` | ❌ W0 | ⬜ pending |
| 15-01-XX | TBD | TBD | (regression) | — | `resilience.service.spec.ts`'s "builds all 7 vendor policies" assertion must become 9 (adds `metaWhatsapp`, `sendgrid`) | unit | `npm run test --workspace=backend -- resilience.service.spec` | ⚠️ Existing test needs updating, not creating | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/src/modules/auth/__tests__/auth.service.spec.ts` — new test cases for channel selection, fallback-on-throw, and OTP-03's channel-switch-doesn't-bypass-lockout proof
- [ ] `backend/src/resilience/__tests__/resilience.service.spec.ts` — update vendor count assertion (7 → 9) after adding `metaWhatsapp`/`sendgrid`
- [ ] New unit tests for `SendgridService.sendOtpEmail()` — assert it rejects (doesn't swallow) on `sgMail.send()` failure, directly testing the email-swallowing pitfall's fix
- [ ] Mock strategy for `fetch()` to the Meta Graph API — follow the existing `jest.spyOn(global, 'fetch').mockResolvedValue(...)` pattern already used in `auth.service.spec.ts:59`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| WhatsApp template actually renders/sends via a live, Meta-approved WABA | OTP-04 | Meta template approval and live WABA credentials are a stakeholder/ops action outside the codebase (D-03/D-04 in CONTEXT.md) — cannot be automated in CI | After stakeholder confirms template approval, manually trigger registration with WhatsApp selected and confirm real message receipt on a test device |
| Fallback-notice UI copy renders correctly on registration/verification screen | OTP-02, D-10 | Visual/UX confirmation not covered by unit tests | Force a WhatsApp/email send failure in a dev environment and confirm the "sent via SMS instead" notice appears on-screen |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
