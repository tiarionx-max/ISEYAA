---
phase: 08-mobile-redesign
plan: 04b
type: execute
wave: 2
depends_on: []
files_modified:
  - mobile/app/_layout.tsx
autonomous: true
requirements: [MOB-RD-05, MOB-RD-06]
must_haves:
  truths:
    - "Root Stack registers all 4 new modal/card routes that downstream Wave 3 plans depend on: marketplace/[id], cart, checkout, host"
    - "Existing Stack.Screen registrations are unchanged"
    - "No Wave 3 plan needs to edit _layout.tsx — disjoint file ownership"
  artifacts:
    - path: "mobile/app/_layout.tsx"
      provides: "Stack registrations for the 4 new Wave-3 routes"
      contains: "marketplace/[id]"
  key_links:
    - from: "mobile/app/_layout.tsx"
      to: "expo-router Stack"
      via: "Stack.Screen additions"
      pattern: "Stack.Screen.*marketplace|cart|checkout|host"
---

<objective>
Register all 4 new Stack routes upfront in `mobile/app/_layout.tsx` so Wave 3 plans (08-05, 08-06, 08-07) do NOT have to touch this file. This eliminates the file-ownership conflict where 08-06 and 08-07 both edited `_layout.tsx` (H-4 in plan-check). After this plan lands, Wave 3 is truly disjoint: 08-05 owns `book.tsx` + `components/book/`, 08-06 owns `app/marketplace/[id].tsx`/`cart.tsx`/`checkout.tsx`, 08-07 owns `app/host.tsx` + `(tabs)/profile.tsx`.

Purpose: Per H-4 Option A (preferred over moving 08-07 to Wave 4), pre-register the route shells so Wave 3 plans can run fully parallel. Each Wave 3 plan ASSUMES these routes already exist at the path and presentation modes declared here.

Output: A ~5-line additive edit to `mobile/app/_layout.tsx`. No code in the new screens — just route registrations.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/08-mobile-redesign/08-CONTEXT.md
@mobile/app/_layout.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add 4 Stack.Screen registrations to mobile/app/_layout.tsx</name>
  <files>mobile/app/_layout.tsx</files>
  <action>Edit `mobile/app/_layout.tsx` and add FOUR new `<Stack.Screen>` registrations inside the existing `<Stack>` block. Insert them directly after the existing `<Stack.Screen name="stays/[id]" .../>` line (currently around line 47 — verify the line range is still accurate when executing). The exact additions:

  <Stack.Screen name="marketplace/[id]" options={{ title: 'Product' }} />
  <Stack.Screen name="cart" options={{ headerShown: false, presentation: 'transparentModal', animation: 'none' }} />
  <Stack.Screen name="checkout" options={{ title: 'Checkout', presentation: 'card' }} />
  <Stack.Screen name="host" options={{ headerShown: false, presentation: 'card' }} />

Do NOT modify any other Stack.Screen line, the QueryClient init, the Sentry init, or the `useEffect` that handles auth redirect. Do NOT remove any existing screen registrations. The `animation: 'none'` on `cart` is intentional — the slide-in is handled internally by 08-06's cart screen with Reanimated; the Stack's default transition would compound and feel wrong.

After this edit, NO Wave 3 plan should touch `_layout.tsx`. Wave 3 plans assume the routes exist at the paths declared above.</action>
  <verify>
    <automated>node -e "const fs=require('fs'); const c=fs.readFileSync('mobile/app/_layout.tsx','utf8'); const need=['marketplace/[id]','name=\"cart\"','name=\"checkout\"','name=\"host\"','transparentModal']; for(const n of need){if(!c.includes(n)){console.error('Missing',n);process.exit(1);}} const screens=(c.match(/<Stack\.Screen/g)||[]).length; if(screens<19){console.error('Expected >=19 Stack.Screen (15 existing + 4 new), got',screens);process.exit(2);} console.log('OK screens:',screens);"</automated>
  </verify>
  <done>Root Stack registers all 4 new routes (`marketplace/[id]`, `cart`, `checkout`, `host`) with correct presentation modes. Existing registrations untouched. `cd mobile && npx tsc --noEmit` passes. `router.push('/cart')`, `router.push('/checkout')`, `router.push('/host')`, `router.push('/marketplace/X')` all resolve without "route not found" warnings (even though the screen FILES don't exist yet — they will be created in Wave 3).</done>
</task>

</tasks>

<verification>
- `grep -c "<Stack.Screen" mobile/app/_layout.tsx` returns >= 19 (15 existing + 4 new).
- `grep -E 'name="(marketplace/\[id\]|cart|checkout|host)"' mobile/app/_layout.tsx | wc -l` returns 4.
- `cd mobile && npx tsc --noEmit` passes.
- No other file modified.
</verification>

<success_criteria>
- 4 new Stack routes registered: `marketplace/[id]`, `cart`, `checkout`, `host`.
- Wave 3 plans (08-05, 08-06, 08-07) no longer touch `_layout.tsx` → disjoint file ownership.
- All existing registrations preserved.
</success_criteria>

<output>
Create `.planning/phases/08-mobile-redesign/08-04b-SUMMARY.md` with: the 4 route registrations added, the insertion point line number, and confirmation that no other Stack.Screen entry changed.
</output>
