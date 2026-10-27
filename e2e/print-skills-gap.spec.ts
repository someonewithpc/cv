import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 1440, height: 1000 } });

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.emulateMedia({ media: 'print' });
});

test('the Open Source header prints as one piece and lets the first card move on alone', async ({ page }) => {
  const header = page.locator('#open-source .intro > header');
  await expect(header).toHaveCSS('break-inside', 'avoid');
  await expect(header).toHaveCSS('break-after', 'auto');
  await expect(header.locator('.stats')).toHaveCSS('break-after', 'auto');
});

test('the stats keep 12rem clear under them so the header never ends a page', async ({ page }) => {
  const tail = await page
    .locator('#open-source .intro > header .stats')
    .evaluate((stats) => {
      const after = getComputedStyle(stats, '::after');
      return { content: after.content, height: after.height, marginBottom: after.marginBottom };
    });
  expect(tail).toEqual({ content: '""', height: '192px', marginBottom: '-192px' });
});

test('on screen the stats have no tail', async ({ page }) => {
  await page.emulateMedia({ media: 'screen' });
  const content = await page
    .locator('#open-source .intro > header .stats')
    .evaluate((stats) => getComputedStyle(stats, '::after').content);
  expect(content).toBe('none');
});
