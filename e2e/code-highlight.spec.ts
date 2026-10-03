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
  await expect(demoStack(page, 'schemaDef → Doctrine Metadata').locator('code .tok-function', { hasText: 'addDriver' })).toHaveCount(1);

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

test('the path data listing splits the d value into commands and numbers', async ({ page }) => {
  await page.goto('/');
  const listing = demoStack(page, 'Visrez Animated Loading Logo').locator('pre.path-data-layer');

  await expect(listing.locator('.tok-command')).toHaveText(['M', 'L', 'l', 'l', 'l', 'v', 'L', 'l', 'v']);
  await expect(listing.locator('.tok-number').first()).toHaveText('0.6');
  await expect(listing.locator('.tok-string', { hasText: '0.6' })).toHaveCount(0);

  // On Arctic, whose seeds are all blues, a command and a number differ in colour.
  await pick(page, 'arctic');
  const [command, number] = await Promise.all(
    ['.tok-command', '.tok-number'].map((kind) => listing.locator(kind).first().evaluate((el) => getComputedStyle(el).color)),
  );
  expect(command).not.toBe(number);
});

test("every demo's sheets set their code through the highlighter", async ({ page }) => {
  await page.goto('/');
  // One token per demo, from a snippet each sheet tokenises at build (Fediverse's file is
  // tokenised in the browser, with the same classes).
  const tokens: [string, string, string][] = [
    ['Fediverse Playground', '[data-yaml] .tok-tag', 'services'],
    ['Fediverse Playground', '.tok-function', 'git'],
    ['Synthetic Properties', '.tok-keyword', 'INSERT INTO'],
    ['GNU social · Event Dispatch', 'pre.branch .tok-keyword', 'for'],
    ['Interactive Map Marker Editor', 'pre.tag .tok-tag', 'path'],
    ['web-ts-mode', '.tok-attribute', ':local'],
    ['Library Tagging Tool', '.tok-function', 'min'],
    ['Interactive Map Font Picker', '.tok-keyword', '@font-face'],
    ['Library Search & Relevance', '.tok-keyword', 'LIMIT'],
    ['Paper Stack', '.tok-keyword', '@media'],
    ['Theme Picker', 'code.hl .tok-attribute', 'data-demo-theme'],
  ];
  for (const [demo, selector, text] of tokens) {
    await expect(demoStack(page, demo).locator(selector, { hasText: new RegExp(`^${text}$`) }).first()).toBeAttached();
  }
});
