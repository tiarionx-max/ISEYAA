---
phase: 08-mobile-redesign
plan: 07
subsystem: mobile
tags: [mobile, host, onboarding, MOB-RD-06]
requirements: [MOB-RD-06]
key-files:
  created:
    - mobile/app/host.tsx
  modified:
    - mobile/app/(tabs)/profile.tsx
decisions:
  - Hero gradient sourced from CARD_GRADIENTS.goldHero (4-stop tuple in mobile/lib/tokens.ts) — no inline hex stops anywhere in host.tsx.
  - FAQ accordion implemented with simple useState<number | null> + ChevronDown rotation via styled View transform — no third-party accordion library.
  - Profile CTA card inserted between Driver Mode block and Menu Section to keep diff small and visually adjacent to other "mode" cards.
  - alreadyHost derived from BOTH user.registeredRoles?.includes('HOST') AND user.isHost === true (per CONTEXT, registeredRoles is canonical; isHost kept as safety alias).
commits:
  - 367cd55: feat(08-07): add mobile host onboarding screen
  - 4a3f68b: feat(08-07): add Become-a-host CTA card in profile tab
---

# Phase 8 Plan 08-07: Host Onboarding (Mobile) Summary

Mobile host onboarding screen + profile-tab entry point closing MOB-RD-06.

## What Was Built

### `mobile/app/host.tsx` (NEW, 563 lines)

- **Hero**: `LinearGradient` with `CARD_GRADIENTS.goldHero` (4-stop: `#3a2e15 → #6a4a14 → #C8962A → #4a3208`, imported from `mobile/lib/tokens.ts`). Dark scrim overlay at `rgba(0,0,0,0.4)`. Cream display heading "Become an Iṣẹ́yáá Host" with "Iṣẹ́yáá" rendered in gold italic. Pill with `Sparkles` lucide icon + "Hosting on Iṣẹ́yáá" caption. Back chevron in top-left (44×44, 44pt touch).
- **Benefits**: 3 cards (`Wallet`, `Users`, `ShieldCheck` lucide icons) — `SURFACE_RAISED` bg, `BORDER_SUBTLE` border, 44×44 `FOREST_DIM` icon box with `FOREST` border, gold icon.
- **Hostable**: 7 `Chip` components (Stay, Lounge, Club, Beach, Tour, Experience, Social Club) each with `Check` icon prefix.
- **Q&A**: 3 collapsible accordion items (How does payout work? / How much do I keep? / What about social clubs?). Simple `useState<number | null>(null)` controls open index. ChevronDown rotates 180° via styled View transform.
- **Sticky CTA footer**: Branched on `alreadyHost`:
  - Not yet host → gold `PressableScale` button "I want to host" → `useMutation` → `POST /api/v1/users/me/become-host` → on success invalidates `['me']`, shows Alert, navigates to `/(tabs)/profile`. `ActivityIndicator` while pending.
  - Already host → outline button "Go to dashboard" stub (Alert: Coming soon) per CONTEXT.md §8.2 (host dashboard deferred).
- All touch targets ≥ 44pt (back btn 44, FAQ header `minHeight: 56`, sticky CTA `minHeight: 52`).

### `mobile/app/(tabs)/profile.tsx` (MODIFIED, +77 lines)

- Added `Home` to lucide-react-native import.
- Imported `PressableScale` from `../../components/ui/PressableScale`.
- Extended `UserProfile` interface with `registeredRoles?: string[]` and `isHost?: boolean`.
- Added `alreadyHost = (user?.registeredRoles ?? []).includes('HOST') || user?.isHost === true` computation.
- Inserted "Become a host" card between the Driver Mode card and the Menu Section: `PressableScale` wrapping a row with gold `Home` icon, "Become a host" title, "List your stay, club, or experience" subtitle, ChevronRight. Renders only when `!alreadyHost`. On press: `router.push('/host')`.
- Added `hostCtaWrap` / `hostCtaCard` / `hostCtaInner` / `hostCtaIconBox` / `hostCtaTextBlock` / `hostCtaTitle` / `hostCtaSub` styles matching existing Driver/Menu card visual patterns.

## Constraint Compliance

- `CARD_GRADIENTS.goldHero` referenced: **2 matches** in host.tsx (import + LinearGradient `colors=` prop).
- Forbidden inline hex stops (`#3a2e15`, `#6a4a14`, `#C8962A`, `#4a3208`): **0 matches** in host.tsx.
- `mobile/app/_layout.tsx`: **not edited** (`git diff --stat mobile/app/_layout.tsx` returns empty). 08-04b owns Stack route registration.
- `cd mobile && npx tsc --noEmit`: passes (only pre-existing `@sentry/react-native` module-not-found error remains, unrelated to this plan).
- Lucide icons used throughout for benefit cards (`Wallet`, `Users`, `ShieldCheck`) and chips (`Check`) — no raw SVG.

## Backend Contract Verified

- `POST /api/v1/users/me/become-host` exists at `backend/src/modules/users/users.controller.ts:66-71`. Handler delegates to `usersService.becomeHost(userId)` which adds `'HOST'` to `registeredRoles`.
- `GET /api/v1/users/me` returns `registeredRoles: string[]` (confirmed via `users.service.ts` select projection).

## Deviations from Web Parity

- **No `motion.div` animations.** React Native `Animated`/`Reanimated` would have added overhead for low-payoff; relied on `PressableScale` spring for tactile feedback instead.
- **No `Image` hero background.** Web uses `/og-image.png` at 30% opacity. Mobile uses pure gradient + dark scrim — keeps file size down and matches `CARD_GRADIENTS.goldHero` token-driven approach mandated by M-5.
- **Hero "Iṣẹ́yáá" rendered as gold italic Text span** (mobile gradient-on-text isn't trivial cross-platform without extra libs). Visually conveys the brand emphasis from web's `text-gradient-gold` class.
- **Web has `bg-adire` overlay** in benefits + CTA sections. Mobile omits the adire pattern overlay on host.tsx (token doesn't expose one yet); the existing `AdireOrnament` SVG in profile.tsx is scoped to KYC card and not reused here.
- **CTA on already-host path is a stub** ("Coming soon" alert) — host dashboard mobile screen is deferred per CONTEXT.md §8.2.

## Files Out of Scope (untouched)

- `mobile/app/_layout.tsx` (08-04b owns Stack route registration — confirmed `Stack.Screen name="host"` exists at line 51).
- Every other file in the repo.

## Self-Check: PASSED

- `mobile/app/host.tsx` exists (563 lines).
- `mobile/app/(tabs)/profile.tsx` modified (1073 lines, +77 from prior 996).
- Commit `367cd55` (host.tsx) exists in git log.
- Commit `4a3f68b` (profile.tsx CTA) exists in git log.
- `CARD_GRADIENTS.goldHero` referenced 2× in host.tsx; 0 forbidden inline hex stops.
- `mobile/app/_layout.tsx` diff stat: empty.
- `npx tsc --noEmit` in `mobile/`: clean except pre-existing Sentry error.
