---
phase: quick-260802-bi1
plan: 01
subsystem: web-auth
tags: [web, auth, password-reset, otp, nextjs]
requires: [POST /auth/otp/send, POST /auth/reset-password]
provides: [/forgot-password route, login forgot-password link]
affects: [web/src/app/forgot-password/page.tsx, web/src/app/login/page.tsx]
tech-stack:
  added: []
  patterns: [two-step-form-state, register-error-toast, login-visual-shell]
key-files:
  created: [web/src/app/forgot-password/page.tsx]
  modified: [web/src/app/login/page.tsx]
decisions:
  - Redirect to /login on reset success rather than auto-signIn (only phone known, not email the credentials provider needs)
metrics:
  duration: ~4m
  completed: 2026-08-02
---

# Quick Task 260802-bi1: Add Web Forgot-Password OTP Reset UI Flow Summary

Added the missing web password-recovery flow: a two-step OTP-based `/forgot-password` page (request code, then enter code + new password) wired to the already-existing backend contract, plus a "Forgot password?" link on the login page.

## What Was Built

**Task 1 — `web/src/app/forgot-password/page.tsx` (new, commit `511a41f`)**
- `'use client'` `ForgotPasswordPage` mirroring the login/register visual shell verbatim (jungle gradient, two animated orbs, `bg-adire opacity-30` overlay, framer-motion entrance, logo header, `glass rounded-3xl p-7` card, footer copyright).
- `const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';` matching register/page.tsx.
- State: `step` (1|2), `phone`, `otp`, `newPassword`, `showPw`, `loading`.
- Step 1: phone input (type tel), client guard `phone.trim()` non-empty, `axios.post(${API_URL}/auth/otp/send, { phone })`, success toast + `setStep(2)`, register-style catch (fallback "Failed to send OTP. Please try again."), spinner label "Sending code...".
- Step 2: 6-digit OTP input (inputMode numeric, maxLength 6) + new-password input with Eye/EyeOff show/hide toggle. Guards: `otp.length === 6` and `newPassword.length >= 8`. `axios.post(${API_URL}/auth/reset-password, { phone, otp, newPassword })`, success toast + `router.push('/login')`, register-style catch (fallback "Failed to reset password. Please try again."), spinner label "Resetting...". Plus a minimal "Change number" affordance calling `setStep(1)`.
- Header subtitle switches per step ("Reset your password" / "Enter the code we sent"). "Back to sign in" Link to `/login` styled `text-gold/80 hover:text-gold`.
- No `next-auth signIn` — reset redirects to `/login` (only phone is known, not the email the credentials provider requires).

**Task 2 — `web/src/app/login/page.tsx` (edit, commit `27219c5`)**
- Added a single right-aligned "Forgot password?" `Link` to `/forgot-password` (`text-gold/80 hover:text-gold text-xs`, wrapped in `div className="flex justify-end -mt-1"`) directly below the password field's closing div, before the submit button. No other changes.

## Deviations from Plan

None — plan executed exactly as written. (One tidy-up during Task 1: removed an unused `ArrowRight` import before commit, keeping the file clean; not a behavioral change.)

## Verification Notes

- `npx tsc --noEmit -p web/tsconfig.json` was run after each task. The only errors touching the changed files are pre-existing `TS2307 Cannot find module 'framer-motion'/'sonner'` resolution errors — the **same errors appear identically on the known-good `login/page.tsx` and `register/page.tsx`**, confirming they are a worktree environment condition (dependencies not installed in this isolated worktree), not defects introduced by this task. No new type errors were introduced by either file.
- A full web build was intentionally not run (per task constraints).
- `grep -c "/forgot-password" src/app/login/page.tsx` returns `1` (exactly one link).

## Known Stubs

None.

## Self-Check: PASSED

- FOUND: web/src/app/forgot-password/page.tsx
- FOUND commit 511a41f (feat: forgot-password page)
- FOUND commit 27219c5 (feat: login link)
- login/page.tsx contains exactly one `/forgot-password` Link
