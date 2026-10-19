import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';
import { assertProductionEnv, shouldCheckProductionEnv } from './src/lib/env-guard';

// Fail the build (not the first request) when a required production env var is
// missing, not https, or still a localhost/example.com placeholder. CI builds
// use localhost values without VERCEL_ENV=production, so they pass.
if (shouldCheckProductionEnv()) {
  assertProductionEnv();
}

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingIncludes: {
    '/**': ['./public/fonts/**', './public/og/**'],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
