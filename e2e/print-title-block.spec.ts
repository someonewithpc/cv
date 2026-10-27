import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 1440, height: 1000 } });

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('print shows the IPA over the name with no checkbox, player or underline', async ({ page }) => {
  const block = page.locator('#profile .title-block');
  await page.emulateMedia({ media: 'print' });

  await expect(block.locator('.note-row')).toBeHidden();
  await expect(block.locator('audio')).toHaveCSS('display', 'none');

  const rt = block.locator('h1 rt');
  await expect(rt).toHaveText(['[ˈuɡu]', '[ˈsaləʃ]']);
  for (const one of await rt.all()) await expect(one).toHaveCSS('opacity', '1');

  for (const word of await block.locator('h1 span').all()) {
    await expect(word).toHaveCSS('text-decoration-line', 'none');
  }

  await expect(block.locator('.sheet-meta')).toHaveText(/DWG/);
});

test('print keeps the block as tall as its contents', async ({ page }) => {
  const block = page.locator('#profile .title-block');
  await page.emulateMedia({ media: 'print' });

  const gap = await block.evaluate((el) => {
    const last = el.querySelector('.contact')!.getBoundingClientRect().bottom;
    return el.getBoundingClientRect().bottom - last - parseFloat(getComputedStyle(el).paddingBottom);
  });
  expect(gap).toBeLessThan(1);
});
