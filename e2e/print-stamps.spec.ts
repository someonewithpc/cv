import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 1440, height: 1000 } });

test('print leaves out the DWG line and the sheet codes', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.title-block .sheet-meta')).toBeVisible();
  await expect(page.locator('.sheet-code').first()).toBeVisible();

  await page.emulateMedia({ media: 'print' });

  await expect(page.locator('.title-block .sheet-meta')).toBeHidden();
  const codes = page.locator('.sheet-code');
  expect(await codes.count()).toBeGreaterThan(0);
  for (const code of await codes.all()) await expect(code).toBeHidden();
  await expect(page.locator('.title-block h1')).toBeVisible();
});

test('print keeps the career revision column the timeline refers to', async ({ page }) => {
  await page.goto('/');
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.revisions .table .row > .rev').first()).toBeVisible();
});
