import { expect, test } from '@playwright/test';

const MATERIALS = ['desk', 'kraft', 'mat', 'vellum', 'ledger'];

test('the page is five full-bleed bands, each on its own material', async ({ page }) => {
  await page.goto('/');

  const bands = page.locator('main .band');
  await expect(bands).toHaveCount(MATERIALS.length);

  const painted = await bands.evaluateAll((els) =>
    els.map((el) => ({
      material: [...el.classList].find((name) => name.startsWith('band-')),
      background: getComputedStyle(el).backgroundColor,
      left: el.getBoundingClientRect().left,
      right: el.getBoundingClientRect().right,
    })),
  );
  expect(painted.map((band) => band.material)).toEqual(MATERIALS.map((name) => `band-${name}`));

  // Neighbouring bands never share a surface, and every band runs edge to edge.
  const width = await page.evaluate(() => document.documentElement.clientWidth);
  for (const [index, band] of painted.entries()) {
    expect(band.left, `${band.material} starts at the edge`).toBe(0);
    expect(band.right, `${band.material} ends at the edge`).toBe(width);
    if (index > 0) {
      expect(band.background, `${band.material} differs from the band above`).not.toBe(painted[index - 1].background);
    }
  }
});

test('every band carries its sheet number', async ({ page }) => {
  await page.goto('/');

  const folios = page.locator('main .band .folio');
  await expect(folios).toHaveCount(MATERIALS.length);
  for (const [index, folio] of (await folios.all()).entries()) {
    await expect(folio).toContainText(String(index + 1).padStart(2, '0'));
    await expect(folio).toContainText(`Sheet ${index + 1} / ${MATERIALS.length}`);
  }
});

test('on a wide viewport the sheet number sits in the margin, left of the content', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');

  const rail = page.locator('#demos .folio-rail');
  await expect(rail).toHaveCSS('position', 'absolute');

  const railRight = await rail.evaluate((el) => el.getBoundingClientRect().right);
  const headingLeft = await page.getByRole('heading', { name: 'Demos' }).evaluate((el) => el.getBoundingClientRect().left);
  expect(railRight).toBeLessThanOrEqual(headingLeft);
});

test('every second deck paragraph is set from the right edge', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');

  const ledes = page.locator('#demos .demo-lede');
  await expect(ledes).toHaveCount(3);
  await expect(ledes.nth(0)).toHaveCSS('text-align', 'start');
  await expect(ledes.nth(1)).toHaveCSS('text-align', 'right');
  await expect(ledes.nth(2)).toHaveCSS('text-align', 'start');

  const [first, second] = await ledes.evaluateAll((els) => els.map((el) => el.getBoundingClientRect()));
  expect(second.right).toBeGreaterThan(first.right);
});

test('a phone viewport keeps the bands and their numbers inside the screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.waitForTimeout(500);

  const rail = page.locator('#demos .folio-rail');
  await expect(rail).toHaveCSS('position', 'static');

  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(overflow.scrollWidth).toBe(overflow.clientWidth);
});
