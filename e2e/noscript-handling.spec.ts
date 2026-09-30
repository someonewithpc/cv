import { expect, type Page, test } from '@playwright/test';

// Words from PaperStack's no-script rules. They used to sit in a <noscript><style>, which a
// page loaded with script parses as text and shows the moment script is switched off.
const SOURCE_TELLS = ['Without JS the one stack', '!important', 'scroll-snap-type'];

// Sheets whose artwork ran off the sheet under the title block without the measure the
// stack's script writes: the tagging tool, the schema driver and the event bus, by stack index.
// Their type comes from --sheet-inline (Page.astro), which is the stack's own width.
const SCALED_SHEETS = [4, 7, 8];
const EVENT_BUS = 8;

async function expectNoScriptPage(page: Page) {
  const text = await page.locator('body').innerText();
  for (const tell of SOURCE_TELLS) expect(text, 'stylesheet source on the page').not.toContain(tell);

  const stacks = page.locator('[data-paper-stack]');
  expect(await stacks.count()).toBeGreaterThanOrEqual(3);
  for (const stack of await stacks.all()) await expect(stack).toHaveCSS('display', 'flex');

  await expect(page.locator('.paper-fold:visible, .paper-clip:visible, .paper-flip-hint:visible')).toHaveCount(0);
  await expect(page.locator('.flip-hints:visible')).toHaveCount(0);
}

function overlaps(a: { x: number; y: number; width: number; height: number }, b: typeof a) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

test.describe('with JavaScript off', () => {
  test.use({ javaScriptEnabled: false });

  test('the page reads as a no-script page', async ({ page }) => {
    await page.goto('/');
    await expectNoScriptPage(page);
  });

  test('the artwork is scaled to the sheet, the slip shows its title, the islands say why', async ({ page }) => {
    // A sheet narrower than 800px, where the sheet's scale is below the inherited 1rem.
    await page.setViewportSize({ width: 768, height: 900 });
    await page.goto('/');
    const stacks = page.locator('article.technical-drawing-stack');

    for (const index of SCALED_SHEETS) {
      const stack = stacks.nth(index);
      const width = (await stack.locator('section').first().boundingBox())!.width;
      expect(width).toBeLessThan(800);
      const size = await stack.locator('section .content').first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
      expect(size, `stack ${index}: type scaled to the sheet`).toBeCloseTo(0.02 * width, 1);
    }

    // The event bus sheet's artwork stands clear of the title block, as it does with script.
    const sheet = stacks.nth(EVENT_BUS).locator('section').first();
    const block = (await sheet.locator('table').boundingBox())!;
    for (const leaf of await sheet.locator('.content :not(:has(*))').all()) {
      const box = await leaf.boundingBox();
      if (!box || box.width === 0 || box.height === 0) continue;
      expect(overlaps(box, block), 'event bus artwork under the title block').toBe(false);
    }

    // Below the lane the title card is a slip under the stack. Its Title label is the first
    // thing on it, and it has to clear the front sheet's edge.
    const stack = (await stacks.first().boundingBox())!;
    const label = (await page.locator('.callout[data-card] .title-cell:first-child dt').first().boundingBox())!;
    expect(label.y).toBeGreaterThanOrEqual(stack.y + stack.height);

    const placeholder = page.locator('.boot-placeholder').first();
    expect(await placeholder.evaluate((el) => getComputedStyle(el, '::after').content)).toBe('"This demo needs JavaScript."');
  });

  test('a phone gets the portrait type, and the playground toggles are tall enough to tap', async ({ page }) => {
    // Under 680px the sheet is portrait (Stack.astro's no-script mirror of its width query), and
    // the type has to follow: the landscape size left every sheet at 7px, and the playground's
    // toggles, at 0.8em of that, under 16px tall.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    const stacks = page.locator('article.technical-drawing-stack');

    for (let index = 0; index < (await stacks.count()); index++) {
      const stack = stacks.nth(index);
      const width = (await stack.locator('section').first().boundingBox())!.width;
      const size = await stack.locator('section .content').first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
      expect(size, `stack ${index}: portrait type`).toBeCloseTo(0.038 * width, 1);
    }

    const toggles = page.locator('.playground .toggle');
    expect(await toggles.count()).toBe(4);
    for (const toggle of await toggles.all()) {
      const box = (await toggle.boundingBox())!;
      expect(box.height, 'toggle at least 24px tall').toBeGreaterThanOrEqual(24);
    }
  });
});

test('switching script off after the page loaded leaves a no-script page', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.locator('[data-paper-stack]').first()).toHaveCSS('display', 'grid');
  await expect(page.locator('.technical-drawing-frame[data-hint-show]')).toHaveCount(1);

  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setScriptExecutionDisabled', { value: true });
  await expectNoScriptPage(page);
});
