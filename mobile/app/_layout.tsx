import * as Sentry from '@sentry/react-native';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
import { registerForPushNotifications } from '../lib/push-notifications';

Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN || '',
  tracesSampleRate: 0.1,
  environment: __DEV__ ? 'development' : 'production',
  enabled: !__DEV__,
});

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 60_000, retry: 1 } },
  }));

  useEffect(() => {
    SecureStore.getItemAsync('access_token').then((token) => {
      if (!token) {
        router.replace('/onboarding' as any);
        return;
      }
      registerForPushNotifications();
    });
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: '#050E0E' },
            headerTintColor: '#D4A843',
            headerTitleStyle: { fontWeight: '700', fontSize: 16 },
            contentStyle: { backgroundColor: '#050E0E' },
            headerShadowVisible: false,
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="qr-checkin" options={{ title: 'QR Check-in', presentation: 'modal' }} />
          <Stack.Screen name="ai-chat" options={{ title: 'AI Concierge', presentation: 'card' }} />
          <Stack.Screen name="kyc" options={{ title: 'Identity Verification', presentation: 'card' }} />
          <Stack.Screen name="profile-edit" options={{ title: 'Edit Profile', presentation: 'card' }} />
          <Stack.Screen name="change-password" options={{ title: 'Change Password', presentation: 'card' }} />
          <Stack.Screen name="driver-application" options={{ title: 'Become a Driver', presentation: 'card' }} />
          <Stack.Screen name="otp-channel-settings" options={{ headerShown: false, presentation: 'card' }} />
          <Stack.Screen name="events/[id]" options={{ title: 'Event' }} />
          <Stack.Screen name="organiser-dashboard" options={{ title: 'My Events', presentation: 'card' }} />
          <Stack.Screen name="event-create" options={{ title: 'Create Event', presentation: 'card' }} />
          <Stack.Screen name="event-edit/[id]" options={{ title: 'Edit Event', presentation: 'card' }} />
          <Stack.Screen name="event-analytics/[id]" options={{ title: 'Event Analytics', presentation: 'card' }} />
          <Stack.Screen name="stays/[id]" options={{ title: 'Property' }} />
          <Stack.Screen name="tours/[id]" options={{ title: 'Tour' }} />
          <Stack.Screen name="trips/index" options={{ title: 'My trips', presentation: 'card' }} />
          <Stack.Screen name="tours/rate/[bookingId]" options={{ headerShown: false, presentation: 'transparentModal', animation: 'fade' }} />
          <Stack.Screen name="marketplace/[id]" options={{ title: 'Product' }} />
          <Stack.Screen name="cart" options={{ headerShown: false, presentation: 'transparentModal', animation: 'none' }} />
          <Stack.Screen name="checkout" options={{ title: 'Checkout', presentation: 'card' }} />
          <Stack.Screen name="host" options={{ headerShown: false, presentation: 'card' }} />
          <Stack.Screen name="host-dashboard" options={{ title: 'My Properties', presentation: 'card' }} />
          <Stack.Screen name="property-create" options={{ title: 'Add Listing', presentation: 'card' }} />
          <Stack.Screen name="property-edit/[id]" options={{ title: 'Edit Listing', presentation: 'card' }} />
          <Stack.Screen name="property-bookings/[id]" options={{ title: 'Bookings', presentation: 'card' }} />
          <Stack.Screen name="vendor" options={{ headerShown: false, presentation: 'card' }} />
          <Stack.Screen name="vendor-dashboard" options={{ title: 'My Products', presentation: 'card' }} />
          <Stack.Screen name="product-create" options={{ title: 'Add Product', presentation: 'card' }} />
          <Stack.Screen name="product-edit/[id]" options={{ title: 'Edit Product', presentation: 'card' }} />
          <Stack.Screen name="vendor-orders" options={{ title: 'Orders', presentation: 'card' }} />
          <Stack.Screen name="transport-flow" options={{ headerShown: false, presentation: 'fullScreenModal' }} />
          <Stack.Screen name="delivery-flow" options={{ headerShown: false, presentation: 'fullScreenModal' }} />
          <Stack.Screen name="driver-dashboard" options={{ headerShown: false, presentation: 'fullScreenModal' }} />
          <Stack.Screen name="rider-dashboard" options={{ headerShown: false, presentation: 'fullScreenModal' }} />
          <Stack.Screen name="onboarding" options={{ headerShown: false }} />
          <Stack.Screen name="auth/phone" options={{ headerShown: false }} />
          <Stack.Screen name="auth/otp" options={{ headerShown: false }} />
          <Stack.Screen name="auth/email" options={{ headerShown: false }} />
          <Stack.Screen name="auth/register" options={{ headerShown: false }} />
          <Stack.Screen name="auth/forgot-password" options={{ headerShown: false }} />
          <Stack.Screen name="auth/reset-password" options={{ headerShown: false }} />
          <Stack.Screen name="search" options={{ headerShown: false, presentation: 'fullScreenModal' }} />
          <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
          <Stack.Screen name="topup" options={{ headerShown: false, presentation: 'modal' }} />
          <Stack.Screen name="send" options={{ headerShown: false }} />
          <Stack.Screen name="orders" options={{ headerShown: false }} />
          <Stack.Screen name="saved-places" options={{ headerShown: false }} />
          <Stack.Screen name="ministry-dashboard" options={{ title: 'Ministry Dashboard', presentation: 'card' }} />
        </Stack>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
