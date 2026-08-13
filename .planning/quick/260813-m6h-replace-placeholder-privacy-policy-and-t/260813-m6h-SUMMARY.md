---
phase: quick-260813-m6h
plan: 01
subsystem: legal-compliance
tags: [nextjs, react-native, expo-router, legal, ndpa, compliance]

requires: []
provides:
  - Real, NDPA-referencing Privacy Policy at web /privacy (10 sections)
  - Real Terms of Use at web /terms (11 sections)
  - Working mobile onboarding Terms/Privacy links via Linking.openURL
  - CLAUDE.md Deploy Reminder documenting Railway's origin/main-only auto-deploy behavior
affects: [web-legal-pages, mobile-onboarding, deploy-process]

tech-stack:
  added: []
  patterns:
    - "Legal copy lives inline in page.tsx inside the existing glass-card shell, no CMS/markdown layer"
    - "Nested <Text onPress> wiring pattern for inline links inside a larger <Text> block (mirrors existing handlePhonePress/handleEmailPress handler style)"

key-files:
  created: []
  modified:
    - web/src/app/privacy/page.tsx
    - web/src/app/terms/page.tsx
    - mobile/app/onboarding.tsx
    - CLAUDE.md

key-decisions:
  - "Legal copy inserted verbatim from the plan's context block, only replacing the inner glass-card content — page shell, icons, imports, and styling untouched"
  - "Mobile Terms/Privacy links point at the live production web URLs (iseyaaweb-production.up.railway.app) rather than a mobile-native legal screen, since the real content now lives on the web app"

patterns-established: []

requirements-completed: [LEGAL-01, LEGAL-02, LEGAL-03, LEGAL-04]

duration: 20min
completed: 2026-08-13
---

# Quick Task 260813-m6h: Replace Placeholder Privacy Policy and Terms Summary

**Real NDPA-referencing legal copy on web /privacy and /terms, working mobile onboarding Terms/Privacy links, and a permanent CLAUDE.md reminder about Railway's origin/main-only deploy behavior**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-08-13
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Replaced placeholder Privacy Policy (web/src/app/privacy/page.tsx) with a real 10-section policy covering NDPA 2023 compliance, data collected, AES-256-GCM/bcrypt protection of NIN/BVN, user rights, retention, and contact — zero "placeholder" text remains
- Replaced placeholder Terms of Use (web/src/app/terms/page.tsx) with a real 11-section document covering eligibility, wallet/payments, bookings, prohibited conduct, liability, and governing law (Ogun State, Nigeria) — zero "placeholder" text remains
- Wired the previously-dead "Terms" and "Privacy" text links in mobile onboarding.tsx to open the live production web pages via `Linking.openURL`
- Added a permanent "Deploy Reminder" section to CLAUDE.md documenting that Railway only auto-deploys from `origin/main`, directly addressing a recurring gap logged multiple times in STATE.md (most recently the 2026-07-28 incident where several days of work sat un-deployed on a working branch)

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace placeholder Privacy Policy and Terms of Use with real legal copy** - `3bfc107` (feat)
2. **Task 2: Wire mobile onboarding Terms/Privacy links + add CLAUDE.md deploy-push reminder** - `2d0b5f5` (feat)

## Files Created/Modified
- `web/src/app/privacy/page.tsx` - Real NDPA-referencing Privacy Policy, 10 numbered sections, same page shell/glass-card styling
- `web/src/app/terms/page.tsx` - Real Terms of Use, 11 numbered sections, same page shell/glass-card styling
- `mobile/app/onboarding.tsx` - Added `Linking` import, `handleTermsPress`/`handlePrivacyPress` handlers, wired onto the nested Terms/Privacy `<Text onPress>` spans
- `CLAUDE.md` - New "Deploy Reminder" section between "GSD Workflow Enforcement" and "Developer Profile"

## Decisions Made
- Legal copy was provided verbatim in the plan's context block (already vetted) — inserted as-is with no additional wordsmithing, preserving the exact page shell/styling.
- Mobile links route to the live production web URLs rather than duplicating the legal text natively in the app, keeping a single source of truth for legal copy.

## Deviations from Plan

None - plan executed exactly as written.

Note: during execution, an early Write/Edit round accidentally targeted the main repository checkout (`C:\Developer\work\ISEYAA\...`) instead of this worktree (`.claude/worktrees/agent-a69a3fca5e9547c9f\...`) due to an absolute-path mix-up. This was caught before any commit — the main-repo files were restored to their original placeholder content (confirmed via `git diff` showing zero changes), and the real edits were redone correctly inside the worktree. No stray changes were committed anywhere; the main repo checkout was left exactly as it was found.

## Issues Encountered
- `cd web && npx tsc --noEmit` and `cd mobile && npx tsc --noEmit` both report `Cannot find module 'framer-motion'` / other module-resolution errors — these are pre-existing, caused by this worktree having no `node_modules` installed (consistent with prior quick-task notes, e.g. 260802-eix, 260802-6uu). No errors specific to `privacy/page.tsx`, `terms/page.tsx`, or `onboarding.tsx` beyond that pre-existing module-resolution noise; the required grep-based verification (`grep -ic "This is a placeholder"` returns 0, `Nigeria Data Protection Act`/`Governing Law` present, `Linking.openURL` count is 2) all pass cleanly.

## User Setup Required

None - no external service configuration required. This closes one item from the 2026-08-13 punchlist ("privacy policy URL still outstanding") noted in STATE.md's prior session log.

## Next Phase Readiness
- Web `/privacy` and `/terms` now render complete legal copy suitable for pre-launch review.
- Mobile onboarding's Terms/Privacy links now function correctly against the production web app.
- CLAUDE.md permanently documents the origin/main-only Railway deploy rule — **this work still needs to be pushed to `origin/main` to go live**, per the very reminder just added; that push was not performed as part of this quick task (requires explicit user confirmation before triggering a production redeploy).

---
*Phase: quick-260813-m6h*
*Completed: 2026-08-13*

## Self-Check: PASSED

All 4 code files and the SUMMARY.md confirmed present on disk; both task commits (`3bfc107`, `2d0b5f5`) confirmed present in git log.
