import { describe, it, expect } from 'bun:test';
import { PacedReplySender, DEFAULT_PACING, type PacedSenderClock } from './paced-sender.js';
import { OpenWaApiError } from '../gateway/openwa-http-client.js';
import { TokenBucketRateLimiter } from '../auth/rate-limit.js';
import type { SendTextInput } from '../../domain/ports/index.js';
import { CountingSendBudget, MemoryCounterStore } from '../send-budget/send-budget.js';

function fakeClock(): PacedSenderClock & { sleeps: number[]; time: number } {
  const clock = {
    time: 1_000_000,
    sleeps: [] as number[],
    now: () => clock.time,
    sleep: async (ms: number) => {
      clock.sleeps.push(ms);
      clock.time += ms;
    },
    random: () => 0.5,
  };
  return clock;
}

function fakeGateway(failWith?: () => Error) {
  const sent: SendTextInput[] = [];
  return {
    sent,
    sendText: async (input: SendTextInput) => {
      if (failWith) throw failWith();
      sent.push(input);
      return { messageId: `m${sent.length}`, timestamp: '' };
    },
  };
}

const request = (chatId = '212600000001@c.us', text = 'pong') => ({ sessionId: 's1', chatId, text });

describe('PacedReplySender', () => {
  it('waits a human-like delay before sending and keeps a gap between sends', async () => {
    const clock = fakeClock();
    const gateway = fakeGateway();
    const sender = new PacedReplySender(gateway, new TokenBucketRateLimiter(), DEFAULT_PACING, clock);

    expect(await sender.send(request('212600000001@c.us'))).toBe('sent');
    expect(await sender.send(request('212600000002@c.us'))).toBe('sent');

    const { thinkMinMs, thinkMaxMs, typingMsPerChar, minGapMs } = DEFAULT_PACING;
    const human = (thinkMinMs + thinkMaxMs) / 2 + 'pong'.length * typingMsPerChar;
    expect(clock.sleeps[0]).toBe(Math.round(human));
    // Second send: the gap since the first send is already partly covered by its own delay.
    expect(clock.sleeps[1]).toBeGreaterThanOrEqual(Math.round(human));
    expect(clock.sleeps[1]).toBeLessThanOrEqual(Math.round(human + minGapMs));
    expect(gateway.sent).toHaveLength(2);
  });

  it('drops a contact that exceeds its per-minute reply budget', async () => {
    const sender = new PacedReplySender(
      fakeGateway(),
      new TokenBucketRateLimiter(),
      { ...DEFAULT_PACING, maxPerMinutePerContact: 2 },
      fakeClock(),
    );
    expect(await sender.send(request())).toBe('sent');
    expect(await sender.send(request())).toBe('sent');
    expect(await sender.send(request())).toBe('dropped_rate_limit');
  });

  it('refuses replies longer than the cap', async () => {
    const gateway = fakeGateway();
    const sender = new PacedReplySender(
      gateway,
      new TokenBucketRateLimiter(),
      { ...DEFAULT_PACING, maxReplyChars: 10 },
      fakeClock(),
    );
    expect(await sender.send(request(undefined, 'x'.repeat(11)))).toBe('dropped_too_long');
    expect(gateway.sent).toHaveLength(0);
  });

  it('on 429 SEND_PACING_LIMITED backs off, does not retry, and drops later sends', async () => {
    const clock = fakeClock();
    let calls = 0;
    const gateway = {
      sendText: async () => {
        calls++;
        throw new OpenWaApiError(429, { code: 'SEND_PACING_LIMITED' }, 'paced', 120);
      },
    };
    const sender = new PacedReplySender(gateway, new TokenBucketRateLimiter(), DEFAULT_PACING, clock);

    expect(await sender.send(request('212600000001@c.us'))).toBe('gateway_paced');
    expect(calls).toBe(1);

    // Inside the Retry-After window nothing reaches the gateway.
    expect(await sender.send(request('212600000002@c.us'))).toBe('dropped_backoff');
    expect(calls).toBe(1);

    // After the window the sender tries again.
    clock.time += 121_000;
    expect(await sender.send(request('212600000003@c.us'))).toBe('gateway_paced');
    expect(calls).toBe(2);
  });

  it('does not retry other gateway failures', async () => {
    let calls = 0;
    const gateway = {
      sendText: async () => {
        calls++;
        throw new OpenWaApiError(500, null, 'boom');
      },
    };
    const sender = new PacedReplySender(gateway, new TokenBucketRateLimiter(), DEFAULT_PACING, fakeClock());
    expect(await sender.send(request())).toBe('failed');
    expect(calls).toBe(1);
  });

  it('drops replies once the session queue is full', async () => {
    const clock = fakeClock();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    clock.sleep = async () => gate;
    const sender = new PacedReplySender(
      fakeGateway(),
      new TokenBucketRateLimiter(),
      { ...DEFAULT_PACING, maxQueue: 1, maxPerMinutePerContact: 10 },
      clock,
    );
    const first = sender.send(request('212600000001@c.us'));
    await Promise.resolve();
    await Promise.resolve();
    expect(await sender.send(request('212600000002@c.us'))).toBe('dropped_queue_full');
    release();
    expect(await first).toBe('sent');
  });
});

describe('PacedReplySender and the API send budget', () => {
  it('charges each reply to the session budget, drops over it, and refunds a failed send', async () => {
    const budget = new CountingSendBudget(new MemoryCounterStore(), { perDay: 1, perMinute: 10 });
    const ok = new PacedReplySender(fakeGateway(), new TokenBucketRateLimiter(), DEFAULT_PACING, fakeClock(), budget);
    expect(await ok.send(request('212600000001@c.us'))).toBe('sent');
    expect(await ok.send(request('212600000002@c.us'))).toBe('dropped_rate_limit');
    expect((await budget.usage('s1')).today).toBe(1);

    const fresh = new CountingSendBudget(new MemoryCounterStore(), { perDay: 1, perMinute: 10 });
    const failing = new PacedReplySender(
      fakeGateway(() => new Error('boom')),
      new TokenBucketRateLimiter(),
      DEFAULT_PACING,
      fakeClock(),
      fresh,
    );
    expect(await failing.send(request())).toBe('failed');
    expect((await fresh.usage('s1')).today).toBe(0);
  });

  it('reads pacing on every reply, so admin changes apply without a restart', async () => {
    let maxReplyChars = 600;
    const sender = new PacedReplySender(
      fakeGateway(),
      new TokenBucketRateLimiter(),
      async () => ({ ...DEFAULT_PACING, maxReplyChars }),
      fakeClock(),
    );
    expect(await sender.send(request(undefined, 'hello'))).toBe('sent');
    maxReplyChars = 3;
    expect(await sender.send(request(undefined, 'hello'))).toBe('dropped_too_long');
  });
});
