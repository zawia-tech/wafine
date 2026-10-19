/**
 * End-to-end journey: the product path a real user walks, against a real web + BFF deployment.
 *
 *   J1 landing loads                     (no credentials needed)
 *   J2 sign up / sign in                 (E2E_EMAIL, E2E_PASSWORD, optional E2E_WA_NUMBER)
 *   J3 request a WhatsApp session + QR   (blocked: owa-session-issuance / owa-session-qr)
 *   J3b scan the QR with a phone         (human step: E2E_LIVE_QR=1)
 *   J4 workflows page                    (authenticated read)
 *   J5 mint a scoped API key + REST call (blocked: owa-session-issuance)
 *   J6 MCP OAuth discovery               (E2E_MCP_URL; public, no session)
 *
 * Rules this file lives by:
 *  - No phone numbers, emails or secrets are hardcoded. The test account comes from E2E_EMAIL /
 *    E2E_PASSWORD; the WhatsApp number from E2E_WA_NUMBER; the MCP endpoint from E2E_MCP_URL.
 *  - With the environment empty, every test skips, so `bun run test:e2e` is safe anywhere.
 *  - A step the product cannot satisfy yet is `test.fail` with the blocking task named in the
 *    description, so it flips the suite red the day it starts working (remove the mark then).
 *  - The QR scan needs a human phone, so it is `test.fixme` unless E2E_LIVE_QR=1.
 */

import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;
const WA_NUMBER = process.env.E2E_WA_NUMBER;
const MCP_URL = process.env.E2E_MCP_URL;
const LIVE_QR = process.env.E2E_LIVE_QR === '1';

const hasAccount = Boolean(EMAIL && PASSWORD);

/** Session shape the web app keeps in `sessionStorage.waasel_session` (see src/lib/session.ts). */
interface SeededSession {
  token: string;
  refreshToken: string;
  expiresAt: number;
  email: string;
  isAdmin: boolean;
}

/** The BFF login tokens, straight from the API (no browser needed). */
async function loginViaApi(request: APIRequestContext): Promise<SeededSession> {
  const res = await request.post('/api/bff/auth/login', {
    data: { email: EMAIL, password: PASSWORD },
  });
  if (!res.ok()) {
    throw new Error(`BFF login failed (${res.status()}): ${(await res.text()).slice(0, 200)}`);
  }
  const body = (await res.json()) as {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    email: string;
    isAdmin: boolean;
  };
  return {
    token: body.accessToken,
    refreshToken: body.refreshToken,
    expiresAt: Date.now() + body.expiresIn * 1000,
    email: body.email,
    isAdmin: body.isAdmin,
  };
}

/** Put a session in place before the app boots, so an authenticated page loads without the form. */
async function seedSession(page: Page, request: APIRequestContext): Promise<SeededSession> {
  const session = await loginViaApi(request);
  await page.addInitScript((s: SeededSession) => {
    window.sessionStorage.setItem('waasel_session', JSON.stringify(s));
  }, session);
  return session;
}

test.describe('E2E journey (web → BFF → gateway)', () => {
  // No E2E_* credentials at all → skip the whole journey, J1 included: an empty environment must
  // exit 0 with every test skipped, which is what the CI jobs rely on when the repo secrets are
  // unset (they also print their own "skipped: no E2E secrets" notice before running this).
  test.skip(
    !EMAIL && !PASSWORD && !WA_NUMBER && !MCP_URL,
    'skipped: no E2E secrets — set E2E_EMAIL, E2E_PASSWORD, E2E_WA_NUMBER and E2E_MCP_URL to run the journey',
  );

  test('J1 landing loads', async ({ page }) => {
    // `/` routes based on the session; logged out it must land on the sign-in screen.
    await page.goto('/');
    await expect(page).toHaveURL(/\/auth\/login/);
    await expect(page.getByRole('heading', { name: 'WaaSel Login' })).toBeVisible();
  });

  test('J2 sign up / sign in (invite/allowlist)', async ({ page }) => {
    test.skip(!hasAccount, 'set E2E_EMAIL and E2E_PASSWORD for the invited test account');

    await page.goto('/auth/login');
    await page.getByLabel('Email').fill(EMAIL!);
    await page.getByLabel('Password').fill(PASSWORD!);
    await page.getByRole('button', { name: 'Login', exact: true }).click();

    try {
      await page.waitForURL(/\/(whatsapp|admin|messages)/, { timeout: 15_000 });
    } catch {
      // No account yet: the invite-only sign-up binds the invited number to the account.
      if (!WA_NUMBER) {
        throw new Error('Login failed and E2E_WA_NUMBER is not set, so the account cannot be signed up');
      }
      await page.goto('/auth/signup');
      await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();
      await page.getByLabel('Email').fill(EMAIL!);
      await page.getByLabel('Password').fill(PASSWORD!);
      await page.getByLabel('WhatsApp number').fill(WA_NUMBER);
      await page.getByRole('button', { name: 'Sign up' }).click();
      await expect(page.getByRole('heading', { name: 'Account created' })).toBeVisible({ timeout: 15_000 });

      await page.getByRole('link', { name: 'Go to login' }).click();
      await page.getByLabel('Email').fill(EMAIL!);
      await page.getByLabel('Password').fill(PASSWORD!);
      await page.getByRole('button', { name: 'Login', exact: true }).click();
      await page.waitForURL(/\/(whatsapp|admin|messages)/, { timeout: 15_000 });
    }
  });

  test('J3 request a WhatsApp session and show the QR', async ({ page, request }) => {
    test.skip(!hasAccount, 'set E2E_EMAIL and E2E_PASSWORD for the invited test account');
    test.fail(
      true,
      'blocked by owa-session-issuance and owa-session-qr: signing up does not yet produce a ' +
        'requestable session with a scannable QR',
    );

    await seedSession(page, request);
    await page.goto('/whatsapp');
    await expect(page.getByRole('heading', { name: 'WhatsApp' })).toBeVisible();

    const create = page.getByRole('button', { name: 'Create session' });
    if (await create.isVisible().catch(() => false)) await create.click();

    // The engine rotates the QR; the page picks it up on its 3 s poll once the status is qr_ready.
    await expect(page.getByAltText('WhatsApp QR code')).toBeVisible({ timeout: 60_000 });
  });

  test('J3b scan the QR with a phone (human)', async ({ page, request }) => {
    test.fixme(!LIVE_QR, 'needs a human to scan the QR with the dedicated test phone; set E2E_LIVE_QR=1');
    test.skip(!hasAccount, 'set E2E_EMAIL and E2E_PASSWORD for the invited test account');

    await seedSession(page, request);
    await page.goto('/whatsapp');
    // A human scans; the badge turns green and the session reports "Connected".
    await expect(page.getByText('Connected', { exact: true })).toBeVisible({ timeout: 180_000 });
  });

  test('J4 workflows page', async ({ page, request }) => {
    test.skip(!hasAccount, 'set E2E_EMAIL and E2E_PASSWORD for the invited test account');

    await seedSession(page, request);
    await page.goto('/workflows');
    await expect(page.getByRole('heading', { name: 'Workflows' })).toBeVisible();
    await expect(
      page.getByText('Automatic replies, sent only to contacts on your allowlist.'),
    ).toBeVisible();
  });

  test('J5 mint a scoped API key and call one REST endpoint', async ({ page, request }) => {
    test.skip(!hasAccount, 'set E2E_EMAIL and E2E_PASSWORD for the invited test account');
    test.fail(
      true,
      'blocked by owa-session-issuance: an API key is session-scoped and no session can be ' +
        'issued from sign-up yet',
    );

    const session = await seedSession(page, request);
    await page.goto('/whatsapp');
    await expect(page.getByRole('heading', { name: 'WhatsApp' })).toBeVisible();

    // Mint through the UI: the plaintext key is shown exactly once, in the warning box.
    await page.getByRole('button', { name: 'Generate API key' }).click();
    const secret = page.locator('div.rounded-box.border-warning').locator('code').first();
    await expect(secret).toBeVisible({ timeout: 15_000 });
    const apiKey = (await secret.innerText()).trim();
    expect(apiKey).toMatch(/^owa_/);

    const auth = { Authorization: `Bearer ${session.token}` };
    const infoRes = await request.get('/api/bff/api/wa/connect-info', { headers: auth });
    expect(infoRes.ok()).toBeTruthy();
    const { restBase } = (await infoRes.json()) as { restBase: string };

    const sessionRes = await request.get('/api/bff/api/wa/session', { headers: auth });
    expect(sessionRes.ok()).toBeTruthy();
    const { session: wa } = (await sessionRes.json()) as { session: { id: string } | null };
    expect(wa?.id).toBeTruthy();

    // One read-only REST call with the key's own header — the way an external client uses it.
    const rest = await request.get(`${restBase.replace(/\/$/, '')}/sessions/${wa!.id}`, {
      headers: { 'X-API-Key': apiKey },
    });
    expect(rest.status()).toBe(200);
  });

  test('J6 MCP endpoint answers an OAuth discovery request', async ({ request }) => {
    test.skip(!MCP_URL, 'set E2E_MCP_URL to the BFF MCP endpoint, e.g. https://api.example/mcp');

    const issuer = MCP_URL!.replace(/\/+$/, '').replace(/\/mcp$/, '');

    // RFC 9728: the protected-resource metadata points back at the issuer.
    const discovery = await request.get(`${issuer}/.well-known/oauth-protected-resource/mcp`);
    expect(discovery.status()).toBe(200);
    const meta = (await discovery.json()) as { resource: string; authorization_servers: string[] };
    expect(meta.resource).toBe(`${issuer}/mcp`);
    expect(meta.authorization_servers).toContain(issuer);

    // The 401 the MCP endpoint returns is what drives a client to that metadata.
    const unauthorized = await request.post(MCP_URL!, {
      data: { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
    });
    expect(unauthorized.status()).toBe(401);
    expect(unauthorized.headers()['www-authenticate'] ?? '').toContain(
      '.well-known/oauth-protected-resource/mcp',
    );
  });
});
