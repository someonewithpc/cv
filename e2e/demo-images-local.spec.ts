import { expect, test } from '@playwright/test';

import { frontPageName } from './support/paperStack';

/**
 * Every picture a demo shows ships with the site. A texture, thumbnail or photo pulled
 * from another host breaks when that host moves it, and leaks the visit to it.
 * Fonts are not pictures: the font picker loads whatever font URL the reader gives it.
 */
const IMAGE_PATH = /\.(avif|bmp|gif|ico|jpe?g|png|svg|webp)(\?|#|$)/i;

test('no demo loads an image from another host', async ({ page, baseURL }) => {
  test.setTimeout(240_000);
  const home = new URL(baseURL!).host;
  const remote = new Set<string>();

  page.on('response', (response) => {
    const url = new URL(response.url());
    if (!/^https?:$/.test(url.protocol) || url.host === home) return;
    const type = response.request().resourceType();
    const contentType = response.headers()['content-type'] ?? '';
    if (type === 'image' || contentType.startsWith('image/') || IMAGE_PATH.test(url.pathname)) {
      remote.add(response.url());
    }
  });

  await page.goto('/');

  // Walk every sheet of every stack, so back pages and the islands they boot load too.
  const stacks = page.locator('article.technical-drawing-stack');
  const stackCount = await stacks.count();
  expect(stackCount).toBeGreaterThan(0);

  for (let index = 0; index < stackCount; index += 1) {
    const stack = stacks.nth(index);
    await stack.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(1500);

    const pageCount = await stack.locator(':scope > div').count();
    for (let turn = 1; turn < pageCount; turn += 1) {
      const before = await frontPageName(stack);
      await stack.focus();
      await page.keyboard.press('ArrowRight');
      await expect.poll(async () => frontPageName(stack), { timeout: 15_000 }).not.toBe(before);
      await page.waitForTimeout(800);
    }
  }

  // And the rest of the page, top to bottom.
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForLoadState('networkidle');

  expect([...remote], 'images fetched from another host').toEqual([]);
});
