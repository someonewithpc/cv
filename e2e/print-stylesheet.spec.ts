import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 1440, height: 1000 } });

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('the print rules load from their own sheet, off the render-blocking one', async ({ page }) => {
  const links = page.locator('link[rel="stylesheet"]');
  const print = links.and(page.locator('[media="print"]'));
  await expect(print).toHaveCount(1);

  const screenHasPrintRules = await page.evaluate(() =>
    [...document.styleSheets]
      .filter((sheet) => sheet.media.mediaText !== 'print')
      .some((sheet) => [...sheet.cssRules].some((rule) => rule instanceof CSSMediaRule && rule.media.mediaText === 'print')),
  );
  expect(screenHasPrintRules, 'a screen stylesheet carries @media print rules').toBe(false);
});

test('print drops the desk, the theme picker and the whole demos band', async ({ page }) => {
  await page.emulateMedia({ media: 'print' });

  await expect(page.locator('#theme-picker')).toBeHidden();
  await expect(page.locator('#theme-picker-transition-background')).toBeHidden();
  await expect(page.locator('.folio-rail').first()).toBeHidden();
  await expect(page.locator('#main')).toHaveCSS('background-image', 'none');

  // The demos run in the browser; on paper the band goes whole, stacks, callouts, cards,
  // hints and heading, and the contributions follow the bill of materials.
  await expect(page.locator('#demos')).toBeHidden();
  await expect(page.locator('#demos-heading')).toBeHidden();
  await expect(page.locator('[data-paper-stack-root]').first()).toBeHidden();
  await expect(page.locator('.callout').first()).toBeHidden();
  await expect(page.locator('.flip-hints').first()).toBeHidden();
  await expect(page.locator('.demo-transport').first()).toBeHidden();

  const order = await page.evaluate(() =>
    Array.from(document.getElementById('main')!.children)
      .filter((el) => el.id && el.getBoundingClientRect().height > 0)
      .map((el) => el.id),
  );
  expect(order).toEqual(['profile', 'career', 'bill-of-materials', 'open-source']);
});

test('the contributions print one line per entry, closed', async ({ page }) => {
  await page.emulateMedia({ media: 'print' });

  const rows = page.locator('#open-source details');
  expect(await rows.count()).toBeGreaterThan(0);
  for (const row of await rows.all()) {
    await expect(row).toBeHidden();
  }

  const heights = await page.locator('#open-source .row').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height));
  const lineHeight = 20;
  for (const height of heights) {
    expect(height).toBeLessThanOrEqual(lineHeight * 1.5 * 3 + 1);
  }
});

for (const theme of ['light', 'dark', 'arctic', 'dark-forest']) {
  test(`print comes out light with the OS dark and the ${theme} theme picked`, async ({ page }) => {
    await page.evaluate((id) => {
      document.documentElement.dataset.theme = id;
    }, theme);
    await page.emulateMedia({ media: 'print', colorScheme: 'dark' });

    const colours = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      const context = canvas.getContext('2d')!;
      const luminance = (colour: string) => {
        context.fillStyle = colour;
        context.fillRect(0, 0, 1, 1);
        const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
        return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      };
      const table = document.querySelector('#career ol')!;
      const cell = document.querySelector('#career .cell')!;
      const read = (el: Element) => ({ ink: luminance(getComputedStyle(el).color), paper: luminance(getComputedStyle(document.body).backgroundColor) });
      return {
        scheme: getComputedStyle(document.documentElement).colorScheme,
        kind: getComputedStyle(document.documentElement).getPropertyValue('--theme-kind').trim(),
        table: read(table),
        cell: read(cell),
      };
    });

    expect(colours.scheme).toBe('light');
    expect(colours.kind).toBe('light');
    for (const sample of [colours.table, colours.cell]) {
      expect(sample.paper).toBeGreaterThan(0.9);
      expect(sample.ink).toBeLessThan(0.3);
    }
  });
}

test('nothing overlaps the title block, and its corner accents print through their mask', async ({ page }) => {
  await page.emulateMedia({ media: 'print' });

  const profile = page.locator('#profile');
  const profileBox = await profile.boundingBox();
  expect(profileBox).not.toBeNull();

  const adjust = await page.locator('#profile .title-block').evaluate((el) => getComputedStyle(el, '::after').printColorAdjust);
  expect(adjust).toBe('exact');

  const siblingBoxes = await page.evaluate(() => {
    const profileEl = document.getElementById('profile')!;
    const main = document.getElementById('main')!;
    return Array.from(main.children)
      .filter((el) => el !== profileEl)
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.height > 0);
  });

  for (const box of siblingBoxes) {
    const overlapsVertically = box.top < profileBox!.y + profileBox!.height && box.bottom > profileBox!.y;
    const overlapsHorizontally = box.left < profileBox!.x + profileBox!.width && box.right > profileBox!.x;
    expect(overlapsVertically && overlapsHorizontally, `a section overlaps the title block at ${JSON.stringify(box)}`).toBe(false);
  }
});
