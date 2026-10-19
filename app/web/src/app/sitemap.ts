import type { MetadataRoute } from 'next';
import { SITE } from '@/lib/site';
import { publishedPosts } from '@/lib/blog';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = SITE.url;
  const locales = SITE.locales;
  const paths = ['', '/brand', '/authors', '/privacy', '/terms', '/blog', '/auth/login', '/auth/signup'];
  const posts = publishedPosts().map((p) => `/blog/${p.slug}`);
  const entries: MetadataRoute.Sitemap = [];
  for (const locale of locales) {
    for (const p of [...paths, ...posts]) {
      const url = locale === SITE.defaultLocale ? `${base}${p || '/'}` : `${base}/${locale}${p}`;
      entries.push({ url, lastModified: new Date() });
    }
  }
  return entries;
}
