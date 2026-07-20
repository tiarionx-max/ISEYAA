// 21-05: extracted to a zero-import leaf file to break a require cycle between
// reviews-client.module.ts and reviews-client.service.ts, matching the D-09 rationale used
// for NOTIFICATIONS_PACKAGE/NEWS_PACKAGE/WAITLIST_PACKAGE. Do not move this declaration into
// .module.ts or .service.ts — that would recreate the cycle one level removed.
export const REVIEWS_PACKAGE = 'REVIEWS_PACKAGE';
