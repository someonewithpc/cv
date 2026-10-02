import { expect, type Page, test } from '@playwright/test';

/**
 * The window Hugo reported the Space Builder cover from. The sheet stops growing at its 60em
 * cap, so every desktop window from about 1024 up draws the same 960x480 sheet with the title
 * block cornered over the artwork; this one also fits a whole stack on screen.
 */
const VIEWPORT = { width: 1240, height: 620 };

// A walkthrough that keeps moving cannot be measured; a still sheet can.
test.use({ reducedMotion: 'reduce' });

/**
 * The app's controls, and the title block they must not reach. The 3D view itself runs the
 * sheet's full height into the corner, where the block covers it as pasted paper covers a
 * drawing. The sidebar stops above the block, and nothing else sits in that corner.
 */
const APPS = '.space-builder-app .rail, .space-builder-app .sidebar, .space-builder-app .toasts';

async function settle(page: Page, selector: string) {
  const stack = page.locator(selector);
  await stack.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(2500);
  return stack;
}

test('the space builder app shows nothing under the title block', async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await page.goto('/');

  const stack = await settle(page, '.space-builder-demo article.technical-drawing-stack');
  // Reduced motion leaves the sidebar shut, so open it the way a reader would.
  await stack.locator('[data-demo-target="tool:add"]').first().click();
  await expect(stack.locator('.space-builder-app .sidebar').first()).toBeVisible();
  await page.waitForTimeout(500);

  const overlaps = await stack.evaluate((el, what) => {
    const section = el.querySelector('section');
    const block = section?.querySelector(':scope > table');
    if (!section || !block) return ['no title block on the cover sheet'];

    const box = block.getBoundingClientRect();
    return [...section.querySelectorAll(what)]
      .map((node) => ({ node, rect: node.getBoundingClientRect() }))
      .filter(({ rect }) => rect.width > 0 && rect.height > 0)
      .map(({ node, rect }) => ({
        node,
        across: Math.min(rect.right, box.right) - Math.max(rect.left, box.left),
        down: Math.min(rect.bottom, box.bottom) - Math.max(rect.top, box.top),
      }))
      .filter(({ across, down }) => across > 0 && down > 0)
      .map(({ node, across, down }) => `${node.className} runs ${Math.round(across)}x`
        + `${Math.round(down)}px under the block`);
  }, APPS);

  expect(overlaps).toEqual([]);
});

/**
 * The Space Builder and the Drag and drop apps fill their first sheets inside one shared
 * margin, which a phone sheet gives up.
 */
test('the space builder and drag and drop apps share one margin, gone on a phone', async ({ page }) => {
  const insets = async () => page.evaluate(() => ['.mock-scene-demo', '.drag-drop-scene-demo'].map((frame) => {
    const app = document.querySelector(frame)!;
    const cell = app.closest('.content')!.getBoundingClientRect();
    const box = app.getBoundingClientRect();
    return Math.round(box.left - cell.left);
  }));

  await page.setViewportSize(VIEWPORT);
  await page.goto('/');
  const [builder, dragDrop] = await insets();
  expect(builder).toBe(dragDrop);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  const phone = await insets();
  expect(phone[0]).toBe(phone[1]);
  // What is left is the 2px that keeps the frame line clear.
  expect(phone[0]).toBeLessThanOrEqual(2);
  expect(builder).toBeGreaterThan(phone[0]);
});

/**
 * Every page of every stack. A block's paper is a computed colour, the same whether its stack
 * has been scrolled to or not, so all of them are read in one pass without scrolling.
 */
for (const [width, height] of [[VIEWPORT.width, VIEWPORT.height], [1440, 900], [390, 844]]) {
  test(`every title block paints opaque paper at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/');

    const stacks = page.locator('article.technical-drawing-stack');
    expect(await stacks.count()).toBeGreaterThan(0);

    const seethrough = await stacks.evaluateAll((all) => all.flatMap((el) => {
      /** The alpha of a computed colour, whichever space the browser serialised it in. */
      const alpha = (colour: string) => {
        if (colour === 'transparent') return 0;
        const slashed = colour.match(/\/\s*([\d.]+)(%?)\s*\)\s*$/);
        if (slashed) return Number(slashed[1]) / (slashed[2] ? 100 : 1);
        const legacy = colour.match(/^rgba?\(([^)]*)\)$/);
        if (!legacy) return 1;
        const parts = legacy[1].split(/[\s,]+/).filter(Boolean);
        return parts.length > 3 ? Number(parts[3]) : 1;
      };

      return [...el.querySelectorAll('section')].flatMap((section) => {
        const block = section.querySelector<HTMLElement>(':scope > table');
        if (!block) return [];
        const paper = getComputedStyle(block).backgroundColor;
        if (alpha(paper) >= 1) return [];
        return [`${section.querySelector('h2')?.textContent?.trim() ?? '?'}: ${paper}`];
      });
    }));

    expect(seethrough).toEqual([]);
  });
}
