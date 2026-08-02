/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.cloudfront.net' },
      { protocol: 'https', hostname: '*.amazonaws.com' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'iseyaa.ng' },
      { protocol: 'http',  hostname: 'localhost' },
    ],
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1',
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? 'https://iseyaa.ng',
  },
  async headers() {
    // Allow the configured API origin (which may not be the Railway host) plus
    // localhost for dev, so a non-Railway backend isn't blocked by connect-src.
    const apiUrl = process.env.NEXT_PUBLIC_API_URL;
    let apiOrigin = '';
    try {
      if (apiUrl) apiOrigin = new URL(apiUrl).origin;
    } catch {
      apiOrigin = '';
    }
    const connectSrc = [
      "'self'",
      apiOrigin,
      'https://iseyaa-api.up.railway.app',
      'http://localhost:3001',
    ]
      .filter(Boolean)
      .filter((v, i, arr) => arr.indexOf(v) === i)
      .join(' ');

    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://*.cloudfront.net https://*.amazonaws.com https://images.unsplash.com https://iseyaa.ng",
      "font-src 'self' data:",
      `connect-src ${connectSrc}`,
      "frame-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join('; ');

    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
          { key: 'Content-Security-Policy', value: csp },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
