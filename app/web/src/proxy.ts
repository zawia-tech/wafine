import { NextRequest } from 'next/server';
import createMiddleware from 'next-intl/middleware';
import { routing } from '@/i18n/routing';

const intlMiddleware = createMiddleware(routing);

function buildCsp(nonce: string): string {
  const isDev = process.env.NODE_ENV === 'development';

  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      "'wasm-unsafe-eval'",
      ...(isDev ? ["'unsafe-eval'"] : []),
    ],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'https:'],
    'font-src': ["'self'"],
    'connect-src': ["'self'"],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
  };

  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(' ')}`)
    .join('; ');
}

// Next 16 renamed the `middleware` file convention to `proxy` (it runs on the Node.js
// runtime). next-intl's createMiddleware is a plain request handler, so it works unchanged.
export function proxy(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp(nonce);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);
  // The original pathname, so the [locale] layout can build a per-page canonical/hreflang
  // set (client-component pages like auth/login cannot export their own metadata).
  requestHeaders.set('x-pathname', request.nextUrl.pathname);

  const intlResponse = intlMiddleware(
    new NextRequest(request, { headers: requestHeaders }),
  );

  // Ensure the nonce/CSP travel on the response too.
  intlResponse.headers.set('Content-Security-Policy', csp);
  if (!intlResponse.headers.has('x-nonce')) intlResponse.headers.set('x-nonce', nonce);

  return intlResponse;
}

export const config = {
  matcher: [
    {
      source: '/((?!api|oauth|og|llms|opengraph-image|twitter-image|_next/static|_next/image|favicon.ico|.*\\..*).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
