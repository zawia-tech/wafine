import type { MetadataRoute } from 'next';
import { source } from '@/lib/source';

// Same base URL as `app/[lang]/layout.tsx`; placeholder only when `SITE_URL` is unset (CI builds).
const baseUrl = process.env.SITE_URL ?? 'https://docs.example.com';

// Group every page by its slugs so one entry carries the hreflang alternates for en / fr / ar
// (`x-default` = English). English URLs already come without a locale prefix. Hreflang URLs
// must be absolute (sitemap spec), so every locale URL gets the site URL prepended.
type LocaleUrls = Record<string, string>;
const groups = new Map<string, LocaleUrls>();
for (const { language, pages } of source.getLanguages()) {
  for (const page of pages) {
    const key = page.slugs.join('/');
    const urls = groups.get(key) ?? {};
    urls[language] = `${baseUrl}${page.url}`;
    groups.set(key, urls);
  }
}

export default function sitemap(): MetadataRoute.Sitemap {
  return [...groups.entries()].map(([key, urls]) => ({
    url: urls.en,
    changeFrequency: 'monthly',
    priority: key === '' ? 1 : 0.7,
    alternates: {
      languages: { ...urls, 'x-default': urls.en },
    },
  }));
}
