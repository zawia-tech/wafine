import { test, expect } from '@playwright/test';

test('unprefixed /auth/login responds', async ({ request }) => {
  const res = await request.get('/auth/login');
  expect(res.status()).toBe(200);
});

test('unprefixed /oauth/consent responds', async ({ request }) => {
  const res = await request.get('/oauth/consent');
  // missing request param -> 200 with error message (as before)
  expect(res.status()).toBe(200);
});

for (const locale of ['fr', 'ar']) {
  test(`${locale} /auth/login responds`, async ({ request }) => {
    const res = await request.get(`/${locale}/auth/login`);
    expect(res.status()).toBe(200);
  });
  test(`${locale} / renders with lang/dir`, async ({ page }) => {
    await page.goto(`/${locale}`);
    const html = page.locator('html');
    await expect(html).toHaveAttribute('lang', locale);
    await expect(html).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
  });
}

test('root / renders en without prefix', async ({ page }) => {
  await page.goto('/');
  const html = page.locator('html');
  await expect(html).toHaveAttribute('lang', 'en');
  await expect(html).toHaveAttribute('dir', 'ltr');
});


for (const locale of ['', 'fr', 'ar']) {
  const prefix = locale ? `/${locale}` : '';
  test(`${locale || 'en'} /blog responds`, async ({ request }) => {
    const res = await request.get(`${prefix}/blog`);
    expect(res.status()).toBe(200);
  });
  test(`${locale || 'en'} /blog/introducing-wafine responds`, async ({ request }) => {
    const res = await request.get(`${prefix}/blog/introducing-wafine`);
    expect(res.status()).toBe(200);
  });
}
