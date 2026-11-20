import { expect, test, type Page } from '@playwright/test';

const nav = (page: Page) => page.locator('nav.sheet-nav');

const box = (page: Page, selector: string) =>
  page.locator(selector).first().evaluate((el) => el.getBoundingClientRect().toJSON() as DOMRect);

/** Scrolls the page so the cover's index is well above the window, and waits for the index to
    come to rest at the top of the window or, beside the folios, at the foot of the margin. */
const scrollPastCover = async (page: Page) => {
  await page.evaluate(() => window.scrollTo(0, 2400));
  await expect
    .poll(() =>
      nav(page).evaluate((el) => {
        // The stuck look, not only the stuck box: the scroll-state query that gives it answers
        // in the frame after the box reaches the top.
        const rect = el.getBoundingClientRect();
        return (rect.top === 0 && rect.left === 0) || getComputedStyle(el).position === 'fixed';
      }),
    )
    .toBe(true);
};

/** The slip is last on the cover, as wide as the title block and 1rem below what comes before it. */
const expectOnCover = async (page: Page) => {
  const slip = await box(page, '.sheet-nav');
  const titleBlock = await box(page, '.title-block');
  const above = await page.locator('.sheet-nav-room').evaluate((room) =>
    room.previousElementSibling!.getBoundingClientRect().toJSON() as DOMRect);
  expect(slip.left).toBeCloseTo(titleBlock.left, 0);
  expect(slip.right).toBeCloseTo(titleBlock.right, 0);
  expect(slip.top - above.bottom).toBeCloseTo(16, 0);
};

test('the index is position: sticky, and nothing above it stops it sticking', async ({ page }) => {
  await page.goto('/');
  const pin = page.locator('.sheet-nav-pin');
  await expect(pin).toHaveCSS('position', 'sticky');
  await expect(pin).toHaveCSS('top', '0px');
  const blockers = await pin.evaluate((el) => {
    const found: string[] = [];
    for (let node = el.parentElement; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      const label = node.id || node.className || node.tagName;
      if (!['visible', 'clip'].includes(style.overflowY) || !['visible', 'clip'].includes(style.overflowX)) {
        found.push(`${label}: overflow ${style.overflowX} ${style.overflowY}`);
      }
      if (style.transform !== 'none' || style.contain !== 'none') found.push(`${label}: transform or contain`);
    }
    return found;
  });
  expect(blockers).toEqual([]);
});

test('the index stays on the cover until the cover scrolls away, and the page under it does not move', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');

  await expectOnCover(page);
  await expect(nav(page)).toHaveCSS('position', 'static');
  const demosTop = await page.locator('#demos').evaluate((el) => el.getBoundingClientRect().top + window.scrollY);

  await scrollPastCover(page);
  await expect(nav(page)).toHaveCSS('position', 'fixed');
  expect(await page.locator('#demos').evaluate((el) => el.getBoundingClientRect().top + window.scrollY)).toBe(demosTop);

  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(nav(page)).toHaveCSS('position', 'static');
  await expectOnCover(page);
});

test('it takes its stuck look by the frame after the cover passes, with no animation', async ({ page }) => {
  for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/');
    const settled = await nav(page).evaluate(async (el) => {
      const room = document.querySelector('.sheet-nav-room')!;
      scrollTo(0, room.getBoundingClientRect().top + scrollY + 200);
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
      const rect = el.getBoundingClientRect();
      return { animations: el.getAnimations().length, top: rect.top, left: rect.left, fixed: getComputedStyle(el).position === 'fixed' };
    });
    expect(settled.animations, `${viewport.width}: no animation`).toBe(0);
    expect((settled.top === 0 && settled.left === 0) || settled.fixed, `${viewport.width}: stuck by the next frame`).toBe(true);
  }
});

test('beside the folios it lies in the desk margin, clear of the paper', async ({ page }) => {
  for (const width of [1216, 1440, 1680, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await expectOnCover(page);
    await scrollPastCover(page);

    const slip = await box(page, '.sheet-nav ol');
    const mat = await box(page, '#demos .cutting-mat');
    // The folio standing beside the window, stuck at the top of its rail.
    const folio = await page.locator('.folio').evaluateAll((folios) =>
      folios.map((el) => el.getBoundingClientRect().toJSON() as DOMRect).find((rect) => rect.top >= 0 && rect.top < 100)!,
    );
    expect(slip.left, `${width}: on screen`).toBeGreaterThanOrEqual(0);
    expect(slip.right, `${width}: clear of the mat`).toBeLessThanOrEqual(mat.left);
    expect(slip.bottom, `${width}: inside the window`).toBeLessThanOrEqual(900);
    expect(slip.top, `${width}: under the folio`).toBeGreaterThan(folio.bottom);
    // Centred in the folio's rail, as the folio is.
    expect(slip.left + slip.right).toBeCloseTo(mat.left, -1);
    await expect(page.locator('.sheet-nav a')).toHaveCount(5);
    for (const link of await page.locator('.sheet-nav a').all()) await expect(link).toBeVisible();
  }
});

test('a link in the stuck index jumps to its sheet and marks it as the one being read', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await scrollPastCover(page);

  await nav(page).getByRole('link', { name: 'Career' }).click();
  await expect(page).toHaveURL(/#career$/);
  await expect(nav(page).getByRole('link', { name: 'Career' })).toHaveAttribute('aria-current', 'location');
  await expect(nav(page).locator('[aria-current]')).toHaveCount(1);

  await nav(page).getByRole('link', { name: 'Hugo Sales' }).click();
  await expect(nav(page)).toHaveCSS('position', 'static');
  await expect(nav(page).getByRole('link', { name: 'Hugo Sales' })).toHaveAttribute('aria-current', 'location');
});

test('the sheets under the index still take clicks', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  // Just under the slip on the cover, where the rail it hangs from starts: the first sheet.
  const slip = await box(page, '.sheet-nav');
  const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('.sheet-nav-rail') !== null, [slip.left + slip.width / 2, slip.bottom + 60]);
  expect(hit, 'the rail lets the point through').toBe(false);
});

for (const viewport of [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
  { width: 1000, height: 800 },
]) {
  test(`at ${viewport.width}px the cover's row pins to the top, one line up to the theme picker`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await expectOnCover(page);
    const onCover = await box(page, '.sheet-nav');
    await scrollPastCover(page);

    const strip = await box(page, '.sheet-nav');
    const picker = await box(page, '#theme-picker');
    expect(strip.top).toBe(0);
    expect(strip.left).toBe(0);
    expect(strip.right, 'stops at the theme picker').toBeCloseTo(picker.left, 0);
    // One line of links, never taller than it was as one line on the cover.
    expect(strip.height).toBeLessThanOrEqual(40);
    expect(strip.height).toBeLessThanOrEqual(onCover.height);

    const links = nav(page).getByRole('link');
    await expect(links).toHaveCount(5);
    const tops = await links.evaluateAll((all) => all.map((link) => Math.round(link.getBoundingClientRect().top)));
    expect(new Set(tops).size, 'all on one line').toBe(1);

    // A jump lands its sheet under the strip, and the strip scrolls to show it as current.
    await links.filter({ hasText: 'Open Source' }).evaluate((link: HTMLElement) => link.click());
    await expect(page).toHaveURL(/#open-source$/);
    await expect(page.locator('#open-source')).toBeFocused();
    const current = nav(page).getByRole('link', { name: 'Open Source' });
    await expect(current).toHaveAttribute('aria-current', 'location');
    await expect(nav(page).locator('[aria-current]')).toHaveCount(1);
    await expect
      .poll(async () => {
        const link = await current.boundingBox();
        return !!link && link.x >= 0 && link.x + link.width <= picker.left + 1;
      }, { message: 'the current sheet scrolled into the strip' })
      .toBe(true);
    await expect
      .poll(async () => (await box(page, '#open-source')).top, { message: 'the sheet starts just below the strip' })
      .toBeGreaterThanOrEqual(strip.bottom - 1);
    const margin = await page.locator('#open-source').evaluate((el) => parseFloat(getComputedStyle(el).scrollMarginTop));
    expect((await box(page, '#open-source')).top).toBeCloseTo(margin, 0);

    // Tab walks the links in the strip, scrolling each into view.
    await nav(page).getByRole('link', { name: 'Hugo Sales' }).focus();
    for (const name of ['Demos', 'Career', 'Skills', 'Open Source']) {
      await page.keyboard.press('Tab');
      await expect(nav(page).getByRole('link', { name })).toBeFocused();
    }
  });
}

test('at a phone width the row scrolls inside its strip, not the page', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/');
  const row = page.locator('.sheet-nav ol');
  // On the cover too: the slip is one line at every width.
  expect(await row.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  await scrollPastCover(page);
  expect(await row.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  await expect(row).toHaveCSS('overflow-x', 'auto');
});

test('under reduced motion the strip jumps to the current sheet without gliding', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await scrollPastCover(page);
  await nav(page).getByRole('link', { name: 'Open Source' }).evaluate((link: HTMLElement) => link.click());
  await expect(nav(page).getByRole('link', { name: 'Open Source' })).toHaveAttribute('aria-current', 'location');
  const row = page.locator('.sheet-nav ol');
  const first = await row.evaluate(async (el) => {
    await new Promise(requestAnimationFrame);
    return el.scrollLeft;
  });
  await page.waitForTimeout(400);
  expect(first).toBeGreaterThan(0);
  expect(await row.evaluate((el) => el.scrollLeft)).toBe(first);
});

test('the index stays out of print, stuck or not', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await scrollPastCover(page);
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.sheet-nav-rail')).toBeHidden();
  await expect(page.locator('.sheet-nav-room')).toBeHidden();
  await expect(nav(page)).toBeHidden();
});
