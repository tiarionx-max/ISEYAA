/**
 * Purpose-of-visit taxonomy (D-05) — single source of truth.
 *
 * Consumed by:
 * - Plan 14-04/14-05's DTOs for `@IsIn(VISITOR_PURPOSE_VALUES)` validation on the
 *   optional `purpose` field at all three booking-flow write sites.
 * - Plan 14-04/14-05's write sites for `DEFAULT_VISITOR_PURPOSE` per-source-type
 *   fallback when the citizen leaves `purpose` unset at checkout (D-06).
 *
 * Never hardcode these strings elsewhere (query logic, report code) — import from
 * here so the Ministry can request renamed/extended categories without touching
 * write-site or query code.
 */
export const VISITOR_PURPOSE_VALUES = [
  'Tourism/Leisure',
  'Business',
  'Religious/Pilgrimage',
  'Family/Personal',
  'Event Attendance',
  'Education',
  'Other',
] as const;

export type VisitorPurpose = (typeof VISITOR_PURPOSE_VALUES)[number];

/** Per-source-type default purpose (D-06) — applied when the citizen leaves `purpose` unset at checkout. */
export const DEFAULT_VISITOR_PURPOSE: Record<'EVENT' | 'STAY' | 'TOUR', VisitorPurpose> = {
  EVENT: 'Event Attendance',
  STAY: 'Tourism/Leisure',
  TOUR: 'Tourism/Leisure',
};
