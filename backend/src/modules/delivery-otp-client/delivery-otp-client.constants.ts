// 21-07 (mirrors 20-03's D-09 fix for notifications-client.constants.ts): extracted to a
// pure leaf file with zero imports to break a potential require cycle between
// delivery-otp-client.module.ts (which imports DeliveryOtpClientService for its providers
// array) and delivery-otp-client.service.ts (which needs this token). Do not move this
// declaration into .module.ts or .service.ts.
export const DELIVERY_OTP_PACKAGE = 'DELIVERY_OTP_PACKAGE';
