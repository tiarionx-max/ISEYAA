---
phase: 07-deployment-launch
plan: "01"
subsystem: mobile
tags: [eas, expo, build, deployment, mobile]
dependency_graph:
  requires: []
  provides: [eas-build-config, expo-dev-client]
  affects: [mobile/eas.json, mobile/package.json, mobile/app.json, .env.example]
tech_stack:
  added: [expo-dev-client ~4.0.0, eas-cli >= 10.0.0]
  patterns: [EAS Build profiles, internal distribution, app-bundle for Play Store]
key_files:
  created: [mobile/eas.json]
  modified: [mobile/package.json, mobile/app.json, .env.example]
key_decisions:
  - "APK for dev/preview builds (faster install); app-bundle for production Play Store submission"
  - "internal distribution on dev/preview profiles avoids App Store review cycle for testing"
  - "EXPO_PUBLIC_API_URL set to Railway URL in all three profiles — operator must confirm URL matches their Railway service"
metrics:
  duration: "~5 minutes"
  completed: "2026-05-20T17:07:56Z"
  tasks_completed: 3
  tasks_total: 3
  files_modified: 4
---

# Phase 7 Plan 01: EAS Build Configuration Summary

**One-liner:** EAS build config with development/preview/production profiles, expo-dev-client, and app.json metadata for cloud mobile builds via Expo Application Services.

## What Was Built

Three EAS build profiles are now configured in `mobile/eas.json`:

| Profile | Distribution | Android | iOS | Purpose |
|---------|-------------|---------|-----|---------|
| development | internal | APK | device | Live-reload dev testing |
| preview | internal | APK | device | Stakeholder testing before release |
| production | store | AAB | App Store | App Store / Play Store submission |

## Files Created

- `mobile/eas.json` — EAS build configuration with three profiles + submit config (Apple ID: `toyeenfolayan@gmail.com`)

## Files Modified

- `mobile/package.json` — Added `expo-dev-client: ~4.0.0` to dependencies; added 8 EAS build/submit scripts
- `mobile/app.json` — Added `buildNumber: "1"`, `versionCode: 1`, `privacyManifests` (AsyncStorage NSUserDefaults), and `extra.eas.projectId: "PLACEHOLDER_EAS_PROJECT_ID"`
- `.env.example` — Added `EXPO_PUBLIC_API_URL=https://iseyaa-api.up.railway.app`

## Operator Instructions: First Build

### Step 1 — Confirm Railway API URL

Before building, verify the Railway backend URL is correct. Log in to Railway and copy the public URL for the `iseyaa-api` service. If it differs from `https://iseyaa-api.up.railway.app`, update the `env.EXPO_PUBLIC_API_URL` value in all three profiles in `mobile/eas.json`.

### Step 2 — Authenticate with EAS

```bash
npm install -g eas-cli
eas login
# Enter: toyeenfolayan@gmail.com
```

### Step 3 — Initialize EAS project and get your Project ID

```bash
cd mobile
eas init
```

This creates a project on expo.dev and prints a UUID. Copy the UUID and replace `PLACEHOLDER_EAS_PROJECT_ID` in `mobile/app.json`:

```json
"extra": {
  "eas": {
    "projectId": "YOUR-UUID-HERE"
  }
}
```

### Step 4 — Run your first Android development build

```bash
cd mobile
npm run build:dev:android
```

EAS will build in the cloud. When complete, it prints a QR code and download link. Scan with your Android device to install the APK directly.

### Step 5 — iOS development build (requires Apple Developer account)

```bash
cd mobile
npm run build:dev:ios
```

EAS will prompt for Apple credentials. The resulting build can be installed via TestFlight or direct device registration.

### Available Build Scripts

| Script | Command | What it does |
|--------|---------|-------------|
| `build:dev:android` | `npm run build:dev:android` | Android APK with live reload (recommended first build) |
| `build:dev:ios` | `npm run build:dev:ios` | iOS dev build (requires Apple Developer) |
| `build:dev` | `npm run build:dev` | Both platforms simultaneously |
| `build:preview` | `npm run build:preview` | Preview APK/IPA for stakeholder testing |
| `build:android` | `npm run build:android` | Production AAB for Play Store |
| `build:ios` | `npm run build:ios` | Production IPA for App Store |
| `submit:android` | `npm run submit:android` | Submit to Play Store internal track |
| `submit:ios` | `npm run submit:ios` | Submit to App Store |

### App Store Submit Placeholders (complete before production submit)

In `mobile/eas.json` submit.production.ios:
- `PLACEHOLDER_APP_STORE_APP_ID` — Get from App Store Connect after creating the app listing
- `PLACEHOLDER_APPLE_TEAM_ID` — Get from developer.apple.com → Membership → Team ID

## Deviations from Plan

None - plan executed exactly as written.

## Threat Surface Scan

No new network endpoints, auth paths, or server-side security surface introduced. EXPO_PUBLIC_API_URL is intentionally public (bundled into the app binary — the `EXPO_PUBLIC_` prefix is the Expo convention for client-visible env vars). Apple credentials (`ascAppId`, `appleTeamId`) are placeholders only.

## Self-Check: PASSED

- `mobile/eas.json` exists: VERIFIED
- `mobile/package.json` has expo-dev-client and build:dev script: VERIFIED
- `mobile/app.json` has extra.eas.projectId, buildNumber, versionCode, privacyManifests: VERIFIED
- `.env.example` has EXPO_PUBLIC_API_URL: VERIFIED
- Commit `1970c44` exists: VERIFIED
