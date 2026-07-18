# Phase 15: Multi-Channel OTP - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-18
**Phase:** 15-multi-channel-otp
**Areas discussed:** WhatsApp delivery path, Channel selection UX, Fallback timeout semantics

---

## Todo Cross-Reference

| Todo | Score | Selected |
|------|-------|----------|
| Wire ResilienceModule into gRPC service scaffolds (INT-01) | 0.4 (keyword match: "phase", "only") | Skipped — unrelated to OTP |

**User's choice:** Skip it (recommended)
**Notes:** Flagged as a false-positive keyword match; the todo concerns gRPC scaffold resilience wiring (Phase 17 prerequisite), not OTP channels.

---

## WhatsApp delivery path

### Q1: How should the phase handle WhatsApp delivery, given Termii's WhatsApp Token API activation status is unconfirmed?

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse Termii's whatsapp channel | Build on existing `channel: 'whatsapp'` code path; degrades safely to SMS fallback if not activated | |
| Direct Meta Cloud API integration | New, separate Meta Business API integration with own auth/template management | ✓ |
| Treat as blocked | Pause WhatsApp scoping until Termii support ticket confirms activation | |

**User's choice:** Direct Meta Cloud API integration

### Q2: Who owns getting the Meta-approved Authentication-category WhatsApp template approved?

| Option | Description | Selected |
|--------|-------------|----------|
| You (stakeholder/Termii account owner) handle approval | Claude drafts template text; stakeholder submits for Meta approval outside the codebase | ✓ |
| Out of scope entirely | Approval tracked elsewhere, not blocking code completion | |

**User's choice:** You (stakeholder/Termii account owner) handle approval

### Q3: If WhatsApp is never activated/approved, what happens to the WhatsApp option in the UI?

| Option | Description | Selected |
|--------|-------------|----------|
| Feature-flag it off automatically | Only shown when config confirms activation | |
| Always show WhatsApp as an option | Shown regardless; falls back to SMS silently per OTP-02 if not working | ✓ |

**User's choice:** Always show WhatsApp as an option

### Q4: Confirm — SMS stays Termii, Email stays SendGrid, only WhatsApp moves to direct Meta Cloud API?

**User's choice:** Yes, correct

---

## Channel selection UX

### Q1: Where does the user select their OTP channel?

| Option | Description | Selected |
|--------|-------------|----------|
| Registration only | New field on RegisterDto, defaults to SMS | ✓ |
| Registration + re-selectable every OTP request | Broader UX surface, per-attempt switching | |

**User's choice:** Registration only

### Q2: Does the new explicit choice replace today's silent auto-prefer-WhatsApp logic, or does it still apply as a default?

| Option | Description | Selected |
|--------|-------------|----------|
| Replace entirely | Silent env-driven auto-preference goes away | ✓ |
| Keep as pre-selected default | Picker still biases toward WhatsApp when configured | |

**User's choice:** Replace entirely

### Q3: Can the user change their channel preference later?

| Option | Description | Selected |
|--------|-------------|----------|
| Changeable later | Settings-screen control added this phase | ✓ |
| Fixed at registration | No change flow this phase | |

**User's choice:** Changeable later

---

## Fallback timeout semantics

### Q1: What should "bounded timeout" mean for triggering SMS fallback?

| Option | Description | Selected |
|--------|-------------|----------|
| API-response-only | Fallback on send-API error/timeout (~5-10s); no delivery-webhook wait | ✓ |
| True delivery-confirmation wait | Wait 60-120s for a real WhatsApp delivery-status webhook | |

**User's choice:** API-response-only

### Q2: Is the fallback visible to the user, or invisible?

| Option | Description | Selected |
|--------|-------------|----------|
| Visible | Screen shows a status message when fallback occurs | ✓ |
| Invisible / silent | Standard "enter your code" screen regardless | |

**User's choice:** Visible to the user

### Q3: Should the fallback reuse the existing ResilienceModule/cockatiel pattern, or a separate OTP-specific mechanism?

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse ResilienceModule/cockatiel | Consistent with RESIL-01/RESIL-02, gets observability for free | ✓ |
| Separate OTP-specific fallback | Bespoke logic independent of resilience module | |

**User's choice:** Reuse ResilienceModule/cockatiel

---

## Claude's Discretion

- Exact Meta Graph API integration details (request/response shapes, token refresh strategy, new env var names)
- Exact wording/copy of the fallback-notice UI message and settings-screen control placement
- Whether channel preference is stored as a plain enum column on `User` or a related table

## Deferred Ideas

- True WhatsApp delivery-receipt webhook (rejected alternative in Fallback timeout semantics Q1) — send-API-response-only is sufficient for OTP-02
- Per-attempt channel re-selection on login/resend/password-reset screens (rejected alternative in Channel selection UX Q1) — channel is set at registration, changeable via settings
