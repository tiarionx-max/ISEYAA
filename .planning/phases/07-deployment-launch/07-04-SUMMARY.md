---
phase: 07-deployment-launch
plan: "04"
subsystem: infra
tags: [expo, eas, app-store, play-store, mobile, gitignore, privacy-manifest]

# Dependency graph
requires:
  - phase: 07-01
    provides: "app.json with buildNumber, versionCode, privacyManifests already set by that plan"
provides:
  - "google-service-account.json gitignored in mobile/.gitignore"
  - "MANUAL-ACTIONS.md LAUNCH-04 + LAUNCH-05 App Store submission checklist"
affects: [operator-runbook, launch]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "EAS CLI build + submit workflow documented (npm run build:ios / build:android / submit:ios / submit:android)"
    - "Development build as fastest path to device testing before store submission"

key-files:
  created:
    - .planning/phases/07-deployment-launch/07-04-SUMMARY.md
  modified:
    - mobile/.gitignore
    - MANUAL-ACTIONS.md

key-decisions:
  - "google-service-account.json added to mobile/.gitignore (not root) since that is the file's location"
  - "App Store checklist placed inside existing Phase 7 section in MANUAL-ACTIONS.md for continuity"
  - "Development build documented as Step 0 — it is the fastest device testing path and requires no Apple/Google account review"

patterns-established:
  - "Version increment pattern: buildNumber (iOS string), versionCode (Android int), version (user-visible semver) are all in mobile/app.json"

requirements-completed: [LAUNCH-04, LAUNCH-05]

# Metrics
duration: 10min
completed: 2026-05-20
---

# Phase 7 Plan 04: App Store Submission Prep Summary

**iOS privacy manifest verified, google-service-account.json gitignored, and complete EAS build+submit checklist with development-build-first workflow documented in MANUAL-ACTIONS.md**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-05-20T00:00:00Z
- **Completed:** 2026-05-20T00:10:00Z
- **Tasks:** 3
- **Files modified:** 2

## Accomplishments

- Verified `mobile/app.json` already contains all required store submission fields from plan 07-01 (buildNumber, versionCode, privacyManifests, extra.eas.projectId) — no changes needed
- Added `google-service-account.json` to `mobile/.gitignore` to prevent Google Play service account credentials from being committed (threat T-07-08 mitigated)
- Appended complete LAUNCH-04 + LAUNCH-05 App Store submission checklist to MANUAL-ACTIONS.md, including: Step 0 development build for immediate device testing, prerequisites, production build commands, size verification, TestFlight submission, Play Store submission, and version increment instructions

## Task Commits

Each task was committed atomically:

1. **Task 1: Verify app.json** - no commit (already complete from 07-01, all fields present)
2. **Task 2: gitignore google-service-account.json** - staged in docs commit
3. **Task 3: App Store checklist in MANUAL-ACTIONS.md** - staged in docs commit

**Plan metadata:** `docs(07-04): add app store submission checklist and gitignore google-service-account`

## Files Created/Modified

- `mobile/.gitignore` - Added `google-service-account.json` entry to prevent accidental credential commit
- `MANUAL-ACTIONS.md` - Appended LAUNCH-04 + LAUNCH-05 section with full EAS build/submit workflow, device testing path, TestFlight + Play Store steps, and version increment guide

## app.json Verification Result

All required fields were already present from plan 07-01. No modifications needed:

| Field | Value | Status |
|-------|-------|--------|
| `expo.version` | `"1.0.0"` | Present |
| `expo.ios.buildNumber` | `"1"` | Present |
| `expo.android.versionCode` | `1` | Present |
| `expo.ios.privacyManifests.NSPrivacyAccessedAPITypes` | `[{NSPrivacyAccessedAPICategoryUserDefaults, CA92.1}]` | Present |
| `expo.extra.eas.projectId` | `"PLACEHOLDER_EAS_PROJECT_ID"` | Present (operator must replace after `eas init`) |

## Decisions Made

- `google-service-account.json` was added to `mobile/.gitignore` (not the root `.gitignore`) since the file lives in `mobile/` and the mobile gitignore is the appropriate scope boundary
- Development build documented as "Step 0" — it is the fastest path to device testing and requires no Apple Developer account for Android; this reduces time-to-first-install significantly
- EAS project ID is left as `PLACEHOLDER_EAS_PROJECT_ID`; operator must run `eas init` inside `mobile/` to link to their Expo account and obtain the real ID

## Deviations from Plan

None - plan executed exactly as written. Task 1 resulted in a no-op (all fields already present from 07-01), which was the expected outcome per plan instructions ("If all are present, skip to Task 2").

## Issues Encountered

None.

## Threat Surface Scan

| Flag | File | Description |
|------|------|-------------|
| T-07-08 mitigated | mobile/.gitignore | google-service-account.json now gitignored — prevents Play Store service account key from being committed |

## Next Phase Readiness

- `mobile/app.json` is store-submission-ready
- Operator has a clear checklist in `MANUAL-ACTIONS.md` to build, verify sizes, and submit to both TestFlight and Play Store internal track
- After `eas init`, operator must replace `PLACEHOLDER_EAS_PROJECT_ID` in `mobile/app.json` with the real EAS project ID

---
*Phase: 07-deployment-launch*
*Completed: 2026-05-20*

## Self-Check: PASSED

- `mobile/.gitignore` contains `google-service-account.json` entry: FOUND
- `MANUAL-ACTIONS.md` contains `LAUNCH-04` and `TestFlight`: FOUND
- `mobile/app.json` contains `buildNumber`, `versionCode`, `privacyManifests`: FOUND (verified via Read)
- `.planning/phases/07-deployment-launch/07-04-SUMMARY.md`: CREATED (this file)
