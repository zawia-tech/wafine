/**
 * Public destinations used by the marketing pages: the docs site, the connector URL and the
 * contact address.
 *
 * No hostname is hardcoded in copy or components. A deployment sets these env vars (see
 * `.env.example`); local dev falls back to localhost, and a production render without them
 * throws instead of linking to a developer address.
 *
 * This module is **server-only**: it is imported by server components only, and the values reach
 * the client as rendered text, never as bundle constants. That is deliberate — the API origin must
 * not be shipped to the browser (see docs/05-bff-frontend-plan.md decision D7 and the check in bff-exposure.test.ts).
 *
 * The required var names come from env-guard.ts (one source of truth with the build-time check
 * in next.config.ts); the throws below are the second line of defence.
 */

import { readRequiredEnv } from './env-guard';

export interface SiteLinks {
  /** BFF origin, e.g. https://api.example.com — shown to users, not used for fetching. */
  apiOrigin: string;
  /** MCP connector URL, i.e. `${apiOrigin}/mcp`. */
  connectorUrl: string;
  /** Documentation site origin. */
  docsUrl: string;
  /** Support address shown in the footer and the legal stubs. */
  contactEmail: string;
}

export function siteLinks(): SiteLinks {
  const apiOrigin = readRequiredEnv('NEXT_PUBLIC_API_URL', 'http://localhost:4000');
  return {
    apiOrigin,
    connectorUrl: `${apiOrigin}/mcp`,
    docsUrl: readRequiredEnv('NEXT_PUBLIC_DOCS_URL', 'http://localhost:3002'),
    contactEmail: readRequiredEnv('NEXT_PUBLIC_CONTACT_EMAIL', 'hello@example.com'),
  };
}
