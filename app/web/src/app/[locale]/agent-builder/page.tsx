'use client';

import { useEffect } from 'react';
import { useRouter } from '@/i18n/navigation';
import { getSession, isSessionExpired } from '@/lib/session';

export default function AgentBuilderPage() {
  const router = useRouter();

  useEffect(() => {
    const session = getSession();
    if (!session || isSessionExpired()) {
      router.push('/auth/login');
      return;
    }
  }, [router]);

  return (
    <div className="p-4">
      <h1 className="mb-4 text-2xl font-bold">Agent Builder</h1>
      <p className="text-base-content/60">Build and configure agents.</p>
    </div>
  );
}
