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

test('print drops the desk, the theme picker, the transport decks and the hint arrows', async ({ page }) => {
  await page.emulateMedia({ media: 'print' });

  await expect(page.locator('#theme-picker')).toBeHidden();
  await expect(page.locator('#theme-picker-transition-background')).toBeHidden();
  await expect(page.locator('.folio-rail').first()).toBeHidden();

  for (const transport of await page.locator('.demo-transport').all()) {
    await expect(transport).toBeHidden();
  }

  for (const hint of await page.locator('.flip-hints').all()) {
    await expect(hint).toBeHidden();
  }

  await expect(page.locator('#main')).toHaveCSS('background-image', 'none');
});

test('every stack prints every page at the sheet width, down the page, under its own heading', async ({ page }) => {
  await page.emulateMedia({ media: 'print' });

  const stacks = page.locator('[data-paper-stack-root][data-paper-stack]');
  const stackCount = await stacks.count();
  expect(stackCount, 'the page shows no demo stack').toBeGreaterThan(0);

  const sheetWidth = await page.locator('.callout').first().evaluate((el) => el.getBoundingClientRect().width);
  expect(sheetWidth).toBeGreaterThan(600);

  let index = 0;
  for (const stack of await stacks.all()) {
    const letter = await stack.locator('xpath=ancestor::section[contains(@class, "callout")]//*[contains(@class, "callout-letter")]').first().innerText();
    const pageCount = Number(await stack.getAttribute('data-page-count'));
    expect(pageCount).toBeGreaterThan(0);

    const pages = stack.locator('> div');
    await expect(pages).toHaveCount(pageCount);

    const boxes = [];
    let sheet = 0;
    for (const sheetEl of await pages.all()) {
      sheet++;
      await expect(sheetEl).toBeVisible();
      const box = await sheetEl.boundingBox();
      expect(box, 'a printed page with no box').not.toBeNull();
      expect(box!.width, `stack ${index + 1} page ${sheet} is narrower than the sheet`).toBeGreaterThanOrEqual(sheetWidth - 1);
      boxes.push(box!);

      const heading = await sheetEl.evaluate((el) => getComputedStyle(el, '::before').content);
      expect(heading).toContain('counter(print-sheet)');
      const rotate = await sheetEl.evaluate((el) => getComputedStyle(el).rotate);
      expect(rotate).toBe('none');
    }
    expect(letter.trim()).toHaveLength(1);

    for (let i = 1; i < boxes.length; i++) {
      expect(boxes[i].y, `page ${i + 1} overlaps page ${i}`).toBeGreaterThanOrEqual(boxes[i - 1].y + boxes[i - 1].height - 1);
    }
    index++;
  }

  // The fold mechanics and the note tab are off the paper.
  for (const selector of ['.paper-fold', '.paper-clip', '.note-fold', '.callout-card-leader']) {
    await expect(page.locator(selector).first()).toBeHidden();
  }
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
