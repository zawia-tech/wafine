'use client';

import { useEffect, useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { getSession, isSessionExpired } from '@/lib/session';

export default function ContactsPage() {
  const router = useRouter();
  const [contacts, setContacts] = useState<Array<{ id: string; name: string }>>([]);
  const [query, setQuery] = useState('');

  useEffect(() => {
    const session = getSession();
    if (!session || isSessionExpired()) {
      router.push('/auth/login');
      return;
    }

    // TODO: Fetch contacts from BFF via oRPC client
  }, [router]);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    // TODO: Search contacts via BFF blind index
  }

  return (
    <div className="p-4">
      <h1 className="mb-4 text-2xl font-bold">Contacts</h1>
      <form onSubmit={handleSearch} className="mb-4">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by phone or JID..."
          className="w-full rounded-sm border p-2"
        />
      </form>
      {contacts.length === 0 ? (
        <p className="text-base-content/60">No contacts yet.</p>
      ) : (
        <ul className="space-y-2">
          {contacts.map((contact) => (
            <li key={contact.id} className="rounded-sm border p-2">
              {contact.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
