import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 1440, height: 1000 } });

test('print hides every Japanese gloss and keeps the English and the sheet stamps', async ({ page }) => {
  await page.goto('/');
  await page.emulateMedia({ media: 'print' });

  const glosses = page.locator('#career [lang="ja"], #open-source [lang="ja"]');
  expect(await glosses.count()).toBeGreaterThan(10);
  const displays = await page.locator('[lang="ja"]').evaluateAll((els) => els.map((el) => getComputedStyle(el).display));
  expect(new Set(displays)).toEqual(new Set(['none']));

  await expect(page.locator('#career-heading')).toHaveText(/Career/i);
  await expect(page.locator('#career dt', { hasText: 'Education' })).toBeVisible();
  await expect(page.locator('#career .sheet-code')).toHaveText(/SH-CV\s*\/\s*REV A/);
  await expect(page.locator('#open-source .sheet-code')).toHaveText(/SH-OSS\s*\/\s*REV A/);

  await page.emulateMedia({ media: 'screen' });
  await expect(page.locator('#career-heading [lang="ja"]')).toBeVisible();
});
