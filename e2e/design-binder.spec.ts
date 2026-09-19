import { expect, test } from '@playwright/test';

const TABS = ['#cover', '#materials', '#demos', '#open-source'];

test('the index tabs link to the four divider sheets in page order', async ({ page }) => {
  await page.goto('/');

  const tabs = page.locator('nav.binder-tabs a');
  await expect(tabs).toHaveCount(TABS.length);
  for (const [i, hash] of TABS.entries()) {
    await expect(tabs.nth(i)).toHaveAttribute('href', hash);
    await expect(page.locator(hash)).toHaveCount(1);
    expect(await page.locator(hash).evaluate((el) => !!el.closest('.divider'))).toBe(true);
  }

  const tops = await page.locator('.divider').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().top));
  expect(tops).toEqual([...tops].sort((a, b) => a - b));
});

test('a tab scrolls its sheet under the strip and marks itself current', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');

  await page.locator('nav.binder-tabs a[href="#demos"]').click();
  await expect(page).toHaveURL(/#demos$/);
  await expect.poll(() => page.locator('#demos').evaluate((el) => el.getBoundingClientRect().top)).toBeLessThan(80);
  await expect(page.locator('nav.binder-tabs a[href="#demos"]')).toHaveAttribute('aria-current', 'location');
  await expect(page.locator('nav.binder-tabs a[aria-current]')).toHaveCount(1);
});

test('the current tab follows the sheet as the page scrolls', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');

  await expect(page.locator('nav.binder-tabs a[href="#cover"]')).toHaveAttribute('aria-current', 'location');

  await page.locator('#open-source').evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await expect(page.locator('nav.binder-tabs a[href="#open-source"]')).toHaveAttribute('aria-current', 'location');
  await expect(page.locator('nav.binder-tabs a[href="#cover"]')).not.toHaveAttribute('aria-current', 'location');

  // The rail stays on screen while the sheets scroll past.
  const rail = await page.locator('nav.binder-tabs').boundingBox();
  expect(rail).not.toBeNull();
  expect(rail!.y).toBeGreaterThanOrEqual(0);
  expect(rail!.y + rail!.height).toBeLessThanOrEqual(900);
});

test('a phone gets the tabs as a strip along the top and no sideways scroll', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.waitForTimeout(500);

  const nav = page.locator('nav.binder-tabs');
  await expect(nav).toHaveCSS('position', 'fixed');
  const strip = await nav.boundingBox();
  expect(strip!.y).toBe(0);
  expect(strip!.x + strip!.width).toBeLessThanOrEqual(390);

  await expect(page.locator('.binder-rings')).toBeHidden();

  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(overflow.scrollWidth).toBe(overflow.clientWidth);
});
