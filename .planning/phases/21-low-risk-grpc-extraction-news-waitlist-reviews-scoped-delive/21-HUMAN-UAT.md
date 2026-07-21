---
status: partial
phase: 21-low-risk-grpc-extraction-news-waitlist-reviews-scoped-delive
source: [21-VERIFICATION.md]
started: 2026-07-21T01:04:15Z
updated: 2026-07-21T01:04:15Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. D-08 sizing gate verdicts (21-03 Task 3, 21-05 Task 4)
expected: SUMMARY.md files record a narrative "PASS" verdict but include no actual query output (row counts, source breakdown) — only a claim that "the human operator reviewed real staging/production row counts." A human with real DB access should independently re-run the specified SQL queries and confirm the recorded PASS verdicts are accurate (real production/staging WaitlistEntry-per-source and Review-per-target row counts pose no P95/truncation risk) before flipping `grpc.waitlist_service.canary_enabled` / `grpc.reviews_service.canary_enabled`.
result: [pending]

### 2. Live end-to-end smoke test of the CR-01/CR-02 exception-mapping fix
expected: Manually exercise `POST /api/v1/reviews` with a booking a user doesn't own (or a duplicate review) and `POST /api/v1/waitlist` with neither email nor phone, against a running instance with the reviews/waitlist canary flags enabled. Per plan 21-08's code fix and this verifier's independent unit-level round-trip tests, both should now return the correct business-rule HTTP status (403/409/400 respectively) with the original message preserved — not a generic 503. A live end-to-end run removes residual doubt about NestJS's runtime `@GrpcMethod`/`RpcException` behavior in the exact deployed configuration, since verification to date is source review + unit tests with a mocked gRPC transport boundary, not a live gRPC round-trip.
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
