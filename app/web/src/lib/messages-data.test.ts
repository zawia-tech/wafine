import { describe, expect, it } from 'bun:test';
import { createMessagesData, normalizeChats, normalizeMessagePage } from './messages-data';

describe('messages data', () => {
  it('normalizes chat summaries and message pages from the BFF payloads', () => {
    expect(
      normalizeChats({ chats: [{ id: 'chat-1', name: 'Contact', lastMessage: { body: 'Hi', timestamp: 1_800_000_000 } }] }),
    ).toEqual([
      {
        id: 'chat-1',
        name: 'Contact',
        preview: 'Hi',
        updatedAt: new Date(1_800_000_000_000).toISOString(),
        unreadCount: 0,
      },
    ]);
    expect(
      normalizeMessagePage({ messages: { data: [{ id: 'm1', body: 'Hello', fromMe: true, timestamp: 1_800_000_001, mediaPath: 'chat-media/session/file.jpg' }], hasMore: true } }),
    ).toMatchObject({
      hasMore: true,
      items: [{ id: 'm1', text: 'Hello', outgoing: true, mediaPath: 'chat-media/session/file.jpg' }],
    });
  });

  it('loads chats, selects a conversation, and prepends older pages through the data hook store', async () => {
    const calls: { chatId: string; offset: number }[] = [];
    const data = createMessagesData({
      async listChats() {
        return { chats: [{ id: 'chat-1', name: 'Contact' }] };
      },
      async listMessages(chatId, _limit, offset) {
        calls.push({ chatId, offset });
        return offset === 0
          ? { messages: { data: [{ id: 'newer', body: 'new', timestamp: '2026-10-18T12:00:00Z' }, { id: 'middle', body: 'middle', timestamp: '2026-10-18T11:00:00Z' }], hasMore: true } }
          : { messages: { data: [{ id: 'older', body: 'old', timestamp: '2026-10-18T10:00:00Z' }], hasMore: false } };
      },
      async getMediaUrl(path) {
        return { url: `https://media.example.test/${path}`, expiresAt: '2026-10-18T12:02:00Z' };
      },
    });

    await data.loadChats();
    await data.selectChat('chat-1');
    expect(data.getSnapshot().chats[0]?.name).toBe('Contact');
    expect(data.getSnapshot().messages.map((message) => message.id)).toEqual(['middle', 'newer']);
    expect(data.getSnapshot().hasOlder).toBe(true);

    await data.loadOlder();
    expect(calls).toEqual([{ chatId: 'chat-1', offset: 0 }, { chatId: 'chat-1', offset: 2 }]);
    expect(data.getSnapshot().messages.map((message) => message.id)).toEqual(['older', 'middle', 'newer']);
    expect(data.getSnapshot().hasOlder).toBe(false);
  });
});
