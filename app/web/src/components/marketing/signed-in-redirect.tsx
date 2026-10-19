'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getSession, isSessionExpired } from '@/lib/session';

/**
 * `/` used to redirect every visitor: signed-in to `/messages`, everyone else to
 * `/auth/login`. Anonymous visitors now get the landing page, so only the signed-in half of
 * that behaviour remains.
 *
 * Tokens live in memory/sessionStorage (`lib/session`), which only exists after hydration —
 * hence the effect, and hence a landing paint before the redirect. `replace` keeps `/` out of
 * the history so Back does not bounce forward again.
 */
export function SignedInRedirect() {
  const router = useRouter();

  useEffect(() => {
    if (getSession() && !isSessionExpired()) router.replace('/messages');
  }, [router]);

  return null;
}
