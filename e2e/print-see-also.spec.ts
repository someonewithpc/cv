import { expect, test } from '@playwright/test';

// An A4 sheet is 794 CSS px wide, so the layout matches the printed page.
test.use({ viewport: { width: 794, height: 1123 } });

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.emulateMedia({ media: 'print' });
});

test('print leaves out the See also cell and keeps the other cells two to a row', async ({ page }) => {
  const cells = page.locator('#career .cells .cell');
  await expect(cells.filter({ has: page.locator('.refs') })).toBeHidden();

  const boxes = await cells.evaluateAll((els) =>
    els.filter((el) => el.getBoundingClientRect().height > 0).map((el) => el.getBoundingClientRect()),
  );
  expect(boxes).toHaveLength(4);
  const widths = new Set(boxes.map((b) => Math.round(b.width)));
  expect(widths.size).toBe(1);
  const rows = new Set(boxes.map((b) => Math.round(b.top)));
  expect(rows.size).toBe(2);
});

test('the demos link prints the site address in full, the GNU social one stays as it is', async ({ page }) => {
  const demos = page.locator('#career .see').filter({ has: page.locator('a[href="#demos"]') });
  await expect(demos).toHaveCount(1);
  const text = await demos.evaluate(
    (p) =>
      p.textContent!.trim() +
      getComputedStyle(p.querySelector('a[href="#demos"]')!, '::after').content.replaceAll('"', '') +
      getComputedStyle(p, '::after').content.replaceAll('"', ''),
  );
  expect(text.replace(/\s+/g, ' ')).toBe('See Demos at https://hsal.es');
  await expect(demos).toHaveCSS('text-transform', 'uppercase');
  expect(await demos.evaluate((p) => getComputedStyle(p, '::after').textTransform)).toBe('none');

  const other = page.locator('#career .see').filter({ hasNot: page.locator('a[href="#demos"]') });
  expect(await other.first().evaluate((p) => getComputedStyle(p, '::after').content)).toBe('none');
});
