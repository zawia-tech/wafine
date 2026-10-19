import { describe, it, expect } from 'bun:test';
import { InMemoryJobQueue } from './in-memory-queue.js';

describe('InMemoryJobQueue', () => {
  it('executes queued jobs once a handler is registered and started', async () => {
    const queue = new InMemoryJobQueue();
    const seen: unknown[] = [];
    queue.register('agent.run', async (data) => {
      seen.push(data);
    });

    await queue.enqueue('agent.run', { text: 'hi' });
    await queue.start();

    expect(seen).toEqual([{ text: 'hi' }]);
    expect((await queue.counts())['completed']).toBe(1);
  });

  it('reports health and handles jobs without a handler', async () => {
    const queue = new InMemoryJobQueue();
    expect(await queue.health()).toBe(true);
    await queue.enqueue('orphan', {});
    await queue.start();
    expect((await queue.counts())['failed']).toBe(1);
  });
});
