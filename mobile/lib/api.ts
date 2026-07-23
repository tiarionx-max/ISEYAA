import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

export const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

export const api = axios.create({ baseURL: API_BASE, timeout: 15_000 });

api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

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
