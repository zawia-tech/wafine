import type { MetadataRoute } from 'next';

const baseUrl = process.env.SITE_URL ?? 'https://docs.example.com';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/' },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
