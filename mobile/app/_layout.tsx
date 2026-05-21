import * as Sentry from '@sentry/react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

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
          <Stack.Screen name="events/[id]" options={{ title: 'Event' }} />
          <Stack.Screen name="stays/[id]" options={{ title: 'Property' }} />
          <Stack.Screen name="transport-flow" options={{ headerShown: false, presentation: 'fullScreenModal' }} />
          <Stack.Screen name="delivery-flow" options={{ headerShown: false, presentation: 'fullScreenModal' }} />
          <Stack.Screen name="driver-dashboard" options={{ headerShown: false, presentation: 'fullScreenModal' }} />
          <Stack.Screen name="rider-dashboard" options={{ headerShown: false, presentation: 'fullScreenModal' }} />
        </Stack>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
