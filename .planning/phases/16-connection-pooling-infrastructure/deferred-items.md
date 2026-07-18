# Phase 16 — Deferred Items

Pre-existing issues discovered during plan execution that are out of scope for the plan that found them (per executor SCOPE BOUNDARY rule — only auto-fix issues directly caused by the current task's own changes).

## From Plan 16-03 (combined-topology k6 load test)

**Item:** `load-tests/k6/common/auth.js`'s `getToken()` and `load-tests/k6/scenarios/auth-flow.js` POST `{ phone, password }` to `/api/v1/auth/login`, but `backend/src/modules/auth/dto/login.dto.ts`'s `LoginDto` expects `{ identifier, password }` (`property phone should not exist`, `identifier must be a string` — verified via live 400 response during Plan 16-03 Task 2 verification).

**Impact:** Every k6 scenario that calls `getToken()` (`wallet-flow.js`, `transport-flow.js`) or posts directly with `phone` (`auth-flow.js`) fails its check against a real backend — 3 of the 4 pre-existing HTTP flows in `load-tests/k6/main.js` return 400/401 instead of 200. This predates Plan 16-03 entirely (none of these three files are in 16-03's `files_modified`); `events-flow.js` (no auth) and the new `notifications-grpc-flow.js` (Plan 16-03's actual deliverable) both pass cleanly.

**Status:** Not fixed — out of scope for Plan 16-03. Fixing requires changing `phone` to `identifier` in `load-tests/k6/common/auth.js` and `load-tests/k6/scenarios/auth-flow.js` (2-line fix, low risk) but touches files outside this plan's declared scope.

**Verified:** 2026-07-18, live against local monolith (`backend/dist/main.js`) + local notifications-service (`backend/dist/apps/notifications-service/src/main.js`), Postgres+Redis via `docker-compose.yml`.

**Recommendation:** Fix in a future Quick Task or the next plan that touches `load-tests/k6/`, before relying on `main.js`'s full 10K-VU acceptance run for real capacity numbers — today it would report a false ~83% `http_req_failed` rate driven entirely by this DTO mismatch, not by actual load-induced failures.
