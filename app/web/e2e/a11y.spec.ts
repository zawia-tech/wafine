import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Seed the theme before React mounts so ThemeProvider's initial read sees it — otherwise
// the `data-theme` setAttribute below is overwritten back to `wafine-light` on hydration.
for (const path of ['/', '/fr', '/ar', '/auth/login']) {
  for (const theme of ['wafine-light', 'wafine-dark']) {
    test(`axe ${path} ${theme}`, async ({ page }) => {
      await page.addInitScript(
        (t) => window.localStorage.setItem('wafine_theme', t as string),
        theme,
      );
      await page.goto(path);
      await page.waitForSelector(`html[data-theme="${theme}"]`, { timeout: 5_000 });
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze();
      expect(results.violations).toEqual([]);
    });
  }
}
