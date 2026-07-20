// 21-03: extracted to a zero-import leaf file to break a require cycle between
// waitlist-client.module.ts and waitlist-client.service.ts, matching the D-09 rationale used
// for NOTIFICATIONS_PACKAGE/NEWS_PACKAGE. Do not move this declaration into .module.ts or
// .service.ts — that would recreate the cycle one level removed.
export const WAITLIST_PACKAGE = 'WAITLIST_PACKAGE';
