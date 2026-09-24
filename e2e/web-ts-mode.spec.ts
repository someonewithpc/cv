import { expect, test, type Locator, type Page } from '@playwright/test';

import { frontPage, frontPageIndex, frontPageName, swipeStack } from './support/paperStack';

const PAGES = ['web-ts-mode', 'Parser Ranges', 'Selector Depth Hue', 'web-ts doctor'];

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

function webTsStack(page: Page) {
  // By title, not by position: the demos run gains stacks over time.
  return page.locator('article.technical-drawing-stack').filter({
    has: page.locator('h2.typewriter', { hasText: 'web-ts-mode' }),
  });
}

async function liveBuffer(page: Page): Promise<Locator> {
  const stack = webTsStack(page);
  await stack.scrollIntoViewIfNeeded();
  return frontPage(stack, await frontPageIndex(stack)).locator('[data-web-ts-buffer]');
}

test('web-ts-mode: forward swipes visit every page in order, then wrap', async ({ page }) => {
  const stack = webTsStack(page);
  await stack.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);

  expect(await stack.locator(':scope > div').count()).toBe(PAGES.length);
  expect(await frontPageName(stack)).toBe(PAGES[0]);

  for (let i = 1; i < PAGES.length; i += 1) {
    await swipeStack(page, stack, true);
    expect(await frontPageName(stack), `page ${i} after ${i} forward swipe(s)`).toBe(PAGES[i]);
  }

  await swipeStack(page, stack, true);
  expect(await frontPageName(stack)).toBe(PAGES[0]);
});

test('main page: a captured buffer, cut into the ranges each parser is handed', async ({ page }) => {
  const buffer = await liveBuffer(page);

  await expect(buffer).toContainText('Captured buffer');
  await expect(buffer).toContainText('not a live parser');

  // The frontmatter and the style body are whole-line blocks; the interpolations and the
  // attribute expression sit inside their lines.
  await expect(buffer.locator('.block[data-lang="tsx"]')).toContainText('type Props');
  await expect(buffer.locator('.block[data-lang="scss"]').first()).toContainText('margin-bottom');
  await expect(buffer.locator('.range[data-lang="tsx"]')).toHaveCount(4);
  await expect(buffer.locator('.range[data-lang="tsx"]', { hasText: 'headingId' })).toHaveCount(1);

  // The braces stay with the Astro parser: the offset leaves them out of the range.
  const interpolation = buffer.locator('.range', { hasText: 'sheetCode' });
  await expect(interpolation).toHaveText('sheetCode');
});

test('main page: the toggle shows and hides the range outlines', async ({ page }) => {
  const buffer = await liveBuffer(page);
  const toggle = buffer.locator('.show-ranges');
  const block = buffer.locator('.block[data-lang="tsx"]');
  const outline = () => block.evaluate((el) => getComputedStyle(el).outlineStyle);

  await expect(toggle).toBeChecked();
  expect(await outline()).toBe('dashed');

  await toggle.uncheck();
  expect(await outline()).not.toBe('dashed');
});

test('main page: pointing at a token lights up the range that owns it', async ({ page }) => {
  const buffer = await liveBuffer(page);
  const echo = buffer.locator('.echo');
  const visibleEcho = () => echo.locator('span').filter({ visible: true });

  await expect(visibleEcho()).toHaveText(/Point at the buffer/);

  const interpolation = buffer.locator('.range', { hasText: 'sheetCode' });
  const idle = await interpolation.evaluate((el) => getComputedStyle(el).backgroundColor);
  await interpolation.hover();
  await expect(visibleEcho()).toHaveText("tsx · element (html_interpolation), :offset '(1 . -1) · :local t");
  expect(await interpolation.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(idle);

  await buffer.locator('.block[data-lang="scss"]').first().hover();
  await expect(visibleEcho()).toHaveText(/^scss · style_element \(raw_text\)/);

  // Markup outside every embedded range belongs to the Astro parser itself.
  await buffer.locator('.line', { hasText: '<header>' }).first().hover();
  await expect(visibleEcho()).toHaveText(/^astro · the primary parser/);
});

test('depth page: each selector level gets its own hue, and nesting starts again at 0', async ({ page }) => {
  const stack = webTsStack(page);
  const depthPage = stack.locator(':scope > div').filter({
    has: page.locator('h2.typewriter', { hasText: 'Selector Depth Hue' }),
  });
  const snippet = depthPage.locator('.snippet');

  const depthOf = (text: string) => snippet
    .locator('.f-selector', { hasText: text })
    .first()
    .evaluate((el) => (el as HTMLElement).style.getPropertyValue('--depth') || '0');

  expect(await depthOf('.note-card')).toBe('2');
  expect(await depthOf('.note-fold')).toBe('4');
  expect(await depthOf('.content')).toBe('0');

  // One colour per depth, all different.
  const colours = await depthPage.locator('.scale .swatch').evaluateAll((swatches) =>
    swatches.map((swatch) => getComputedStyle(swatch).backgroundColor),
  );
  expect(colours).toHaveLength(6);
  expect(new Set(colours).size).toBe(6);
});

test('doctor page: the report keeps the real layout and says what is missing', async ({ page }) => {
  const stack = webTsStack(page);
  const doctor = stack.locator(':scope > div').filter({
    has: page.locator('h2.typewriter', { hasText: 'web-ts doctor' }),
  });

  const report = doctor.locator('.flow');
  await expect(report).toContainText('web-ts-mode doctor');
  await expect(report).toContainText('jsdoc: MISSING');
  await expect(report).toContainText('Install with: npm run grammars');
  await expect(report).toContainText('client: eglot');
  // Vue is found, and the sheet says in so many words that found is not complete.
  await expect(report).toContainText('vue: found');
  await expect(doctor.locator('.notes')).toContainText('Volar 3.x needs lsp-mode');
});
