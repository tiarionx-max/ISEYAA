// 21-02: extracted to a zero-import leaf file to break a require cycle between
// news-client.module.ts and news-client.service.ts, matching the D-09 rationale used for
// NOTIFICATIONS_PACKAGE in notifications-client.constants.ts. Do not move this declaration
// into .module.ts or .service.ts — that would recreate the cycle one level removed.
export const NEWS_PACKAGE = 'NEWS_PACKAGE';
