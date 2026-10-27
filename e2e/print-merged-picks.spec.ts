import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 1440, height: 1000 } });

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('the screen lists every contribution and hides the print line', async ({ page }) => {
  const rows = page.locator('#open-source .row');
  expect(await rows.count()).toBeGreaterThan(20);
  await expect(page.locator('#open-source section[data-group="closed"]')).toBeVisible();
  await expect(page.locator('#open-source .print-only')).toBeHidden();
});

test('print keeps only the picked rows, the GCC fix and the Linux patches among them', async ({ page }) => {
  await page.emulateMedia({ media: 'print' });

  const all = page.locator('#open-source .row');
  const picked = page.locator('#open-source .row[data-print]');
  const total = await all.count();
  const picks = await picked.count();
  expect(picks).toBeGreaterThanOrEqual(12);
  expect(picks).toBeLessThanOrEqual(20);

  for (const row of await page.locator('#open-source .row:not([data-print])').all()) {
    await expect(row).toBeHidden();
  }
  for (const row of await picked.all()) {
    await expect(row).toBeVisible();
  }

  const shown = await picked.evaluateAll((rows) =>
    rows.map((row) => ({ status: row.getAttribute('data-status'), repository: row.querySelector('cite')!.textContent }))
  );
  expect(shown.some(({ repository }) => repository!.startsWith('gcc.gnu.org'))).toBe(true);
  expect(shown.filter(({ repository }) => repository === 'torvalds/linux')).toHaveLength(3);
  for (const { status, repository } of shown) {
    expect(status === 'merged' || repository === 'torvalds/linux', `${repository} is ${status}`).toBe(true);
  }

  await expect(page.locator('#open-source section[data-group="closed"]')).toBeHidden();
  await expect(page.locator('#group-closed')).toBeHidden();
  await expect(page.locator('#group-merged')).toBeHidden();
  await expect(page.locator('#group-open')).toBeHidden();
  await expect(page.locator('#open-source .stats')).toBeVisible();

  const line = page.locator('#open-source .print-only');
  await expect(line).toBeVisible();
  await expect(line).toHaveText(`The full list of ${total} contributions is at https://hsal.es/#open-source`);
});
