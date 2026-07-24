import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { api } from './api';

// Foreground notifications still show a banner/sound instead of being silently
// swallowed (expo-notifications' default handler suppresses them while the app
// is open). Wrapped in try/catch: this runs at module-import time, and on a
// dev-client build predating this native module, throwing here would break
// the entire app's root layout before it even renders (every screen fails
// with "No QueryClient set" since the providers above it never mount).
try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
} catch {
  // See comment above.
}

/**
 * Requests notification permission and registers the device's native push
 * token (FCM registration token on Android, APNs token on iOS) with the
 * backend. Call once per authenticated session — safe to call repeatedly,
 * each call just re-registers the same token.
 *
 * Uses getDevicePushTokenAsync(), NOT getExpoPushTokenAsync(): the backend
 * (NotificationsService) calls the FCM v1 API directly with this raw token,
 * it does not proxy through Expo's own push notification service.
 */
export async function registerForPushNotifications(): Promise<void> {
  // Every call below can throw — missing Google Play Services, a dev build
  // that hasn't been rebuilt since this native module was added, airplane
  // mode, etc. Push is best-effort and must never block app startup.
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let status = existingStatus;
    if (status !== 'granted') {
      const { status: requestedStatus } = await Notifications.requestPermissionsAsync();
      status = requestedStatus;
    }
    if (status !== 'granted') return;

    const { data: token } = await Notifications.getDevicePushTokenAsync();
    await api.post('/notifications/register-token', { token });
  } catch {
    // See comment above — silently give up, push notifications just won't work.
  }
}
