import { expect, test } from '@playwright/test';

const opacity = (el: import('@playwright/test').Locator) =>
  el.evaluate((node) => Number(getComputedStyle(node).opacity));

test('every section and demo title has an anchor to an existing id', async ({ page }) => {
  await page.goto('/');
  const anchors = page.locator('a.anchor');
  // Career, bill of materials, demos, open source, and the fifteen demo callouts.
  expect(await anchors.count()).toBeGreaterThanOrEqual(19);

  for (const anchor of await anchors.all()) {
    await expect(anchor).toHaveAttribute('aria-label', 'Link to this section');
    const href = await anchor.getAttribute('href');
    expect(href).toMatch(/^#[a-z0-9-]+$/);
    await expect(page.locator(`[id="${href!.slice(1)}"]`), `no element for ${href}`).toHaveCount(1);
  }
});

test('the link shows on hover and focus, stays in the tab order, and sets the fragment', async ({ page }) => {
  await page.goto('/');
  const heading = page.locator('#career-heading');
  const anchor = page.locator('a.anchor[href="#career"]');

  expect(await opacity(anchor)).toBe(0);
  await heading.hover();
  await expect.poll(() => opacity(anchor)).toBe(1);

  await page.mouse.move(0, 0);
  await expect.poll(() => opacity(anchor)).toBe(0);
  await anchor.focus();
  await expect(anchor).toBeFocused();
  await expect.poll(() => opacity(anchor)).toBe(1);

  await anchor.press('Enter');
  await expect(page).toHaveURL(/#career$/);
});

test('the link stands beside the title, clear of the heading text', async ({ page }) => {
  await page.goto('/');
  for (const [heading, anchor] of [
    ['#career-heading', 'a.anchor[href="#career"]'],
    ['#demos-heading', 'a.anchor[href="#demos"]'],
    ['#open-source-heading', 'a.anchor[href="#open-source"]'],
    ['#detail-a .callout-text', 'a.anchor[href="#detail-a"]'],
  ]) {
    const h = (await page.locator(heading).boundingBox())!;
    const a = (await page.locator(anchor).boundingBox())!;
    expect(a.x, `${anchor} overlaps ${heading}`).toBeGreaterThanOrEqual(h.x + h.width - 1);
  }
});
