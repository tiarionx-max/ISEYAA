import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { router } from 'expo-router';

export const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

// The localhost default is only ever correct in local dev. In a production build a
// missing EXPO_PUBLIC_API_URL means every request silently points at a dev machine
// that isn't there — surface it loudly instead of failing invisibly on-device.
if (!process.env.EXPO_PUBLIC_API_URL && !__DEV__) {
  console.warn(
    '[api] EXPO_PUBLIC_API_URL is not set in a non-dev build — falling back to ' +
      'http://localhost:3001/api/v1, which will not reach the backend from a device.',
  );
}

export const api = axios.create({ baseURL: API_BASE, timeout: 15_000 });

api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Access tokens are 15 minutes (backend/src/modules/auth/auth.service.ts). With no
// refresh handling, every screen silently went blank ~15 minutes into a session —
// each request 401'd, react-query swallowed it, and nothing ever told the user they'd
// been logged out. `refreshPromise` de-dupes concurrent 401s into a single in-flight
// refresh call: the backend blacklists the old refresh token on every rotation, so
// firing one refresh per failed request would race and revoke each other.
let refreshPromise: Promise<string | null> | null = null;

export async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = await SecureStore.getItemAsync('refresh_token');
  if (!refreshToken) return null;

  try {
    const { data } = await axios.post(`${API_BASE}/auth/refresh`, { refreshToken });
    await SecureStore.setItemAsync('access_token', data.accessToken);
    await SecureStore.setItemAsync('refresh_token', data.refreshToken);
    return data.accessToken;
  } catch {
    return null;
  }
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { config, response } = error;
    if (response?.status !== 401 || config?._retried) {
      throw error;
    }
    config._retried = true;

    if (!refreshPromise) {
      refreshPromise = refreshAccessToken().finally(() => {
        refreshPromise = null;
      });
    }
    const newAccessToken = await refreshPromise;

    if (!newAccessToken) {
      // Refresh token itself is invalid/expired/revoked — there is no way back in
      // without a fresh login. Clear stale tokens and bounce to the entry screen
      // rather than leaving every screen silently blank.
      await SecureStore.deleteItemAsync('access_token');
      await SecureStore.deleteItemAsync('refresh_token');
      router.replace('/onboarding' as any);
      throw error;
    }

    config.headers.Authorization = `Bearer ${newAccessToken}`;
    return api.request(config);
  },
);

export const fetcher = (url: string) => api.get(url).then((r) => r.data);

// NestJS's ValidationPipe returns `message` as a string[] on 400s (one entry per
// failed field), never a single string — passing that array straight into
// Alert.alert(title, message) crashes the native bridge outright
// (UnexpectedNativeTypeException: "cannot be cast from ReadableNativeArray to
// String") instead of just showing a bad error. Always route API error messages
// through this before handing them to Alert.alert/Toast/etc.
export function getErrorMessage(err: any, fallback: string): string {
  const message = err?.response?.data?.message;
  if (Array.isArray(message)) return message.join('\n');
  if (typeof message === 'string' && message.length > 0) return message;
  return fallback;
}
