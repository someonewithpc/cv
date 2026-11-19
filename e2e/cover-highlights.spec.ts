import { expect, test } from '@playwright/test';

const card = '#profile .cover-highlights';

test('the highlights card sits between the title block and the sheet index', async ({ page }) => {
  await page.goto('/');
  const order = await page.locator('#profile').evaluate((header) =>
    [...header.children].map((el) => el.className.split(' ')[0]));
  expect(order).toEqual(['title-block', 'cover-highlights', 'sheet-nav']);
});

test('every highlight links to an anchor that exists on the page', async ({ page }) => {
  await page.goto('/');
  const links = page.locator(`${card} a`);
  await expect(links.locator('.role')).toHaveText(['Linux contributor', 'GCC contributor', 'GNU social maintainer']);
  for (const href of await links.evaluateAll((as) => as.map((a) => a.getAttribute('href')!))) {
    expect(href).toMatch(/^#/);
    await expect(page.locator(href), `${href} has a target`).toHaveCount(1);
  }
});

for (const theme of ['light', 'dark', 'arctic', 'dark-forest']) {
  test(`the card is drawn on the title block's paper in the ${theme} theme`, async ({ page }) => {
    await page.addInitScript((id) => {
      try {
        localStorage.setItem('cv-theme', id);
      } catch {
        /* ignore */
      }
    }, theme);
    await page.goto('/');
    const { ink, paper, block } = await page.locator('#profile').evaluate((header) => ({
      ink: getComputedStyle(header.querySelector('.cover-highlights .role')!).color,
      paper: getComputedStyle(header.querySelector('.cover-highlights li')!).backgroundColor,
      block: getComputedStyle(header.querySelector('.title-block')!).backgroundColor,
    }));
    expect(paper).toBe(block);
    expect(ink).not.toBe(paper);
  });
}

for (const width of [360, 1440]) {
  test(`the card stays as wide as the title block and inside the window at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    const block = (await page.locator('#profile .title-block').boundingBox())!;
    const box = (await page.locator(card).boundingBox())!;
    expect(Math.abs(box.width - block.width)).toBeLessThan(1);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);

    const cells = await page.locator(`${card} li`).evaluateAll((lis) => lis.map((li) => li.getBoundingClientRect().top));
    if (width < 640) expect(new Set(cells).size).toBe(3);
    else expect(new Set(cells).size).toBe(1);
  });
}

test('the card prints with its cells outlined and no shadow', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await page.emulateMedia({ media: 'print' });
  const highlights = page.locator(card);
  await expect(highlights).toBeVisible();
  await expect(highlights).toHaveCSS('box-shadow', 'none');
  await expect(highlights.locator('li').first()).toHaveCSS('outline-style', 'solid');
});
