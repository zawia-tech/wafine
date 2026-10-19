import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { OpenWaHttpClient } from './openwa-http-client.js';

const GOOD_KEY = 'test-key';

// Stand-in for OpenWA: /api/health is public, /api/sessions needs the right X-API-Key.
let server: ReturnType<typeof Bun.serve>;
let baseUrl: string;

beforeAll(() => {
  server = Bun.serve({
    port: 0,
    fetch(req) {
      const { pathname } = new URL(req.url);
      if (pathname === '/api/health') return Response.json({ status: 'ok' });
      if (pathname === '/api/sessions') {
        return req.headers.get('x-api-key') === GOOD_KEY
          ? Response.json([])
          : Response.json({ message: 'Unauthorized' }, { status: 401 });
      }
      return new Response('not found', { status: 404 });
    },
  });
  baseUrl = `http://127.0.0.1:${server.port}`;
});

afterAll(() => server.stop(true));

describe('OpenWaHttpClient.health', () => {
  test('up when the gateway is live and accepts the key', async () => {
    expect(await new OpenWaHttpClient(baseUrl, GOOD_KEY, 2000).health()).toBe(true);
  });

  test('down when the gateway rejects the key', async () => {
    expect(await new OpenWaHttpClient(baseUrl, 'stale-key', 2000).health()).toBe(false);
    expect(await new OpenWaHttpClient(baseUrl, '', 2000).health()).toBe(false);
  });

  test('down when the gateway is unreachable', async () => {
    expect(await new OpenWaHttpClient('http://127.0.0.1:1', GOOD_KEY, 500).health()).toBe(false);
  });
});
