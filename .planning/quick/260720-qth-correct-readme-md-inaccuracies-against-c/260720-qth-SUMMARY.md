---
quick_id: 260720-qth
status: complete
---

# Quick Task 260720-qth: Correct README.md inaccuracies against current codebase

**Status:** Complete
**Date:** 2026-07-20

## What Changed

README.md was corrected in place (Edit, not rewrite) across 3 tasks/commits, all documentation-only — no application code touched:

1. **`2ca0ade`** — Fixed Architecture, Prerequisites, and Local Setup sections:
   - Architecture diagram now lists all real top-level dirs (`backend/`, `web/`, `mobile/`, `shared/`, `packages/proto`, `docs/`, `monitoring/`, `load-tests/`) and explains the monolith+gRPC-microservices hybrid (5 services live-wired via `docker-compose.yml` — notifications, news, waitlist, reviews, delivery-otp; 7 more exist as Railway scaffolds under `backend/apps/` but are not yet extracted).
   - Prerequisites updated: storage is Cloudflare R2 (primary) or AWS S3 (auto-detected fallback), not AWS-only; added Docker Compose as the recommended path.
   - Install steps simplified to a single root `npm install` (root npm workspaces), replacing the stale per-directory install + optional pnpm mention.
   - Env var block rewritten around the real root `.env` (not `backend/.env` — `ConfigModule`'s `envFilePath` resolves to repo root), grouped by real `.env.example` sections. Removed the unused `NEXT_PUBLIC_GOOGLE_MAPS_KEY` from the web env block (confirmed unused via grep).

2. **`c0d1367`** — Added the 6 previously-missing modules to API Overview and Module Reference:
   - API Overview table gained rows for Delivery, Notifications, Waitlist, News, Reviews, AI with real routes pulled from controller source.
   - Module Reference gained a subsection for each of the 6, grounded in the real service files, plus a note that gRPC-client wrapper modules (`*-client`) are thin proxies not separately documented.

3. **`6dc46f8`** — Fixed Running Tests and Deployment Checklist:
   - Removed the stale hardcoded "153 tests, 11 suites" claim; replaced with a freshly-measured suite count from `npx jest --listTests` (70 suites) and a non-specific pointer to `npm run test:coverage` for pass/fail totals rather than a guessed case count.
   - Deployment Checklist now documents the real multi-target Railway setup (root `railway.toml` for the monolith, `web/railway.toml`, per-service `backend/apps/*/railway.toml`) and references `docs/blue-green-cutover-runbook.md` for the canary cutover process; fixed the CDN/storage checklist item to the real R2/S3 dual-mode vars.

## Verification

All 6 automated checks from the plan pass against the final README.md:
- `backend/apps` present (3 hits)
- `Cloudflare R2` present (2 hits)
- All 6 missing module names present (`DeliveryModule|NotificationsModule|WaitlistModule|NewsModule|ReviewsModule|AiModule` — 6 hits)
- Literal `"153 tests, 11 suites"` — 0 hits (removed)
- `railway.toml` present (2 hits)
- `R2_PUBLIC_URL|blue-green` present (5 hits)

Manually confirmed via diff that the "Key Technical Decisions" table and previously-accurate API Overview rows are unchanged from the original.

## Notes

- Executed in an isolated worktree (`worktree-agent-a469757d6cd040b3f`), merged back cleanly with `--no-ff` (no conflicts, no file deletions).
- This SUMMARY.md file was lost when the worktree was force-removed before its uncommitted contents were rescued (a gap in this run's cleanup step) and has been reconstructed here from the executor's final report and a fresh read of the merged README.md; the 3 code commits themselves were unaffected since they were already committed inside the worktree before merge.
- No secrets or real key material were introduced — all env var examples use placeholder shapes sourced from `.env.example`.
