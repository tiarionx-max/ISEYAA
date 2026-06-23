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
