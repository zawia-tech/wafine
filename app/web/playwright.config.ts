import { defineConfig } from '@playwright/test';

/**
 * Two suites, two projects — they must never run in the same job:
 *
 *   `bun run test:a11y`  → project `a11y`    (axe + locale routes; the local server below)
 *   `bun run test:e2e`   → project `journey` (J1–J6; never starts a server)
 *
 * `BASE_URL` is the only knob: unset, the config builds and starts the app on
 * http://localhost:3000 (what the web-a11y job uses in CI); set to a deployment URL, the journey
 * runs against that and no local server is started. The journey's credentials come from the
 * environment (E2E_EMAIL, E2E_PASSWORD, E2E_WA_NUMBER, E2E_MCP_URL); with none set every test in
 * that suite skips, so `bun run test:e2e` exits 0 anywhere — CI relies on this.
 */
const baseURL = process.env.BASE_URL || 'http://localhost:3000';

export default defineConfig({
  testDir: './e2e',
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL },
  projects: [
    { name: 'a11y', testMatch: ['a11y.spec.ts', 'i18n-routes.spec.ts'] },
    { name: 'journey', testMatch: ['journey.e2e.ts'] },
  ],
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: 'bun run build && bun run start',
        url: 'http://localhost:3000',
        reuseExistingServer: !process.env.CI,
        timeout: 300_000,
        env: {
          SITE_URL: 'http://localhost:3000',
          NEXT_PUBLIC_API_URL: 'http://localhost:4000',
          NEXT_PUBLIC_DOCS_URL: 'http://localhost:3001',
          CONTACT_EMAIL: 'hello@example.com',
          NEXT_PUBLIC_CONTACT_EMAIL: 'hello@example.com',
        },
      },
});
