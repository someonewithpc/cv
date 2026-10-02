import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 1440, height: 1000 } });

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.emulateMedia({ media: 'print' });
});

test('print drops the desk, the theme picker, the transport decks and the hint arrows', async ({ page }) => {
  await expect(page.locator('#theme-picker')).toBeHidden();
  await expect(page.locator('#theme-picker-transition-background')).toBeHidden();
  await expect(page.locator('.folio-rail').first()).toBeHidden();

  const transports = page.locator('.demo-transport');
  for (const transport of await transports.all()) {
    await expect(transport).toBeHidden();
  }

  const hints = page.locator('.flip-hints');
  for (const hint of await hints.all()) {
    await expect(hint).toBeHidden();
  }

  await expect(page.locator('#main')).toHaveCSS('background-image', 'none');
});

test('every stack prints every page, laid out down the page with none overlapping', async ({ page }) => {
  const stacks = page.locator('[data-paper-stack-root][data-paper-stack]');
  const stackCount = await stacks.count();
  expect(stackCount, 'the page shows no demo stack').toBeGreaterThan(0);

  for (const stack of await stacks.all()) {
    const pageCount = Number(await stack.getAttribute('data-page-count'));
    expect(pageCount).toBeGreaterThan(0);

    const pages = stack.locator('> div');
    await expect(pages).toHaveCount(pageCount);

    const boxes = [];
    for (const sheet of await pages.all()) {
      await expect(sheet).toBeVisible();
      const box = await sheet.boundingBox();
      expect(box, 'a printed page with no box').not.toBeNull();
      boxes.push(box!);
    }

    // Down the page, in order: each page starts no higher than the one before it ends.
    for (let i = 1; i < boxes.length; i++) {
      expect(boxes[i].y, `page ${i + 1} overlaps page ${i}`).toBeGreaterThanOrEqual(boxes[i - 1].y + boxes[i - 1].height - 1);
    }
  }
});

test('print keeps the light paper theme and expands the contributions', async ({ page }) => {
  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'dark';
  });

  const bodyBackground = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  // --theme-paper's light value (ThemePicker.astro), forced regardless of data-theme.
  expect(bodyBackground).toBe('oklch(1 0 90)');

  const rows = page.locator('#open-source details');
  const rowCount = await rows.count();
  expect(rowCount).toBeGreaterThan(0);

  for (const row of await rows.all()) {
    const body = row.locator('.body');
    await expect(body).toBeVisible();
  }
});

test('nothing overlaps the title block', async ({ page }) => {
  const profile = page.locator('#profile');
  const profileBox = await profile.boundingBox();
  expect(profileBox).not.toBeNull();

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
