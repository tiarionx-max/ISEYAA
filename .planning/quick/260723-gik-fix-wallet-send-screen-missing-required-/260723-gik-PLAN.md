---
phase: quick
plan: 260723-gik
type: execute
wave: 1
depends_on: []
files_modified:
  - mobile/app/send.tsx
autonomous: true
requirements: []
must_haves:
  truths:
    - "A user tapping Send on the wallet Send screen no longer receives a guaranteed HTTP 400 — the POST /wallet/transfer request includes every field TransferDto requires"
    - "Two distinct genuine Send attempts (e.g. the first transfer times out, the user taps Send again) each carry their own freshly-generated idempotencyKey, so a legitimate second transfer is never silently collapsed into a retry of the first"
  artifacts:
    - path: "mobile/app/send.tsx"
      provides: "A generateIdempotencyKey() helper and idempotencyKey included in every /wallet/transfer POST body, generated fresh inside handleSend()"
      contains: "idempotencyKey"
  key_links:
    - from: "mobile/app/send.tsx handleSend()"
      to: "POST /wallet/transfer"
      via: "transferMutation.mutate({ recipientPhone, amount, narration, idempotencyKey })"
      pattern: "idempotencyKey:\\s*generateIdempotencyKey\\(\\)"
---

<objective>
Fix a guaranteed-400 bug on the wallet-to-wallet Send screen. `backend/src/modules/wallet/dto/transfer.dto.ts`'s `TransferDto` requires `idempotencyKey` (`@IsString() @Length(8, 64)`, no `@IsOptional()` — added in commit 3e9bad8 specifically so a retried/duplicated wallet-debit request can't double-debit the sender, per CLAUDE.md's "idempotency key required on all wallet mutations" rule). `mobile/app/send.tsx`'s `transferMutation` posts `{ recipientPhone, amount, narration }` and never includes `idempotencyKey`. Because the backend's global `ValidationPipe` runs `whitelist: true` / `forbidNonWhitelisted: true` with no default for this required field, **every** `/wallet/transfer` request from the mobile app is rejected with HTTP 400 — wallet-to-wallet Send is completely non-functional today.

Verified during investigation: no other mobile screen currently sends `idempotencyKey` (this is the only endpoint whose DTO requires it), and the `uuid` package listed in `mobile/package.json` is never actually imported anywhere in `mobile/` (Hermes doesn't provide `crypto.getRandomValues()` without an unlinked native polyfill, so the package is effectively dead weight). The one existing "avoid the `uuid` package" precedent in this codebase is `mobile/app/ai-chat.tsx`'s local `uuidv4()` (`Date.now().toString(36)` + two `Math.random().toString(36)` segments) — that function's comment scopes it to "never sent to a security-sensitive context," but for an *idempotency* key (not a cryptographic secret) only per-request uniqueness matters, so the same Math.random()-based construction is appropriate here; this plan replicates it locally in `send.tsx` rather than reinventing a different scheme or introducing a new dependency.

Purpose: Unblock wallet-to-wallet Send, the platform's core P2P money-movement feature, without touching the backend's idempotency enforcement (already correct and intentional).
Output: `mobile/app/send.tsx` sends a client-generated, per-submit-attempt `idempotencyKey` on every `/wallet/transfer` call.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md

<verified_facts>
Confirmed by direct inspection of the current codebase (2026-07-23, branch `microservices-redesign`).

**`backend/src/modules/wallet/dto/transfer.dto.ts` (full file, unchanged by this plan — backend is out of scope):**
```typescript
export class TransferDto {
  @IsMobilePhone('en-NG')
  recipientPhone: string;

  @IsNumber()
  @Min(100)
  amount: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  narration?: string;

  @IsString()
  @Length(8, 64)
  idempotencyKey: string;
}
```
No `@IsOptional()` on `idempotencyKey` — it is mandatory. Any length 8-64 string satisfies validation.

**`mobile/app/send.tsx` (current, relevant excerpt, lines 181-209) — the only code this plan touches:**
```typescript
const transferMutation = useMutation({
  mutationFn: (payload: {
    recipientPhone: string;
    amount: number;
    narration?: string;
  }) => api.post('/wallet/transfer', payload).then((r) => r.data),
  onSuccess: () => { ... },
  onError: (err: any) => { ... },
});

const numAmount = parseFloat(amount.replace(/,/g, '')) || 0;
const canSend = numAmount > 0 && numAmount <= balance && !!selectedRecipient;

function handleSend() {
  if (!canSend || !selectedRecipient || transferMutation.isPending) return;
  transferMutation.mutate({
    recipientPhone: selectedRecipient.phone,
    amount: numAmount,
    narration: note || undefined,
  });
}
```
`handleSend` already guards against a double-fire while a request is in flight (`transferMutation.isPending`) — that guard is untouched by this fix. The gap is purely the missing `idempotencyKey` field.

**`mobile/app/ai-chat.tsx` (lines 52-58) — the established "avoid the `uuid` package" pattern to replicate:**
```typescript
// Local message id only — never sent to a security-sensitive context, so Math.random()
// is fine here. Avoids the `uuid` package's crypto.getRandomValues() dependency, which
// Hermes doesn't provide without a native polyfill (react-native-get-random-values)
// that isn't linked into this build.
function uuidv4(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}
```
Produces a string well within the DTO's 8-64 char bound (typically ~30-34 chars). No other UUID/crypto-random generation exists anywhere in `mobile/` — the `uuid` package in `mobile/package.json` is declared but never imported (confirmed via repo-wide grep).
</verified_facts>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Generate and send a fresh idempotencyKey on every wallet transfer attempt</name>
  <files>mobile/app/send.tsx</files>
  <action>
    1. Add a local `generateIdempotencyKey(): string` helper function in the "Types"/utility-functions section of `send.tsx` (alongside `toneForPhone`, `initialsFor`, `maskPhone`, `formatBalance` — place it after `formatBalance`, before the "Components" section divider). Implement it identically to `ai-chat.tsx`'s `uuidv4()` (`` `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}` ``), with a comment adapted from that precedent explaining: this avoids the `uuid` package's unavailable `crypto.getRandomValues()` on Hermes (same reason as `ai-chat.tsx`), and — unlike a chat message id — this value IS used as a wallet-mutation idempotency key, where only per-request *uniqueness* matters (not cryptographic unpredictability), so `Math.random()`-based generation is fine for this purpose.

    2. Update `transferMutation`'s `mutationFn` payload type (around line 182-186) to add `idempotencyKey: string` alongside `recipientPhone`, `amount`, `narration?`.

    3. Update `handleSend()` (around line 202-209) to call `generateIdempotencyKey()` fresh at the top of the function body (not stored in component state, not computed at mount/render) and pass it through: `transferMutation.mutate({ recipientPhone: selectedRecipient.phone, amount: numAmount, narration: note || undefined, idempotencyKey: generateIdempotencyKey() })`. Because it's generated inline on each `handleSend()` invocation, every real button press (a fresh call to `handleSend`) gets its own key — a genuine second Send after a failed first attempt is never suppressed as a duplicate — while the pre-existing `transferMutation.isPending` guard already prevents a single press from firing the mutation twice.

    Do not change `transferMutation`'s `onSuccess`/`onError` handlers, the `canSend` logic, or anything outside these three edits. Do not touch the backend DTO or any other mobile screen.
  </action>
  <verify>
    <automated>cd mobile && npx tsc --noEmit</automated>
  </verify>
  <done>`mobile/app/send.tsx` defines `generateIdempotencyKey()`, the `transferMutation` payload type includes `idempotencyKey: string`, and `handleSend()` generates a fresh key on every call and includes it in the `/wallet/transfer` request body. `npx tsc --noEmit` passes with no new type errors.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|--------------|
| Mobile client → `POST /wallet/transfer` | Client-generated `idempotencyKey` crosses into wallet-debit dedup logic (`backend/src/modules/wallet/wallet.service.ts`) |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-quick-01 | Repudiation / Double-spend | `wallet.service.ts` transfer() dedup on `idempotencyKey` | accept | Backend-side dedup logic and the `@Length(8, 64)` + required-field enforcement already exist and are unchanged by this plan (out of scope, confirmed correct in verified_facts). This plan only supplies the missing client-side value the backend already expects. |
| T-quick-02 | Tampering (key collision) | `generateIdempotencyKey()` using `Math.random()` instead of a CSPRNG | accept | Collision risk is negligible for this use case (per-user, per-session dedup key, not a security secret) and matches the codebase's existing accepted pattern (`ai-chat.tsx`'s identical construction) — `uuid`/CSPRNG is unavailable on this Hermes build without an unlinked native polyfill. |

</threat_model>

<verification>
1. `cd mobile && npx tsc --noEmit` — no new type errors.
2. Manual read-through of `mobile/app/send.tsx` confirms: `generateIdempotencyKey()` is defined once, the `transferMutation` payload type declares `idempotencyKey: string`, and `handleSend()` calls `generateIdempotencyKey()` fresh (not from state/props) and includes it in the `transferMutation.mutate({...})` call.
3. Confirm no other file was modified (`git diff --stat` shows only `mobile/app/send.tsx`).
</verification>

<success_criteria>
- `POST /wallet/transfer` requests from `mobile/app/send.tsx` include a valid `idempotencyKey` (8-64 chars) on every send attempt, satisfying `TransferDto`'s required-field validation — the guaranteed-400 bug is closed.
- Each real Send button press generates its own fresh key; no stale/reused key can suppress a legitimate second transfer.
- `cd mobile && npx tsc --noEmit` passes.
- No backend files or other mobile screens are touched.
</success_criteria>

<output>
After completion, create `.planning/quick/260723-gik-fix-wallet-send-screen-missing-required-/260723-gik-SUMMARY.md`
</output>
