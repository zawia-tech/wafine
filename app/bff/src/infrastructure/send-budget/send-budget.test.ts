import { describe, it, expect } from 'bun:test';
import { CountingSendBudget, MemoryCounterStore, describeRefusal } from './send-budget.js';

const S = 'aaaaaaaa-0000-4000-8000-000000000001';
const DAY = 86_400_000;

function setup(perDay: number, perMinute: number, start = Date.UTC(2026, 9, 16, 23, 58, 30)) {
  let now = start;
  const clock = () => now;
  const budget = new CountingSendBudget(new MemoryCounterStore(clock), { perDay, perMinute }, clock);
  return { budget, advance: (ms: number) => (now += ms) };
}

describe('CountingSendBudget', () => {
  it('admits up to the daily cap, refuses without consuming, and resets at 00:00 UTC', async () => {
    const { budget, advance } = setup(2, 10);
    expect((await budget.take(S, 1)).allowed).toBe(true);
    expect((await budget.take(S, 1)).allowed).toBe(true);
    const refused = await budget.take(S, 1);
    expect(refused).toMatchObject({ allowed: false, window: 'day', limit: 2, retryAfterSeconds: 90 });
    expect((await budget.usage(S)).today).toBe(2);

    advance(90_000); // 00:00:00 UTC
    expect((await budget.usage(S)).today).toBe(0);
    expect((await budget.take(S, 1)).allowed).toBe(true);
  });

  it('enforces the per-minute cap and rolls the day counter back with it', async () => {
    const { budget, advance } = setup(100, 2, Date.UTC(2026, 9, 16, 10, 0, 0));
    await budget.take(S, 2);
    expect(await budget.take(S, 1)).toMatchObject({ allowed: false, window: 'minute', retryAfterSeconds: 60 });
    expect((await budget.usage(S)).today).toBe(2);
    advance(60_000);
    expect((await budget.take(S, 1)).allowed).toBe(true);
  });

  it('refuses a request larger than a whole window outright', async () => {
    const { budget } = setup(5, 3);
    expect(await budget.take(S, 6)).toMatchObject({ allowed: false, window: 'day' });
    expect(await budget.take(S, 4)).toMatchObject({ allowed: false, window: 'minute' });
    expect((await budget.usage(S)).today).toBe(0);
  });

  it('refunds an admitted send', async () => {
    const { budget } = setup(1, 1);
    const d = await budget.take(S, 1);
    if (!d.allowed) throw new Error('expected admission');
    await budget.refund(d.ticket);
    expect((await budget.take(S, 1)).allowed).toBe(true);
  });

  it('keeps sessions apart and reads caps per session', async () => {
    const caps = new Map([[S, { perDay: 1, perMinute: 1 }]]);
    const budget = new CountingSendBudget(new MemoryCounterStore(), async (id) => caps.get(id) ?? { perDay: 5, perMinute: 5 });
    await budget.take(S, 1);
    expect((await budget.take(S, 1)).allowed).toBe(false);
    expect((await budget.take('other', 1)).allowed).toBe(true);
    expect((await budget.usage(S)).resetsInSeconds).toBeLessThanOrEqual(DAY / 1000);
  });

  it('explains a refusal and that phone traffic does not count', () => {
    const text = describeRefusal({ allowed: false, window: 'day', limit: 300, retryAfterSeconds: 60 });
    expect(text).toContain('300');
    expect(text).toContain('do not count');
  });
});
