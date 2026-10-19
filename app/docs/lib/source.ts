import { loader } from 'fumadocs-core/source';
import { docs } from 'fumadocs-mdx:collections/server';
import { i18n } from '@/lib/i18n';

// Locale-aware translations live beside each page (`page.fr.mdx`, `page.ar.mdx`) — the `dot`
// parser in `i18n.ts`. The docs index is served at the site root, hence `baseUrl: '/'`.
export const source = loader({
  baseUrl: '/',
  i18n,
  source: docs.toFumadocsSource(),
});
