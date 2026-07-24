import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

// Backend access tokens are 15 minutes (backend/src/modules/auth/auth.service.ts).
// The NextAuth session cookie lasts 7 days, but without this refresh the embedded
// backend accessToken silently goes stale after 15 minutes — every API call then
// 401s, and since api.ts has no response interceptor, TanStack Query just falls
// back to empty/zero values with no indication the user needs to re-authenticate.
async function refreshAccessToken(token: any) {
  try {
    const { data } = await axios.post(`${API_URL}/auth/refresh`, {
      refreshToken: token.refreshToken,
    });
    return {
      ...token,
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      accessTokenExpires: Date.now() + 15 * 60 * 1000,
      error: undefined,
    };
  } catch {
    return { ...token, error: 'RefreshAccessTokenError' };
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        phone: { label: 'Phone', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        try {
          const { data } = await axios.post(`${API_URL}/auth/login`, {
            identifier: credentials?.email || credentials?.phone,
            password: credentials?.password,
          });
          if (data?.accessToken) {
            return {
              id: data.user.id,
              email: data.user.email,
              name: `${data.user.firstName} ${data.user.lastName}`,
              role: data.user.role,
              accessToken: data.accessToken,
              refreshToken: data.refreshToken,
            };
          }
          return null;
        } catch {
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.accessToken = (user as any).accessToken;
        token.refreshToken = (user as any).refreshToken;
        token.accessTokenExpires = Date.now() + 15 * 60 * 1000;
        token.role = (user as any).role;
        token.id = user.id;
        return token;
      }

      if (Date.now() < ((token as any).accessTokenExpires ?? 0)) {
        return token;
      }

      return refreshAccessToken(token);
    },
    async session({ session, token }) {
      (session as any).accessToken = token.accessToken;
      (session as any).error = (token as any).error;
      (session as any).user.role = token.role;
      (session as any).user.id = token.id;
      return session;
    },
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  session: { strategy: 'jwt', maxAge: 7 * 24 * 60 * 60 },
  secret: process.env.NEXTAUTH_SECRET ?? 'iseyaa-dev-secret',
};
