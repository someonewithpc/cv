import { expect, test, type Page } from '@playwright/test';

import { frontPage, frontPageIndex, frontPageName, swipeStack, swipeToPage } from './support/paperStack';

import {
  feetAndInches,
  matches,
  renderDimension,
  searchableText,
  sizeProperties,
  splitSizes,
} from '../src/components/SyntheticPropertiesDemo/units';

const PAGES = ['Synthetic Properties', 'Six Renderings', 'Trigger Bodies', 'Searchable Text'];

function syntheticStack(page: Page) {
  // By title, not by position: the demos run gains stacks over time.
  return page.locator('article.technical-drawing-stack').filter({
    has: page.locator('h2.typewriter', { hasText: 'Synthetic Properties' }),
  });
}

async function mountedTool(page: Page) {
  const stack = syntheticStack(page);
  await stack.scrollIntoViewIfNeeded();
  const front = frontPage(stack, await frontPageIndex(stack));
  await expect(front.locator('.synthetic-demo')).toHaveAttribute('data-mounted', 'true', { timeout: 15_000 });
  const tool = front.locator('.synthetic-tool[data-live]');
  // Hovering is how a visitor takes the sheet over from the walkthrough.
  await tool.hover();
  await expect(tool).toHaveAttribute('data-autoplay', 'user');
  return tool;
}

test.describe('unit maths', () => {
  test('splits on x, either case, and drops what is not a number', () => {
    expect(splitSizes('160x80x74').map((d) => d.cm)).toEqual([160, 80, 74]);
    expect(splitSizes('160 X 80').map((d) => d.cm)).toEqual([160, 80]);
    expect(splitSizes('160xabc').map((d) => d.cm)).toEqual([160, null]);
    expect(sizeProperties('abc')).toEqual([]);
  });

  test('renders the sample six ways', () => {
    expect(sizeProperties('160x80x74').map((row) => row.value)).toEqual([
      '160cm by 80cm by 74cm',
      '1.6m by 0.8m by 0.74m',
      '63" by 31" by 29"',
      '63in by 31in by 29in',
      `5'3" by 2'7" by 2'5"`,
      '5ft3in by 2ft7in by 2ft5in',
    ]);
  });

  test('inches that round up to twelve carry into the feet, and no fewer do', () => {
    // 182cm is 71.65in: five feet and 11.65in, which rounds to twelve.
    expect(feetAndInches(182)).toEqual({ feet: 6, inches: 0 });
    expect(renderDimension(182, 'ft-in')).toBe('6ft0in');
    expect(renderDimension(182, 'ft-mark')).toBe(`6'0"`);
    // Just under the carry, and exactly a foot.
    expect(renderDimension(181, 'ft-in')).toBe('5ft11in');
    expect(renderDimension(30.48, 'ft-in')).toBe('1ft0in');
    // Seven inches over is seven inches over, not a foot: the shipped SQL said 3ft7in.
    expect(renderDimension(80, 'ft-in')).toBe('2ft7in');
  });

  test('centimetres and metres keep two significant figures', () => {
    expect(renderDimension(182, 'cm')).toBe('180cm');
    expect(renderDimension(182, 'm')).toBe('1.8m');
    expect(renderDimension(74, 'cm')).toBe('74cm');
    expect(renderDimension(74, 'm')).toBe('0.74m');
  });

  test('queries match whole phrases, not pieces of one', () => {
    const text = searchableText(sizeProperties('160x80x74'));
    expect(matches(text, '5FT3IN')).toBe(true);
    expect(matches(text, `5'3"`)).toBe(true);
    expect(matches(text, '3"')).toBe(false);
    expect(matches(text, '1.6')).toBe(false);
    // Value then name, one space between everything, the way the concatenation writes it.
    expect(text).toContain('1.6m by 0.8m by 0.74m Size (meters) 63" by 31" by 29" Size (inches)');
  });
});

test('synthetic properties: forward swipes visit every page in order, then wrap', async ({ page }) => {
  await page.goto('/');
  const stack = syntheticStack(page);
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

test('main page: the walkthrough types on its own and hands over on hover', async ({ page }) => {
  await page.goto('/');
  const stack = syntheticStack(page);
  await stack.scrollIntoViewIfNeeded();
  const front = frontPage(stack, await frontPageIndex(stack));
  await expect(front.locator('.synthetic-demo')).toHaveAttribute('data-mounted', 'true', { timeout: 15_000 });

  const tool = front.locator('.synthetic-tool[data-live]');
  await expect(tool).toHaveAttribute('data-autoplay', 'playing');
  // The first step asks for the sample in feet and inches.
  await expect(tool.locator('.query-input')).toHaveValue('5ft3in', { timeout: 15_000 });
  await expect(tool.locator('.text mark')).toHaveText('5ft3in');

  await tool.hover();
  await expect(tool).toHaveAttribute('data-autoplay', 'user');
  const settled = await tool.locator('.size-input').inputValue();
  const query = await tool.locator('.query-input').inputValue();
  await page.waitForTimeout(1_500);
  expect(await tool.locator('.size-input').inputValue()).toBe(settled);
  expect(await tool.locator('.query-input').inputValue()).toBe(query);
});

test('main page: a new size splits, fans out and changes which queries hit', async ({ page }) => {
  await page.goto('/');
  const tool = await mountedTool(page);

  await tool.locator('.size-input').fill('200x100x75');
  await expect(tool.locator('.chip')).toHaveText(['200', '100', '75']);
  await expect(tool.locator('.rendering[data-unit="m"] .value')).toHaveText('2m by 1m by 0.75m');
  await expect(tool.locator('.rendering[data-unit="ft-in"] .value')).toHaveText('6ft7in by 3ft3in by 2ft6in');
  await expect(tool.locator('.text')).toContainText('2m by 1m by 0.75m Size (meters)');

  await expect(tool.locator('.query[data-query="2m"]')).toHaveAttribute('data-hit', 'true');
  await expect(tool.locator('.query[data-query="5ft3in"]')).toHaveAttribute('data-hit', 'false');
  // The seat count did not change, so it still hits under its other name.
  await expect(tool.locator('.query[data-query="8 seats"]')).toHaveAttribute('data-hit', 'true');

  await tool.locator('.query-input').fill('6ft7in');
  await expect(tool.locator('.query-result')).toHaveAttribute('data-hit', 'true');
  await expect(tool.locator('.text mark')).toHaveText('6ft7in');
});

test('six renderings page: the carry is marked in the table', async ({ page }) => {
  await page.goto('/');
  const stack = syntheticStack(page);
  await stack.scrollIntoViewIfNeeded();
  await swipeToPage(page, stack, 'Six Renderings');
  const front = frontPage(stack, await frontPageIndex(stack));
  await expect(front.locator('section.blueprint')).toBeVisible();
  await expect(front.locator('td.carry')).toHaveText([`6'0"`, '6ft0in']);
});
