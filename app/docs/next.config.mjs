import { createMDX } from 'fumadocs-mdx/next';

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
export default withMDX({
  reactStrictMode: true,
  async redirects() {
    // The docs used to live under `/docs/*`; the whole site is the docs now. Permanent = 308.
    return [
      { source: '/docs', destination: '/', permanent: true },
      { source: '/docs/:path*', destination: '/:path*', permanent: true },
    ];
  },
});
