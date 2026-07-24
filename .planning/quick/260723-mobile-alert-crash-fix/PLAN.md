---
id: 260723-mobile-alert-crash-fix
date: 2026-07-23
---

# Fix Alert.alert native crash from array validation messages

Fix a confirmed native crash (`UnexpectedNativeTypeException: cannot be cast from
ReadableNativeArray to String`) reproduced live via adb logcat. NestJS's global
ValidationPipe returns `message` as a string array on every 400 validation error.
Any mobile screen that passed `err.response?.data?.message` (or `.error`, or
`err.message`) directly into `Alert.alert()` or a text render would crash the
entire app when the backend returned a validation error.

A safe helper `getErrorMessage(err, fallback)` already exists in `mobile/lib/api.ts`
and was already applied to `mobile/app/auth/phone.tsx` (phone-auth "Send Code"
screen) earlier tonight.

## Scope

1. Grep every file under `mobile/app` and `mobile/components` for `Alert.alert(`
   and for raw `err.response?.data?.message` / `.error` / `err.message` extraction.
2. For each unsafe site, import `getErrorMessage` and replace the raw extraction,
   preserving the original fallback text exactly.
3. Leave sites that already guard against arrays (manual `Array.isArray(...)`
   checks or already using `getErrorMessage`) untouched.
4. Spot-check other phone/email-building screens for the same "send unsanitized
   client input that fails backend validation" class of bug.
5. Verify with `npx tsc --noEmit`.

No new plan-checker/verifier needed — root cause and fix pattern were already
diagnosed and demonstrated once tonight; this is a mechanical sweep across the
rest of the codebase.
