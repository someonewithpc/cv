import { expect, test, type Page } from '@playwright/test';

import { demoStack } from './support/paperStack';

/* The colour of the first `selector` token inside the code set by src/highlight.ts. */
const tokenColour = (page: Page, selector: string) =>
  page.locator(selector).first().evaluate((el) => getComputedStyle(el).color);

const pick = async (page: Page, theme: string) => {
  await page.evaluate((id) => localStorage.setItem('cv-theme', id), theme);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
};

test('code is coloured by kind from the theme on screen, inline and in blocks', async ({ page }) => {
  await page.goto('/');
  const picker = demoStack(page, 'Theme Picker');
  const logo = demoStack(page, 'Visrez Animated Loading Logo');

  // No colour is written into the markup: every token is a class.
  await expect(picker.locator('pre.hl [style*="color"], code.hl [style*="color"]')).toHaveCount(0);
  await expect(picker.locator('pre.hl .tok-keyword').first()).toHaveText('const');
  await expect(picker.locator('code.hl.selector .tok-selector').first()).toHaveText(/:root/);
  await expect(picker.locator('dd code.hl .tok-tag', { hasText: 'path' })).toHaveCount(1);
  await expect(logo.locator('pre.path-data-layer .tok-comment').first()).toContainText('--');

  const keyword = 'article[aria-label="Theme Picker"] pre.hl .tok-keyword';
  const inline = 'article[aria-label="Theme Picker"] code.hl.selector .tok-selector';
  const seen = new Set<string>();
  for (const theme of ['light', 'dark', 'arctic', 'dark-forest']) {
    await pick(page, theme);
    const [block, word, plain] = await Promise.all([
      tokenColour(page, keyword),
      tokenColour(page, inline),
      page.locator('article[aria-label="Theme Picker"] pre.hl').first().evaluate((el) => getComputedStyle(el).color),
    ]);
    // Inline and block code share the rules, and a keyword stands out from the plain text.
    expect(word).toBe(block);
    expect(block).not.toBe(plain);
    seen.add(block);
  }
  expect(seen.size).toBe(4);
});
