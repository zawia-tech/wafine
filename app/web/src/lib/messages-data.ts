'use client';

import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { authed } from './bff';

export interface MessageChat {
  id: string;
  name: string;
  preview: string;
  updatedAt: string | null;
  unreadCount: number;
}

export interface ConversationMessage {
  id: string;
  text: string;
  timestamp: string | null;
  outgoing: boolean;
  mediaPath: string | null;
  mediaType: string | null;
}

export interface MessagePage {
  items: ConversationMessage[];
  hasMore: boolean;
}

export interface MessagesClient {
  listChats(): Promise<unknown>;
  listMessages(chatId: string, limit: number, offset: number): Promise<unknown>;
  getMediaUrl(path: string): Promise<{ url: string; expiresAt: string }>;
}

const PAGE_SIZE = 50;

export const messagesClient: MessagesClient = {
  listChats: () => authed<{ chats: unknown }>('/api/wa/chats'),
  listMessages: (chatId, limit, offset) => {
    const query = new URLSearchParams({ chatId, limit: String(limit), offset: String(offset) });
    return authed<{ messages: unknown }>(`/api/wa/messages?${query.toString()}`);
  },
  getMediaUrl: (path) =>
    authed<{ url: string; expiresAt: string }>(`/api/wa/media-url?path=${encodeURIComponent(path)}`),
};

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringField(value: unknown, ...keys: string[]): string | null {
  const source = record(value);
  for (const key of keys) {
    const candidate = source[key];
    if (typeof candidate === 'string' && candidate.trim()) return candidate;
  }
  return null;
}

function timestamp(value: unknown): string | null {
  const raw = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) || value : null;
  if (raw === null) return null;
  const millis = typeof raw === 'number' && raw < 10_000_000_000 ? raw * 1000 : raw;
  const date = new Date(millis);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function arrayFrom(value: unknown, keys: string[]): unknown[] {
  if (Array.isArray(value)) return value;
  const source = record(value);
  for (const key of keys) {
    if (Array.isArray(source[key])) return source[key] as unknown[];
    if (source[key] !== undefined) return arrayFrom(source[key], keys);
  }
  const data = source['data'];
  if (Array.isArray(data)) return data;
  if (data !== undefined) return arrayFrom(data, keys);
  return [];
}

export function normalizeChats(value: unknown): MessageChat[] {
  return arrayFrom(value, ['chats', 'items', 'results'])
    .map((item) => {
      const id = stringField(item, 'id', 'chatId', 'wid');
      if (!id) return null;
      const last = record(record(item)['lastMessage']);
      const preview = stringField(last, 'body', 'text', 'caption') ?? stringField(item, 'lastMessageText', 'preview') ?? '';
      const count = record(item)['unreadCount'] ?? record(item)['unread'];
      return {
        id,
        name: stringField(item, 'name', 'formattedTitle', 'pushname', 'pushName') ?? id,
        preview,
        updatedAt: timestamp(last['timestamp'] ?? record(item)['timestamp'] ?? record(item)['lastMessageTimestamp']),
        unreadCount: typeof count === 'number' && Number.isFinite(count) ? Math.max(0, count) : 0,
      };
    })
    .filter((chat): chat is MessageChat => chat !== null);
}

export function normalizeMessagePage(value: unknown): MessagePage {
  const rows = arrayFrom(value, ['messages', 'items', 'results']);
  const items = rows
    .map((item) => {
      const id = stringField(item, 'id', 'messageId', '_id');
      if (!id) return null;
      const media = record(record(item)['media']);
      return {
        id,
        text: stringField(item, 'body', 'text', 'caption') ?? '',
        timestamp: timestamp(record(item)['timestamp'] ?? record(item)['t']),
        outgoing: record(item)['fromMe'] === true || record(item)['from_me'] === true,
        mediaPath: stringField(item, 'mediaPath') ?? stringField(media, 'mediaPath', 'path'),
        mediaType: stringField(item, 'mimetype', 'type') ?? stringField(media, 'mimetype', 'type'),
      };
    })
    .filter((message): message is ConversationMessage => message !== null)
    .sort((a, b) => (a.timestamp ?? '').localeCompare(b.timestamp ?? ''));
  const source = record(value);
  const explicit =
    source['hasMore'] ?? record(source['messages'])['hasMore'] ?? record(source['data'])['hasMore'];
  return { items, hasMore: typeof explicit === 'boolean' ? explicit : rows.length === PAGE_SIZE };
}

export interface MessagesState {
  chats: MessageChat[];
  chatsLoading: boolean;
  selectedChatId: string | null;
  messages: ConversationMessage[];
  messagesLoading: boolean;
  loadingOlder: boolean;
  hasOlder: boolean;
  error: string | null;
}

export function createMessagesData(client: MessagesClient) {
  let state: MessagesState = {
    chats: [],
    chatsLoading: true,
    selectedChatId: null,
    messages: [],
    messagesLoading: false,
    loadingOlder: false,
    hasOlder: false,
    error: null,
  };
  let offset = 0;
  let selection = 0;
  const listeners = new Set<() => void>();
  const update = (patch: Partial<MessagesState>) => {
    state = { ...state, ...patch };
    for (const listener of listeners) listener();
  };

  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async loadChats() {
      update({ chatsLoading: true, error: null });
      try {
        update({ chats: normalizeChats(await client.listChats()) });
      } catch (err) {
        update({ error: err instanceof Error ? err.message : 'Could not load chats' });
      } finally {
        update({ chatsLoading: false });
      }
    },
    async selectChat(chatId: string) {
      const currentSelection = ++selection;
      offset = 0;
      update({ selectedChatId: chatId, messages: [], messagesLoading: true, loadingOlder: false, hasOlder: false, error: null });
      try {
        const page = normalizeMessagePage(await client.listMessages(chatId, PAGE_SIZE, 0));
        if (selection === currentSelection) {
          offset = page.items.length;
          update({ messages: page.items, hasOlder: page.hasMore });
        }
      } catch (err) {
        if (selection === currentSelection) update({ error: err instanceof Error ? err.message : 'Could not load messages' });
      } finally {
        if (selection === currentSelection) update({ messagesLoading: false });
      }
    },
    async loadOlder() {
      const chatId = state.selectedChatId;
      if (!chatId || !state.hasOlder || state.loadingOlder) return;
      const currentSelection = selection;
      update({ loadingOlder: true, error: null });
      try {
        const page = normalizeMessagePage(await client.listMessages(chatId, PAGE_SIZE, offset));
        if (selection === currentSelection && state.selectedChatId === chatId) {
          offset += page.items.length;
          update({
            messages: [...page.items, ...state.messages].filter(
              (message, index, all) => all.findIndex((candidate) => candidate.id === message.id) === index,
            ).sort((a, b) => (a.timestamp ?? '').localeCompare(b.timestamp ?? '')),
            hasOlder: page.hasMore,
          });
        }
      } catch (err) {
        if (selection === currentSelection) update({ error: err instanceof Error ? err.message : 'Could not load older messages' });
      } finally {
        if (selection === currentSelection) update({ loadingOlder: false });
      }
    },
    getMediaUrl: (path: string) => client.getMediaUrl(path),
  };
}

export function useMessagesData(client: MessagesClient = messagesClient) {
  const data = useMemo(() => createMessagesData(client), [client]);
  const state = useSyncExternalStore(data.subscribe, data.getSnapshot, data.getSnapshot);
  useEffect(() => {
    void data.loadChats();
  }, [data]);
  return { ...state, selectChat: data.selectChat, loadOlder: data.loadOlder, getMediaUrl: data.getMediaUrl };
}
