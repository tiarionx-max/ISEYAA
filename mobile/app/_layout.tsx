import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

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
            headerStyle: { backgroundColor: '#0A1515' },
            headerTintColor: '#E0AA42',
            headerTitleStyle: { fontWeight: '700', fontSize: 16 },
            contentStyle: { backgroundColor: '#0D1B1B' },
            headerShadowVisible: false,
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="qr-checkin" options={{ title: 'QR Check-in', presentation: 'modal' }} />
          <Stack.Screen name="events/[id]" options={{ title: 'Event' }} />
          <Stack.Screen name="stays/[id]" options={{ title: 'Property' }} />
        </Stack>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
