---
phase: quick
plan: 260727-l1v
status: complete
subsystem: mobile
tags: [metro, expo, dev-tooling, windows]
---

# Summary: Narrow Metro's watchFolders

Fixed a recurring `Failed to start watch mode` error when starting Metro on this Windows machine during live emulator testing this session. `metro.config.js` previously set `watchFolders` to the entire monorepo root; with Watchman not installed (and no admin rights available to install it via Chocolatey in this environment), Metro's `NodeWatcher` fallback timed out trying to register `fs.watch` handles across `backend/`, `web/`, `packages/proto/`, `.git/`, `.planning/`, `.claude/`, and every workspace's `node_modules` — none of which `mobile/` actually needs to watch.

## Change

`mobile/metro.config.js`: `watchFolders` narrowed to just `shared/` (the only monorepo package `mobile/` imports, via the `@iseyaa/shared` path alias) and root `node_modules` (for hoisted npm-workspaces dependencies), instead of the full `monorepoRoot`.

## Verification

Confirmed via direct use, not automated tests (this is a dev-tooling config change): Metro bundled successfully (`Android Bundled 47950ms ... (3771 modules)`) immediately after this change, and stayed reliable across several subsequent dev-server restarts later in the same session while testing host/vendor/organiser/driver dashboards, the JWT bug fix, and the dashboard-reconciliation fix live on an Android emulator. No further watcher timeouts occurred.

## Deviations

None — this was a direct, targeted fix for an observed, reproduced blocker, made and verified inline during live testing rather than through the full plan → worktree-executor cycle (a 3-line dev-config change with no application-code risk).
