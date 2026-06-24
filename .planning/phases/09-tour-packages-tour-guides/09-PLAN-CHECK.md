# Phase 9 Plan Check

Verdict: PASS_WITH_NOTES
Iteration: 1
Checker: gsd-plan-checker
Date: 2026-06-23

## Summary

13 plans across 8 waves deliver all 10 ROADMAP success criteria with strong architectural rigor on the highest-risk path (multi-vendor settlement). Codebase spot-checks confirm planner assumptions: TOUR_GUIDE enum addition is additive (UserRole has 10 values today at schema.prisma:13), BookingStatus reuse is sound (line 87), no existing RefundService (correct - only 8 services in backend/src/common/services), wallet.service.ts:272 SELECT FOR UPDATE pattern is real and well-mirrored in 09-06, Phase 8 mobile primitives (PressableScale, CategoryStrip, Chip, NightlyBookingSheet) all exist. 09-06 is genuinely the highest-risk plan and the spec coverage (6 wallet-invariant scenarios + idempotency + ATTRACTION fallback + rollback) is appropriate. Three concerns prevent unqualified PASS: (1) SC5 Save-as-bookable CTA has no owning plan despite being LOCKED in CONTEXT decisions; (2) CONTEXT misidentifies marketplace.handleOrderPayment as the multi-vendor split analog; (3) certifications + rating photos are stub URL inputs rather than file uploads. All three are PASS_WITH_NOTES rather than blockers.

## Goal Coverage

| SC | Plans | Verdict |
|---|---|---|
| SC1 - TOUR_GUIDE role + KYC + approval + availability | 09-01, 09-03 | PARTIAL - certifications are S3 URLs the caller uploaded elsewhere; no upload endpoint built |
| SC2 - TourPackage CRUD + settlement-split <= 100 | 09-01, 09-04 | PASS - DB CHECK via jsonb_array_elements + service guard |
| SC3 - Search by category + date constraint | 09-04, 09-05, 09-09, 09-11 | PASS |
| SC4 - Atomic multi-vendor split + rollback + refund | 09-02, 09-06 | PASS - ONE prisma.transaction with SELECT FOR UPDATE per wallet |
| SC5 - 3-channel itinerary + AI Save-as-bookable CTA | 09-05, 09-07, 09-11 | PARTIAL - Save-as-bookable CTA LOCKED in CONTEXT has no owning plan |
| SC6 - Groups 10-50 + bulk discount + split-bill | 09-01, 09-05, 09-06 | PASS |
| SC7 - Post-tour rating + auto-flag + admin queue | 09-01, 09-08 | PARTIAL - rating photos are URL-input stub on mobile |
| SC8 - Admin queues + revenue + utilization | 09-03, 09-04, 09-08, 09-10 | PASS |
| SC9 - Mobile Tours sub-section + detail + trips + rating | 09-11 | PASS |
| SC10 - 282+ tests pass + wallet-invariant + KYC encryption | 09-12 | PASS |

## Wave Parallelism

- Wave 1 (09-01 + 09-02): disjoint - prisma vs common/services. OK.
- Wave 2 (09-03 + 09-04): both append to backend/src/app.module.ts. Soft conflict - mergeable additive single-line appends but orchestrator should serialize. Recurs in 09-05, 09-08.
- Wave 3 (09-05): single plan.
- Wave 4 (09-06): single plan. Edits tour-bookings.module.ts and webhooks.service.ts.
- Wave 5 (09-07 + 09-08): no overlap. 09-07 -> tour-bookings + common.module.ts; 09-08 -> reviews + app.module.ts.
- Wave 6 (09-09 + 09-10): no overlap. 09-09 -> web/tours; 09-10 -> web/admin + adds NEW backend tour-admin files + edits tour-bookings.module.ts (W5 09-07 already landed).
- Wave 7 (09-11): single plan, mobile-only.
- Wave 8 (09-12 + 09-13): 09-12 adds test files only; 09-13 is checkpoint:human-verify with no file edits.

## Constraint Compliance

| Constraint | Plan | Status |
|---|---|---|
| Enum migration is additive (ALTER TYPE ADD VALUE) | 09-01 Task 2 | OK |
| BookingStatus reused (no parallel TourBookingStatus) | 09-01 | OK - verify guard fails if TourBookingStatus appears |
| Reference format ISY-TOUR-12char | 09-02 + 09-05 | OK - spec regex matches |
| Atomic transaction: lock -> credits -> commission -> status | 09-06 Task 2 Step 6 | OK - single prisma.transaction with SELECT FOR UPDATE per wallet; status update inside the same callback for solo path |
| Idempotency keyed on Paystack reference | 09-06 Step 2 + 09-12 Test 4 | OK - pre-check transaction.findFirst with reference startsWith; e2e replay test |
| Government wallet fallback for ATTRACTION | 09-01 seed + 09-04 service skip + 09-06 fallback | OK - seed value null with requires_operator_setup metadata; 09-06 rolls into platform commission with logger.warn |
| Rating recompute cluster safety | 09-08 (5s in-memory Map) | WARN - flagged as not-cluster-safe in plan output; only documented in SUMMARY template, not CONTEXT/ROADMAP |
| No backend file in web/mobile plan | 09-09, 09-11, 09-10 | OK - 09-11 no backend; 09-09 no backend; 09-10 admin GET endpoints stay in tour-bookings module |
| Mobile token discipline | 09-11 verify greps for inline hex returning 0 | OK |
| Web token discipline | 09-09 verify greps for inline hex returning 0 | OK |

## Scope Boundary

No scope creep on deferred items: Flights, multi-currency, >50 groups, earnings dashboard, package versioning (snapshot is lightweight v1), AI recommendation, guide messaging, polymorphic reviews refactor - all absent or correctly excluded.

Two scope reductions vs ROADMAP SC text (logged as M2): certifications file upload reduced to URL input; rating photos reduced to URL input stub on mobile.

## Issues Found

### HIGH (blocks execution)

None.

### MEDIUM (should fix before execute)

M1. [requirement_coverage] SC5 Save-as-bookable CTA has no owning task.
- Plans: none touch the AI screen; no backend endpoint exists for AI-to-DRAFT conversion.
- CONTEXT decisions Itinerary model LOCKS this as the bridge between AI free-text and structured TourPackage drafts. ROADMAP SC5 explicitly calls it out.
- Fix options: (a) add task to 09-09 + backend endpoint POST /api/v1/tour-packages/from-ai accepting AI conversation messageId; (b) move to CONTEXT deferred + unlock the decision + record in 09-VERIFICATION.md.

M2. [scope_reduction] SC1 certifications and SC7 rating photos are URL inputs, not file uploads.
- 09-03 CreateTourGuideDto declares certifications IsUrl with caller-uploaded-first comment; no upload UI built.
- 09-11 RatingModal: optional photos file picker stub for v1 - just URL inputs.
- ROADMAP SC1 says certifications (file upload). ROADMAP SC7 says rate the guide (1-5 stars + photo + text).
- Fix: add presigned-URL endpoint (small infra primitive - add as 4th task on 09-02) + simple picker UI OR explicitly defer with operator acknowledgement in 09-VERIFICATION.md.

M3. [context_compliance] CONTEXT misidentifies the marketplace settlement analog.
- 09-06 inherits this from CONTEXT decisions Multi-vendor commission split.
- CONTEXT claims marketplace.handleOrderPayment is the analog. Codebase reality (marketplace.service.ts:253-281): handleOrderPayment only updates order.status to PROCESSING and decrements stock - NO transaction, NO SELECT FOR UPDATE, NO multi-vendor split (marketplace is single-vendor).
- 09-06 code template is fine because it correctly imitates wallet.service.ts:272.
- Fix: 09-06 Task 2 action text and CONTEXT both should explicitly say wallet.service.ts:272 (sender-recipient SELECT FOR UPDATE transfer) is the analog; marketplace.handleOrderPayment is NOT.

M4. [scope_sanity] Several plans have very dense Task 2 content within the 3-task ceiling.
- 09-01 Task 2 migration.sql is large with multi-step FK ordering.
- 09-04 Task 2 (TourPackageService) is 9 public + 1 internal method with 8 validation guards (~400 lines of action prose).
- 09-06 Task 2 is ~250 lines of code template (complexity is irreducible - algorithm must be atomic).
- 09-09 Task 3 builds two pages including a 5-step multi-step form.
- Borderline - not blockers. Advisory: if any SUMMARY notes had-to-iterate, split for Phase 10 hindsight.

M5. [scope_sanity] Multiple plans in different waves all append to backend/src/app.module.ts.
- 09-03 + 09-04 (W2 parallel) both append a module to the imports array.
- 09-08 (W5) appends ReviewsModule.
- Risk: parallel executors of 09-03 and 09-04 will produce merge conflicts on app.module.ts.
- Fix: orchestrator should serialize the app.module.ts edit step within W2 OR use merge-tolerant append. Orchestrator concern, not plan defect.

M6. [context_compliance] Rating recompute cluster-safety trade-off not yet documented in CONTEXT or ROADMAP.
- 09-08 picked OnEvent + 5s in-memory Map Discretion option - valid pick but Railway horizontal scale introduces correctness hazard (two backend instances will each recompute independently and clobber each other).
- Documentation lives only in 09-08 SUMMARY template (post-execute).
- Fix: add one-line entry to CONTEXT deferred (Redis-backed debounce for rating recompute) OR add follow-up ticket reference in 09-08 frontmatter.

### LOW (nice-to-have)

L1. 09-07 Step 3 (PDF library decision) requires inspecting backend/package.json mid-execution. A 2-minute pre-check now would let 09-07 frontmatter state pdfkit deterministically.

L2. 09-06 must_haves.truths includes wallet invariant asserted by spec, but Task 3 spec is mock-based. The real invariant proof lives in 09-12 wallet-invariant.e2e-spec.ts - should explicitly cross-reference 09-12 as the regression anchor.

L3. 09-11 task 2 slug-vs-id filename quirk is documented in prose but not in a verify command. A quick grep verify would catch a wrong-handed implementer.

L4. 09-12 e2e harness sets testTimeout 30000. Tight for an 11-step happy-path e2e. Recommend 60000.

L5. 09-07 PDF size impact not budgeted. pdfkit is ~3MB on node:20-alpine. No image-size budget in CLAUDE.md so informational only.

## Recommended Action

COMMIT_AND_PROCEED with the following operator decisions made BEFORE Wave 1 executes:

1. Decide on M1 (Save-as-bookable CTA): ship in Phase 9 OR defer. Recommend defer - bridge feature, not central to tourists-can-book. Update CONTEXT deferred and remove LOCK from CONTEXT decisions Itinerary model.

2. Decide on M2 (file uploads): ship presigned-URL endpoint (one shared infra primitive on 09-02 4th task, reused for certifications + rating photos + cover images) OR defer. Recommend ship - minimum to PASS SC1 + SC7 literally.

3. Fix M3 inline in 09-06 Task 2 prose: replace marketplace.handleOrderPayment reference with wallet.service.ts:272 (sender-recipient SELECT FOR UPDATE transfer) is the analog; marketplace.handleOrderPayment is NOT (single-vendor, status-only). Two-line edit.

4. Acknowledge M5 (orchestrator serialization): confirm the executor handles parallel app.module.ts edits via sequential ordering within wave OR additive merge.

5. Optional: add Redis-backed rating debounce to CONTEXT deferred (M6) and tighten 09-12 e2e timeout to 60s (L4).

All other findings are LOW or already mitigated by spec coverage. The architecturally hard plan (09-06) is well-specified and the regression protection in 09-12 is appropriate for TOUR-10 wallet invariant requirement.

Counts: 0 BLOCKER, 6 MEDIUM, 5 LOW

---

## Revision Pass — M1 + M2 addressed

Date: 2026-06-23
Operator decision: SHIP both M1 (Save-as-bookable CTA) and M2 (presigned URL endpoint). M3-M6 deferred per operator (M3/M4/M6 are advisory/documentation; M5 is an orchestrator-time concern handled at execute time).

### M2 — Presigned URL upload primitive (SHIPPED into 09-02 + 09-03 + 09-08)

**09-02 (Common infra) — Added Task 3: UploadService + UploadController + DTO + spec.**
- New files: `backend/src/common/services/upload.service.ts`, `backend/src/common/controllers/upload.controller.ts` (new `controllers/` dir), `backend/src/common/dto/create-presigned-upload.dto.ts`, `backend/src/common/services/__tests__/upload.service.spec.ts`.
- S3Service patched with 4 public read-only accessors (`getMode/getBucket/getClient/getCdnBase`) — UploadService signs URLs against the same S3Client + bucket the existing `upload()` method uses. R2 + AWS modes both supported with no branching (S3-compatible API).
- New dependency: `@aws-sdk/s3-request-presigner@^3.1045.0` (Task 3 Step 0 npm install). Sibling of installed `@aws-sdk/client-s3` 3.1045.x.
- Endpoint: `POST /api/v1/uploads/presigned` (JwtAuthGuard, any auth user). Body: `{ keyPrefix: 'tour-certifications' | 'review-photos' | 'tour-covers' | 'avatars' | 'misc', contentType: 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf', maxBytes? <= 25MB }`. Returns: `{ uploadUrl, key, publicUrl, expiresIn: 900, maxBytes }`.
- Security: keyPrefix is an enum (no path traversal). `key = ${prefix}/${userId}/${uuid}.${ext}` — userId from JWT, NEVER from body. 4-contentType allowlist enforced by `@IsIn` + service-layer defense. 5MB default, 25MB hard cap, 15-min expiry. Spec covers 7 scenarios (happy + bad contentType + over-cap + unconfigured S3 + AWS/R2 URL formats).
- CommonModule (@Global) now declares `controllers: [UploadController]` + adds UploadService to providers + exports — endpoint auto-routes via existing CommonModule import in AppModule.

**09-03 (TourGuide module) — certifications now consume the presigned flow.**
- `CreateTourGuideDto.certifications` comment + `must_haves.truths` updated: client POSTs `/uploads/presigned` with `keyPrefix='tour-certifications'`, PUTs file to uploadUrl, sends publicUrl back to `POST /tour-guides`. `@IsUrl({}, { each: true })` validates each entry. NO multipart on this endpoint.
- Added spec scenario #3 — accepts S3/R2 publicUrls verbatim. Renumbered downstream tests to 10 total.
- New key_link added (client cert-upload flow → 09-02 UploadController). Verification adds an end-to-end smoke (presigned → PUT → POST /tour-guides with publicUrl).

**09-08 (Reviews module) — review photos now consume the presigned flow.**
- `CreateReviewDto.photos` already used `@IsUrl` per entry — comment + must_haves now make the upstream contract explicit (`keyPrefix='review-photos'`, max 5 photos per `@ArrayMaxSize(5)`).
- Added spec scenario #2 — happy path with 3 publicUrls persisted verbatim. Renumbered to 14 total.
- New key_link added (client photo-upload flow → 09-02 UploadController). Verification adds an end-to-end smoke.

### M1 — Save-as-bookable CTA (SHIPPED into 09-04 backend + 09-09 web)

**09-04 (TourPackage module) — new endpoint `POST /tour-packages/from-ai-suggestion`.**
- New file: `backend/src/modules/tour-packages/dto/create-from-ai-suggestion.dto.ts` (length-bounded title 3-120, description 10-5000, suggestedItinerary 10-10000, optional aiConversationId UUID).
- Added Task 1: include the new DTO. Task 2 (TourPackageService): added `createFromAiSuggestion(actorUserId, dto)` method — bypasses the 8 standard-create guards (no guide/attraction/split to validate yet). Creates a row with `status='DRAFT'`, `tourGuideId=null`, `lgaId=null`, `settlementSplit=[]`, `attractionIds=[]`, `price=0`, `durationHours=1`, `maxGroupSize=1`, `category='CULTURAL'` defaults, `itineraryTemplate=[{ hour: 0, title: 'AI suggestion', description: <verbatim> }]`, `metadata={ source: 'ai-suggestion', aiSourceConversationId, aiSourceUserId, createdAt }`, slug includes `-ai-` segment.
- Public-list filter (`findAll`) already enforces `status: 'APPROVED'`, so AI-seeded DRAFTs are NOT searchable until claimed + approved. Spec scenario #11 now asserts the filter; new spec scenario #12 covers the happy-path createFromAiSuggestion.
- `findOwn(userId)` updated to include AI-seeded DRAFTs the user owns (via `metadata.aiSourceUserId` JSON path filter) so the user sees their saved drafts under `GET /tour-packages/me`.
- **Schema dependency on 09-01:** TourPackage.tourGuideId + lgaId MUST be `String?` (nullable) for the AI DRAFT shape to land. Plan calls this out and instructs the 09-04 executor to coordinate / patch 09-01's migration if it specified non-null. Future `POST /tour-packages/:id/claim` (out of scope) lets an APPROVED guide adopt the DRAFT.
- Controller adds `POST /tour-packages/from-ai-suggestion` (JwtAuthGuard, NOT TOUR_GUIDE-restricted — tourists can save).

**09-09 (Web pages) — new Task 4: /ai chat page + SaveAsBookableButton + SaveAsBookableModal.**
- Confirmed via Glob: NO existing AI/concierge/chat page in `web/src/app/`. This plan ships a minimal `/ai` route as a thin client over the existing backend AI module (CLAUDE.md §AiModule). The new page exists primarily to host the Save-as-bookable CTA on a working chat surface.
- New files: `web/src/app/ai/page.tsx`, `web/src/components/ai/SaveAsBookableButton.tsx`, `web/src/components/ai/SaveAsBookableModal.tsx`.
- SaveAsBookableButton: per-assistant-turn inline CTA, BookmarkPlus icon + "Save as bookable tour" label, `min-h-[44px]` touch target.
- SaveAsBookableModal: react-hook-form form with title (3-120, prefilled from first non-empty line truncated 80 chars), description (10-5000, prefilled from first 240 chars), suggestedItinerary (10-10000, prefilled with full verbatim text). On submit: `POST /tour-packages/from-ai-suggestion` with `{ title, description, suggestedItinerary, aiConversationId }`. Toast "Saved to drafts" + action link to `/host/tours/me` (fallback `/host` if not yet shipped). Submit button `min-h-[44px]`. No inline hex.
- Auth handling: 401 → redirect to `/login?returnTo=/ai`.
- Added 4 entries to must_haves.artifacts (page + 2 ai components) + 1 key_link + ai chat truth.

### Files touched in this revision pass (5)

- `.planning/phases/09-tour-packages-tour-guides/09-02-PLAN.md` — added UploadService/Controller/DTO + spec (Task 3) + S3Service accessor patch + CommonModule controller registration (Task 4 renumbered). New dependency `@aws-sdk/s3-request-presigner`.
- `.planning/phases/09-tour-packages-tour-guides/09-03-PLAN.md` — certifications comment + must_have truth + spec scenario #3 + key_link added; @IsUrl validation enforced.
- `.planning/phases/09-tour-packages-tour-guides/09-04-PLAN.md` — new CreateFromAiSuggestionDto + createFromAiSuggestion service method + controller route + spec scenarios #11 (filter) + #12 (happy path). Schema-nullability dependency on 09-01 documented.
- `.planning/phases/09-tour-packages-tour-guides/09-08-PLAN.md` — photos contract + must_have truth + spec scenario #2 + key_link added; @IsUrl + @ArrayMaxSize(5) reaffirmed; `depends_on` now [09-01, 09-02, 09-05, 09-06].
- `.planning/phases/09-tour-packages-tour-guides/09-09-PLAN.md` — Task 4 added (/ai page + SaveAsBookableButton + SaveAsBookableModal) + 3 new artifacts + 1 new key_link + new truth. `files_modified` extended.

### Not addressed in this revision

- **M3** (CONTEXT misidentifies marketplace.handleOrderPayment as multi-vendor split analog) — deferred. 09-06's actual code template already mirrors wallet.service.ts:272 correctly; only the prose in CONTEXT is misleading. Will be addressed at next CONTEXT revision pass or post-execute retro.
- **M4** (dense Task 2 content) — advisory only; not a blocker. Carry into Phase 10 hindsight.
- **M5** (parallel app.module.ts edits) — orchestrator-time concern. Will be handled at execute time via wave serialization.
- **M6** (rating recompute cluster safety) — flagged in 09-08 SUMMARY template (post-execute); no CONTEXT update.
- **L1-L5** — low priority; deferred.

### Wave structure unchanged

Still 13 plans across 8 waves. 09-08 adds a new dep on 09-02 (already in Wave 1) — does not move waves. 09-09 still in Wave 6 with new files in `web/src/app/ai/` + `web/src/components/ai/` (no overlap with 09-10 which touches `web/src/app/admin/`).
