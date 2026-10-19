import { describe, expect, it } from 'bun:test';
import { MAX_BODY_BYTES, buildUpstreamUrl, proxyToBff, type ProxyConfig } from './bff-proxy';

type Call = { url: string; init: RequestInit & { headers: Headers } };

function harness(reply: () => Response | Promise<Response> = () => Response.json({ ok: true })) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: URL, init: Call['init']) => {
    calls.push({ url: String(url), init });
    return reply();
  }) as unknown as typeof fetch;
  const config: ProxyConfig = { bffUrl: 'https://bff.internal.example', fetchImpl };
  return { calls, config };
}

const req = (path: string, init: RequestInit & { headers?: Record<string, string> } = {}) =>
  new Request(`https://wa.example.com/api/bff/${path}`, init);

describe('buildUpstreamUrl', () => {
  it('joins the BFF base, path segments and query', () => {
    expect(String(buildUpstreamUrl('https://bff.example/', ['api', 'workflows', 'a b'], '?x=1'))).toBe(
      'https://bff.example/api/workflows/a%20b?x=1',
    );
  });
  it('keeps a base path prefix', () => {
    expect(String(buildUpstreamUrl('https://bff.example/v1/', ['api', 'x'], ''))).toBe('https://bff.example/v1/api/x');
  });
  it.each([
    [[]],
    [['health', 'ready']],
    [['webhook', 'openwa']],
    [['api', '..', 'webhook']],
    [['api', '.', 'x']],
    [['api', '', 'x']],
    [['api', 'a/b']],
    [['api', 'a\\b']],
  ])('rejects %j', (segments) => {
    expect(buildUpstreamUrl('https://bff.example', segments, '')).toBeNull();
  });
  it('rejects non-http base URLs', () => {
    expect(buildUpstreamUrl('file:///etc', ['api', 'x'], '')).toBeNull();
  });
});

describe('proxyToBff forwarding', () => {
  it('forwards method, body, query and the allowlisted headers', async () => {
    const { calls, config } = harness();
    const res = await proxyToBff(
      req('api/workflows/greeting?v=2', {
        method: 'PUT',
        headers: { authorization: 'Bearer tok', 'content-type': 'application/json', accept: 'application/json' },
        body: '{"enabled":true}',
      }),
      ['api', 'workflows', 'greeting'],
      config,
    );
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    expect(call.url).toBe('https://bff.internal.example/api/workflows/greeting?v=2');
    expect(call.init.method).toBe('PUT');
    expect(new TextDecoder().decode(call.init.body as Uint8Array)).toBe('{"enabled":true}');
    expect(call.init.headers.get('authorization')).toBe('Bearer tok');
    expect(call.init.headers.get('content-type')).toBe('application/json');
    expect(call.init.redirect).toBe('manual');
  });

  it('never forwards client-supplied tenant, hop-by-hop or Access headers', async () => {
    const { calls, config } = harness();
    await proxyToBff(
      req('api/workflows', {
        headers: {
          authorization: 'Bearer tok',
          'x-tenant-id': 'someone-elses-tenant',
          'x-tenant': 'x',
          'x-forwarded-for': '6.6.6.6',
          'x-forwarded-host': 'evil.example',
          connection: 'keep-alive',
          'transfer-encoding': 'chunked',
          te: 'trailers',
          upgrade: 'websocket',
          'cf-access-client-id': 'attacker',
          'cf-access-client-secret': 'attacker',
          'x-api-key': 'k',
        },
      }),
      ['api', 'workflows'],
      { ...config, accessClientId: 'real-id', accessClientSecret: 'real-secret' },
    );
    const h = calls[0]!.init.headers;
    const names = [...h.keys()].sort();
    expect(names).toEqual(['authorization', 'cf-access-client-id', 'cf-access-client-secret']);
    expect(h.get('cf-access-client-id')).toBe('real-id');
    expect(h.get('cf-access-client-secret')).toBe('real-secret');
  });

  it('adds no Access headers unless both halves are configured', async () => {
    const { calls, config } = harness();
    await proxyToBff(req('api/x'), ['api', 'x'], { ...config, accessClientId: 'id' });
    expect(calls[0]!.init.headers.has('cf-access-client-id')).toBe(false);
  });

  it('forwards only the session cookie', async () => {
    const { calls, config } = harness();
    await proxyToBff(
      req('api/x', { headers: { cookie: 'other=1; wafine_session=abc; _vercel_jwt=zzz' } }),
      ['api', 'x'],
      config,
    );
    expect(calls[0]!.init.headers.get('cookie')).toBe('wafine_session=abc');
  });

  it('returns upstream status and body, drops hop-by-hop response headers, relays set-cookie', async () => {
    const { config } = harness(
      () =>
        new Response('{"workflows":[]}', {
          status: 201,
          headers: [
            ['content-type', 'application/json'],
            ['connection', 'close'],
            ['server', 'cloudflare'],
            ['cf-ray', 'abc'],
            ['set-cookie', 'wafine_session=1; HttpOnly'],
            ['set-cookie', 'b=2'],
          ],
        }),
    );
    const res = await proxyToBff(req('api/workflows'), ['api', 'workflows'], config);
    expect(res.status).toBe(201);
    expect(await res.text()).toBe('{"workflows":[]}');
    expect(res.headers.get('content-type')).toBe('application/json');
    expect(res.headers.get('server')).toBeNull();
    expect(res.headers.get('cf-ray')).toBeNull();
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.getSetCookie()).toEqual(['wafine_session=1; HttpOnly', 'b=2']);
  });
});

describe('proxyToBff guards', () => {
  it('404s paths outside /api without calling the BFF', async () => {
    const { calls, config } = harness();
    for (const segs of [['webhook', 'openwa'], ['health', 'ready'], ['api', '..', 'health']]) {
      const res = await proxyToBff(req(segs.join('/')), segs, config);
      expect(res.status).toBe(404);
    }
    expect(calls).toHaveLength(0);
  });

  it('rejects an oversized content-length before reading the body', async () => {
    const { calls, config } = harness();
    const res = await proxyToBff(
      req('api/x', { method: 'POST', headers: { 'content-length': String(MAX_BODY_BYTES + 1) }, body: 'x' }),
      ['api', 'x'],
      config,
    );
    expect(res.status).toBe(413);
    expect(calls).toHaveLength(0);
  });

  it('rejects an oversized streamed body that has no honest content-length', async () => {
    const { calls, config } = harness();
    const chunk = new Uint8Array(MAX_BODY_BYTES / 2 + 1);
    const stream = new ReadableStream({
      start(c) {
        c.enqueue(chunk);
        c.enqueue(chunk);
        c.close();
      },
    });
    const res = await proxyToBff(
      new Request('https://wa.example.com/api/bff/api/x', {
        method: 'POST',
        body: stream,
        duplex: 'half',
      } as RequestInit),
      ['api', 'x'],
      config,
    );
    expect(res.status).toBe(413);
    expect(calls).toHaveLength(0);
  });

  it('accepts a body exactly at the cap', async () => {
    const { calls, config } = harness();
    const res = await proxyToBff(
      req('api/x', { method: 'POST', body: new Uint8Array(MAX_BODY_BYTES) }),
      ['api', 'x'],
      config,
    );
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(1);
  });

  it('blocks cross-site state-changing calls but allows same-origin ones', async () => {
    const { calls, config } = harness();
    const post = (headers: Record<string, string>) =>
      proxyToBff(req('api/x', { method: 'POST', body: '{}', headers }), ['api', 'x'], config);
    expect((await post({ origin: 'https://evil.example', host: 'wa.example.com' })).status).toBe(403);
    expect((await post({ 'sec-fetch-site': 'cross-site' })).status).toBe(403);
    expect((await post({ origin: 'https://wa.example.com', host: 'wa.example.com' })).status).toBe(200);
    expect(calls).toHaveLength(1);
    // Reads are not state-changing.
    expect((await proxyToBff(req('api/x', { headers: { origin: 'https://evil.example' } }), ['api', 'x'], config)).status).toBe(200);
  });
});

describe('proxyToBff upstream failures', () => {
  const failing = (err: Error): ProxyConfig => ({
    bffUrl: 'https://bff.internal.example',
    fetchImpl: (async () => {
      throw err;
    }) as unknown as typeof fetch,
  });

  it('answers 502 with a clean body when the BFF is unreachable, without leaking its address', async () => {
    const res = await proxyToBff(req('api/x'), ['api', 'x'], failing(new TypeError('connect ECONNREFUSED bff.internal.example')));
    expect(res.status).toBe(502);
    const text = await res.text();
    expect(JSON.parse(text).error).toBe('bff_unreachable');
    expect(text).not.toContain('bff.internal.example');
  });

  it('answers 504 on timeout', async () => {
    const err = Object.assign(new Error('timed out'), { name: 'TimeoutError' });
    expect((await proxyToBff(req('api/x'), ['api', 'x'], failing(err))).status).toBe(504);
  });

  it('answers 503 when BFF_URL is missing or invalid', async () => {
    for (const bffUrl of [undefined, '', 'not a url']) {
      const res = await proxyToBff(req('api/x'), ['api', 'x'], { bffUrl });
      expect(res.status).toBe(503);
      expect((await res.json()).error).toBe('bff_not_configured');
    }
  });

  it('turns an upstream redirect (Cloudflare Access login) into 502 and does not relay Location', async () => {
    const { config } = harness(
      () => new Response(null, { status: 302, headers: { location: 'https://team.cloudflareaccess.com/login' } }),
    );
    const res = await proxyToBff(req('api/x'), ['api', 'x'], config);
    expect(res.status).toBe(502);
    expect(res.headers.get('location')).toBeNull();
    expect(await res.text()).not.toContain('cloudflareaccess');
  });

  it('passes upstream 4xx/5xx through untouched', async () => {
    const { config } = harness(() => Response.json({ error: 'Missing or invalid Authorization header' }, { status: 401 }));
    const res = await proxyToBff(req('api/x'), ['api', 'x'], config);
    expect(res.status).toBe(401);
  });
});

describe('allowed path prefixes', () => {
  it('forwards the public auth routes (sign-up, login, refresh)', () => {
    expect(String(buildUpstreamUrl('https://bff.example', ['auth', 'login'], ''))).toBe('https://bff.example/auth/login');
    expect(String(buildUpstreamUrl('https://bff.example', ['auth', 'signup'], ''))).toBe('https://bff.example/auth/signup');
  });

  it('forwards the public waitlist route (anonymous, its own rate limit)', () => {
    expect(String(buildUpstreamUrl('https://bff.example', ['waitlist'], ''))).toBe('https://bff.example/waitlist');
  });

  it('never exposes health, webhook or any other prefix through the proxy', () => {
    for (const segments of [['health'], ['health', 'ready'], ['webhook', 'openwa'], ['mcp'], ['admin', 'x']]) {
      expect(buildUpstreamUrl('https://bff.example', segments, '')).toBeNull();
    }
  });
});
