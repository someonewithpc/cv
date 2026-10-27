import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 1440, height: 1000 } });

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.emulateMedia({ media: 'print' });
});

test('section headers print on the page with what follows them', async ({ page }) => {
  for (const header of [
    page.locator('#career > header'),
    page.locator('#open-source .intro > header'),
    page.locator('.cloud-label-row'),
  ]) {
    await expect(header).toHaveCSS('break-after', 'avoid');
    await expect(header).toHaveCSS('break-inside', 'avoid');
  }

  await expect(page.locator('#open-source .intro > header .stats')).toHaveCSS('break-after', 'avoid');
  await expect(page.locator('#career .revisions > h3')).toHaveCSS('break-after', 'avoid');
  await expect(page.locator('#career .table > .head')).toHaveCSS('break-after', 'avoid');
});

test('highlight cards and career rows print whole', async ({ page }) => {
  const cards = page.locator('#open-source .intro > article');
  const rows = page.locator('#career .row');
  await expect(cards).not.toHaveCount(0);
  await expect(rows).not.toHaveCount(0);

  for (const card of await cards.all()) await expect(card).toHaveCSS('break-inside', 'avoid');
  for (const row of await rows.all()) await expect(row).toHaveCSS('break-inside', 'avoid');
});

test('on screen the cards may break', async ({ page }) => {
  await page.emulateMedia({ media: 'screen' });
  await expect(page.locator('#open-source .intro > article').first()).toHaveCSS('break-inside', 'auto');
});
