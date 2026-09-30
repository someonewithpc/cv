import { expect, test, type Locator, type Page } from '@playwright/test';

import { demoStack, frontPage, frontPageIndex, frontPageName, swipeStack, turnToPage, waitForIslandMounted } from './support/paperStack';

import {
  feetAndInches,
  matches,
  renderDimension,
  searchableText,
  sizeProperties,
  splitSizes,
  storedSizeProperties,
} from '../src/components/SyntheticPropertiesDemo/units';

const PAGES = ['Synthetic Properties', 'Unit Conversions', 'Database Triggers', 'Searchable Text'];

function syntheticStack(page: Page) {
  return demoStack(page, 'Synthetic Properties');
}

/** The first sheet, mounted, and the walkthrough on it. With `clock` the spec drives the
    page's timers: the typing runs as fast as it is polled and nothing waits on the wall. */
async function mountedTool(page: Page, { clock = false } = {}) {
  if (clock) await page.clock.install();
  await page.goto('/');
  const stack = syntheticStack(page);
  await stack.scrollIntoViewIfNeeded();
  const front = frontPage(stack, await frontPageIndex(stack));
  await expect(front.locator('.synthetic-demo')).toHaveAttribute('data-mounted', 'true', { timeout: 15_000 });
  return { front, tool: front.locator('.synthetic-tool[data-live]') };
}

function value(tool: Locator, field: string) {
  return () => tool.locator(field).inputValue();
}

/** Runs the page clock on until `read` returns `want`. */
async function playUntil<T>(page: Page, read: () => Promise<T>, want: T) {
  await expect
    .poll(async () => {
      await page.clock.fastForward(250);
      return read();
    }, { intervals: [20], timeout: 30_000 })
    .toEqual(want);
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
    expect(renderDimension(182, 'ft-in')).toBe('6ft');
    expect(renderDimension(182, 'ft-mark')).toBe(`6'`);
    // Just under the carry, and exactly a foot.
    expect(renderDimension(181, 'ft-in')).toBe('5ft11in');
    expect(renderDimension(30.48, 'ft-in')).toBe('1ft');
    // Seven inches over is seven inches over, not a foot: the shipped SQL said 3ft7in.
    expect(renderDimension(80, 'ft-in')).toBe('2ft7in');
  });

  test('centimetres and metres keep two significant figures', () => {
    expect(renderDimension(182, 'cm')).toBe('180cm');
    expect(renderDimension(182, 'm')).toBe('1.8m');
    expect(renderDimension(74, 'cm')).toBe('74cm');
    expect(renderDimension(74, 'm')).toBe('0.74m');
  });

  test('the stored rows keep the exact size next to a rounded one', () => {
    const rounded = storedSizeProperties('182x45');
    expect(rounded.map((row) => row.value)).toEqual([
      '180cm by 45cm',
      '182cm by 45cm',
      '1.8m by 0.45m',
      '1.82m by 0.45m',
      '72" by 18"',
      '72in by 18in',
      `6' by 1'6"`,
      '6ft by 1ft6in',
    ]);
    const text = searchableText(rounded);
    expect(matches(text, '182cm')).toBe(true);
    expect(matches(text, '180cm')).toBe(true);
    expect(matches(text, '1.82m')).toBe(true);
    expect(matches(text, '6ft')).toBe(true);
    expect(text).not.toContain('0in');
    // Nothing rounds on the sample, so it keeps six rows.
    expect(storedSizeProperties('160x80x74')).toEqual(sizeProperties('160x80x74'));
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
  await waitForIslandMounted(frontPage(stack, await frontPageIndex(stack)), '.synthetic-demo');

  expect(await stack.locator(':scope > div').count()).toBe(PAGES.length);
  expect(await frontPageName(stack)).toBe(PAGES[0]);

  for (let i = 1; i < PAGES.length; i += 1) {
    await swipeStack(page, stack, true);
    expect(await frontPageName(stack), `page ${i} after ${i} forward swipe(s)`).toBe(PAGES[i]);
  }

  await swipeStack(page, stack, true);
  expect(await frontPageName(stack)).toBe(PAGES[0]);
});

test('main page: the fields are read-only and say so', async ({ page }) => {
  const { front, tool } = await mountedTool(page);
  await expect(tool).toHaveAttribute('data-autoplay', 'playing');

  for (const input of await tool.locator('input').all()) {
    await expect(input).toHaveAttribute('readonly', '');
    await expect(input).toHaveAttribute('tabindex', '-1');
    expect(await input.evaluate((el) => getComputedStyle(el).caretColor)).toBe('rgba(0, 0, 0, 0)');
  }
  await expect(tool.locator('.inert-note')).toHaveText("The walkthrough types in these fields. They don't take your own typing.");
  await expect(front.locator('[data-demo-hint]')).toHaveText('the sheet types by itself');

  // Neither a pointer on the sheet nor a click and typing takes it over or changes a field.
  await tool.hover();
  const before = await tool.locator('.pax-input').inputValue();
  await tool.locator('.pax-input').click();
  await page.keyboard.type('12');
  expect(await tool.locator('.pax-input').inputValue()).toBe(before);
  await expect(tool).toHaveAttribute('data-autoplay', 'playing');
  await expect(tool.locator('.inert-note')).toHaveClass(/nudge/);
});

test('main page: the cursor clicks each field, and the search says hit or no match', async ({ page }) => {
  const { tool } = await mountedTool(page, { clock: true });
  const cursor = tool.locator('.demo-cursor');

  // The sample, found in feet and inches.
  await playUntil(page, async () => (await tool.locator('.text-row').getAttribute('data-hit')), 'true');
  await expect(tool.locator('.query-input')).toHaveValue('5ft3in');
  await expect(cursor).toBeVisible();
  await expect(tool.locator('.row-verdict')).toHaveText('✓ 5ft3in found');
  await expect(tool.locator('.query-result')).toHaveText('✓ found');
  await expect(tool.locator('.text mark')).toHaveText('5ft3in');

  // A new size: the old search no longer matches, and the row says so.
  await playUntil(page, async () => (await tool.locator('.chip').allTextContents()).join('x'), '200x100x75');
  await playUntil(page, async () => (await tool.locator('.text-row').getAttribute('data-hit')), 'false');
  await expect(cursor).toBeVisible();
  await expect(tool.locator('.row-verdict')).toHaveText('✗ no match for 5ft3in');
  await expect(tool.locator('.query-result')).toHaveText('✗ no match');
  await expect(tool.locator('.text mark')).toHaveCount(0);
  await expect(tool.locator('.rendering[data-unit="m"] .value')).toHaveText('2m by 1m by 0.75m');
  await expect(tool.locator('.rendering[data-unit="ft-in"] .value')).toHaveText('6ft7in by 3ft3in by 2ft6in');
  // Only the current search is shown, no list of sample searches beside it.
  await expect(tool.locator('.queries, .query')).toHaveCount(0);

  await playUntil(page, value(tool, '.query-input'), '2m');
  await playUntil(page, async () => (await tool.locator('.text-row').getAttribute('data-hit')), 'true');
  await expect(tool.locator('.row-verdict')).toHaveText('✓ 2m found');

  // 182 reads 180cm, and its feet carry to a whole 6ft.
  await playUntil(page, value(tool, '.size-input'), '182x45');
  await playUntil(page, value(tool, '.query-input'), '6ft');
  await playUntil(page, async () => (await tool.locator('.text-row').getAttribute('data-hit')), 'true');
  await expect(tool.locator('.rendering[data-unit="cm"] .value')).toHaveText('180cm by 45cm');
  await expect(tool.locator('.rendering[data-unit="ft-in"] .value')).toHaveText('6ft by 1ft6in');
  await expect(tool.locator('.text mark')).toHaveText('6ft');
  await expect(tool.locator('.text')).not.toContainText('0in');
});

test('main page: the deck pauses the walkthrough and plays it on', async ({ page }) => {
  const { front, tool } = await mountedTool(page, { clock: true });
  await playUntil(page, value(tool, '.query-input'), '5ft3in');

  await front.locator('[data-demo-key="pause"]').click();
  await expect(tool).toHaveAttribute('data-autoplay', 'user');
  await expect(front.locator('[data-demo-caption]')).toHaveText('PAUSED');
  const size = await tool.locator('.size-input').inputValue();
  const query = await tool.locator('.query-input').inputValue();
  // A walkthrough still running would change a field on its next timer. Every step
  // waits under 3 s, so three jumps of that fire whatever it had pending.
  for (let i = 0; i < 3; i += 1) await page.clock.fastForward(3_000);
  expect(await tool.locator('.size-input').inputValue()).toBe(size);
  expect(await tool.locator('.query-input').inputValue()).toBe(query);
  await expect(tool.locator('.demo-cursor')).toBeHidden();

  await front.locator('[data-demo-key="play"]').click();
  await expect(tool).toHaveAttribute('data-autoplay', 'playing');
});

test('main page: the tool fills the sheet and its last line scrolls clear of the title block', async ({ page }) => {
  const { tool } = await mountedTool(page);
  const layout = await tool.evaluate((el) => {
    const section = el.closest('section')!;
    const block = section.querySelector(':scope > table')!.getBoundingClientRect();
    const sheet = section.getBoundingClientRect();
    const box = el.getBoundingClientRect();
    el.scrollTop = el.scrollHeight;
    const last = el.querySelector('.stages')!.getBoundingClientRect();
    return {
      overlapsBlock: box.bottom > block.top && box.right > block.left,
      clearOfBlock: block.top - last.bottom,
      widthShare: box.width / sheet.width,
      heightShare: box.height / sheet.height,
    };
  });
  // The tool runs under the title block, as the other demos do, and takes most of the sheet.
  expect(layout.overlapsBlock).toBe(true);
  expect(layout.widthShare).toBeGreaterThan(0.85);
  expect(layout.heightShare).toBeGreaterThan(0.75);
  expect(layout.clearOfBlock).toBeGreaterThanOrEqual(8);
});

test('main page: on a phone the tool scrolls, and the keyboard reaches and moves it', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { tool } = await mountedTool(page);
  // The three stages stack on a portrait sheet and run past the tool's foot.
  expect(await tool.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
  await expect(tool).toHaveAccessibleName("One table's size, split, converted and searched");

  await syntheticStack(page).focus();
  for (let i = 0; i < 5 && !(await tool.evaluate((el) => el === document.activeElement)); i += 1) {
    await page.keyboard.press('Tab');
  }
  await expect(tool).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect.poll(() => tool.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
});

test('unit conversions page: the carry is marked in the table', async ({ page }) => {
  await page.goto('/');
  const stack = syntheticStack(page);
  await stack.scrollIntoViewIfNeeded();
  await turnToPage(stack, 'Unit Conversions');
  const front = frontPage(stack, await frontPageIndex(stack));
  await expect(front.locator('section.blueprint')).toBeVisible();
  await expect(front.locator('td.carry')).toHaveText([`6'`, '6ft']);
});

for (const [width, height] of [[1440, 900], [1024, 768]]) {
  test(`database triggers page: the four cards are one row of equal height at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    const stack = syntheticStack(page);
    await stack.scrollIntoViewIfNeeded();
    await turnToPage(stack, 'Database Triggers');
    const front = frontPage(stack, await frontPageIndex(stack));
    const cards = front.locator('.target');
    await expect(cards).toHaveCount(4);

    const boxes = await cards.evaluateAll((all) => all.map((card) => {
      const box = card.getBoundingClientRect();
      const code = card.querySelector('pre')!;
      return {
        top: box.top,
        height: box.height,
        codeTop: code.getBoundingClientRect().top,
        scrolls: code.scrollWidth > code.clientWidth,
      };
    }));
    const spread = (key: 'top' | 'height' | 'codeTop') =>
      Math.max(...boxes.map((b) => b[key])) - Math.min(...boxes.map((b) => b[key]));
    expect(spread('top')).toBeLessThanOrEqual(1);
    expect(spread('height')).toBeLessThanOrEqual(1);
    expect(spread('codeTop')).toBeLessThanOrEqual(1);
    expect(boxes.map((b) => b.scrolls)).toEqual([false, false, false, false]);

    // A name wraps at an underscore, a dot or a bracket, never inside a word.
    const broken = await front.locator('.target pre .line').evaluateAll((lines) => lines.flatMap((line) => {
      const range = document.createRange();
      const found: string[] = [];
      let lastTop: number | null = null;
      let before = '';
      const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = node.textContent ?? '';
        for (let i = 0; i < text.length; i += 1) {
          range.setStart(node, i);
          range.setEnd(node, i + 1);
          const rect = range.getClientRects()[0];
          if (!rect) continue;
          if (lastTop !== null && rect.top > lastTop + 1 && /[a-z0-9]/i.test(before) && /[a-z0-9]/i.test(text[i])) {
            found.push(`${line.textContent}: breaks before "${text.slice(i, i + 8)}"`);
          }
          if (rect.width > 0) {
            lastTop = rect.top;
            before = text[i];
          }
        }
      }
      return found;
    }));
    expect(broken).toEqual([]);
  });
}
