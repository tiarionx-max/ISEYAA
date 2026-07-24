import axios from 'axios';
import { getSession, signOut } from 'next-auth/react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

export const api = axios.create({ baseURL: API_URL });

api.interceptors.request.use(async (config) => {
  const session = await getSession();
  // The jwt callback in auth.ts refreshes the backend accessToken automatically;
  // if that refresh itself failed (e.g. refresh token revoked/expired), bounce to
  // login instead of sending a request with a stale token that will just 401.
  if ((session as any)?.error === 'RefreshAccessTokenError') {
    await signOut({ callbackUrl: '/login' });
    throw new axios.Cancel('Session expired');
  }
  if ((session as any)?.accessToken) {
    config.headers.Authorization = `Bearer ${(session as any).accessToken}`;
  }
  return config;
});

export const fetcher = (url: string) => api.get(url).then((r) => r.data);
