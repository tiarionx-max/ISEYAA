// 20-03 (D-09 folded scope): extracted from notifications-client.module.ts to break the
// module.ts <-> service.ts require cycle (module.ts imported NotificationsClientService for
// its providers array; service.ts imported this token back from module.ts). This file must
// stay a pure leaf with zero imports from anywhere in notifications-client/ — importing from
// .module.ts or .service.ts here would just recreate the cycle one level removed.
export const NOTIFICATIONS_PACKAGE = 'NOTIFICATIONS_PACKAGE';
