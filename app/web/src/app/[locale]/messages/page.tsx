'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { AppHeader } from '@/components/app-header';
import { Button } from '@/components/ui/button';
import { getMe } from '@/lib/bff';
import { useMessagesData } from '@/lib/messages-data';
import { getSession, isSessionExpired } from '@/lib/session';

export default function MessagesPage() {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('messagesPage');
  const [phone, setPhone] = useState<string | null>(null);
  const [mediaErrors, setMediaErrors] = useState<Record<string, boolean>>({});
  const conversationRef = useRef<HTMLOListElement>(null);
  const preservingOlderScroll = useRef(false);
  const {
    chats,
    chatsLoading,
    selectedChatId,
    messages,
    messagesLoading,
    loadingOlder,
    hasOlder,
    error,
    selectChat,
    loadOlder,
    getMediaUrl,
  } = useMessagesData();

  useEffect(() => {
    const session = getSession();
    if (!session || isSessionExpired()) {
      router.push('/auth/login');
      return;
    }

    getMe()
      .then((me) => setPhone(me.phone))
      .catch(() => router.push('/auth/login'));

  }, [router]);

  useEffect(() => {
    if (loadingOlder) {
      preservingOlderScroll.current = true;
      return;
    }
    if (preservingOlderScroll.current) {
      preservingOlderScroll.current = false;
      return;
    }
    if (!messagesLoading && conversationRef.current) {
      conversationRef.current.scrollTop = conversationRef.current.scrollHeight;
    }
  }, [loadingOlder, messages, messagesLoading]);

  const selectedChat = chats.find((chat) => chat.id === selectedChatId) ?? null;

  function formatTime(value: string | null) {
    if (!value) return '';
    return new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
  }

  // Presigned links expire within minutes, so every click asks the BFF for a fresh one.
  async function viewMedia(path: string) {
    const tab = window.open('about:blank', '_blank');
    if (tab) tab.opener = null;
    try {
      const result = await getMediaUrl(path);
      setMediaErrors((errors) => ({ ...errors, [path]: false }));
      if (tab) tab.location.replace(result.url);
    } catch {
      tab?.close();
      setMediaErrors((errors) => ({ ...errors, [path]: true }));
    }
  }

  return (
    <main dir={locale === 'ar' ? 'rtl' : 'ltr'} className="mx-auto w-full max-w-7xl p-4 sm:p-6">
      <AppHeader phone={phone} />
      <header className="mb-5">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="text-sm text-base-content/70">{t('subtitle')}</p>
      </header>
      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(16rem,0.85fr)_minmax(0,1.4fr)]">
        <section aria-label={t('chats')} className="min-w-0 overflow-hidden rounded-box border border-base-300 bg-base-100">
          <h2 className="border-b border-base-300 px-4 py-3 font-semibold">{t('chats')}</h2>
          {chatsLoading ? (
            <p className="p-4 text-sm text-base-content/70" role="status">{t('loadingChats')}</p>
          ) : chats.length === 0 ? (
            <p className="p-4 text-sm text-base-content/70">{t('emptyChats')}</p>
          ) : (
            <ul className="max-h-[70vh] divide-y divide-base-300 overflow-y-auto">
              {chats.map((chat) => (
                <li key={chat.id}>
                  <button
                    type="button"
                    aria-pressed={chat.id === selectedChatId}
                    onClick={() => void selectChat(chat.id)}
                    className={`min-h-16 w-full min-w-0 p-3 text-start transition-colors hover:bg-base-200 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary ${chat.id === selectedChatId ? 'bg-base-200' : ''}`}
                  >
                    <span className="flex min-w-0 items-center justify-between gap-3">
                      <span className="truncate font-semibold">{chat.name}</span>
                      <span className="shrink-0 text-xs text-base-content/65">{formatTime(chat.updatedAt)}</span>
                    </span>
                    <span className="mt-1 flex min-w-0 items-center justify-between gap-2 text-sm text-base-content/70">
                      <span className="truncate">{chat.preview || t('noPreview')}</span>
                      {chat.unreadCount > 0 && <span className="badge badge-primary badge-sm shrink-0">{chat.unreadCount}</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-label={t('conversation')} className="flex min-h-[26rem] min-w-0 flex-col overflow-hidden rounded-box border border-base-300 bg-base-100">
          <h2 className="truncate border-b border-base-300 px-4 py-3 font-semibold">{selectedChat?.name ?? t('conversation')}</h2>
          {error && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-error/30 bg-error/10 px-4 py-3 text-sm" role="alert">
              <span title={error}>{t('error')}</span>
              {selectedChatId && <Button size="sm" variant="outline" onClick={() => void selectChat(selectedChatId)}>{t('retry')}</Button>}
            </div>
          )}
          {!selectedChatId ? (
            <p className="m-auto p-6 text-center text-sm text-base-content/70">{t('chooseChat')}</p>
          ) : messagesLoading ? (
            <p className="m-auto p-6 text-sm text-base-content/70" role="status">{t('loadingMessages')}</p>
          ) : messages.length === 0 ? (
            <p className="m-auto p-6 text-sm text-base-content/70">{t('emptyMessages')}</p>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="flex justify-center p-3">
                {hasOlder && <Button size="sm" variant="outline" disabled={loadingOlder} onClick={() => void loadOlder()}>{loadingOlder ? t('loadingOlder') : t('loadOlder')}</Button>}
              </div>
              <ol ref={conversationRef} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
                {messages.map((message) => (
                  <li key={message.id} className={`flex ${message.outgoing ? 'justify-end' : 'justify-start'}`}>
                    <article className={`max-w-[88%] min-w-0 rounded-2xl px-3.5 py-2.5 text-sm shadow-sm ${message.outgoing ? 'rounded-ee-md bg-primary text-primary-content' : 'rounded-es-md bg-base-200 text-base-content'}`}>
                      {message.text ? <p className="whitespace-pre-wrap break-words">{message.text}</p> : message.mediaPath ? <p className="text-xs opacity-80">{t('mediaPlaceholder', { type: message.mediaType ?? 'file' })}</p> : null}
                      {message.mediaPath && (
                        <div className="mt-2">
                          <Button size="sm" variant="outline" onClick={() => void viewMedia(message.mediaPath!)}>{t('view')}</Button>
                          {mediaErrors[message.mediaPath] && <p className="mt-1 text-xs text-error">{t('mediaError')}</p>}
                        </div>
                      )}
                      {message.timestamp && <time className="mt-1 block text-end text-[0.7rem] opacity-70" dateTime={message.timestamp}>{formatTime(message.timestamp)}</time>}
                    </article>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
