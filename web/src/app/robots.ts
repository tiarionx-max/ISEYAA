import type { MetadataRoute } from 'next';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://iseyaa.ng';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/dashboard', '/admin', '/host', '/cart', '/api'],
    },
    sitemap: `${APP_URL}/sitemap.xml`,
  };
}
