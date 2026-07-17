---
created: 2026-07-17T22:11:51.458Z
title: Add compile step to packages/proto (INT-02)
area: tooling
files:
  - packages/proto/package.json
  - packages/proto/generate.sh
  - package.json (root build:all)
---

## Problem

`packages/proto/package.json` declares `main: generated/index.js` and `types: generated/index.d.ts`, but `generate.sh` only ever emits `.ts` source — there is no build/compile step anywhere for the `@iseyaa/proto` package (no `"build"` script; root `build:all` runs `--if-present` and silently skips it). `nest build <service>` passes for all 8 scaffolds only because tsc's resolver is lenient and extension-swaps to the `.ts` source directly at build time.

Proven at actual Node.js `require()` time: `node -e "require('@iseyaa/proto')"` from `backend/` fails with `Cannot find module '...\node_modules\@iseyaa\proto\generated\index.js'`, and directly requiring compiled dist output fails identically. This means Phase 10's verified "nest build exits 0" success criterion does NOT imply the compiled service can actually run — a deeper failure mode than the previously-known Docker-build gap (backend/package.json never declaring `@iseyaa/proto`, from `10-VERIFICATION.md`), which only caught the Docker-build-time symptom, not this runtime one.

Blocks Phase 16 (pooling load test needs a second real running service) and Phase 17 (first live gRPC extraction).

Surfaced by: `.planning/v2.0-MILESTONE-AUDIT.md` (2026-07-17 audit), finding INT-02.

## Solution

Add a real build script to `packages/proto/package.json` (tsc emitting `.js` + `.d.ts` from the generated `.ts` source) and wire it into root `build:all`. Should be fixed together with the existing Docker-build gap (`@iseyaa/proto` undeclared as a `backend` dependency) before Phase 17 attempts any live extraction that needs a runnable image. Likely a Phase 16 or Phase 17 prerequisite task — surface during those phases' discuss/plan steps.
