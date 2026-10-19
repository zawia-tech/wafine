/**
 * Public site constants (rebrand-plan §2.1). Server-safe: no `next/headers`,
 * no client-only APIs — importable from layouts, metadata and image routes.
 *
 * Hostnames are never hardcoded (owner review on PR #38): every URL comes from
 * the environment, falls back to a localhost dev address, and fails fast when
 * production is missing a value it actually needs. The getters keep the
 * fail-fast lazy, so an unread constant can never break a build or a request.
 *
 * The required var names come from env-guard.ts (one source of truth with the
 * build-time check in next.config.ts); these runtime throws are the second
 * line of defence.
 */
import { readRequiredEnv } from './env-guard';

export const SITE = {
  name: 'WaFine',
  parent: 'Zawia',
  locales: ['en', 'fr', 'ar'] as const,
  defaultLocale: 'en',
  /** Social handle — owner to confirm before launch. */
  twitter: '@zawia',
  get contact() {
    return readRequiredEnv('CONTACT_EMAIL', 'hello@example.com');
  },
  get url() {
    return readRequiredEnv('SITE_URL', 'http://localhost:3000');
  },
  get apiUrl() {
    return readRequiredEnv('NEXT_PUBLIC_API_URL', 'http://localhost:4000');
  },
  get docsUrl() {
    return readRequiredEnv('NEXT_PUBLIC_DOCS_URL', 'http://localhost:3001');
  },
} as const;

/** Hostname for a card's footer label, derived from `SITE_URL` (never hardcoded). */
export function siteHostname(): string {
  return new URL(SITE.url).host;
}
