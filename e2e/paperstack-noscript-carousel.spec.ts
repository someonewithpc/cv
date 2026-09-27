import { expect, type Locator, test } from '@playwright/test';

test.use({ javaScriptEnabled: false });

/** Opacity of each sheet in the row; the one the row rests on reads at full strength. */
const sheetOpacities = (stack: Locator) =>
  stack.evaluate((el) => [...el.children].map((page) => Number(getComputedStyle(page.querySelector(':scope > section') ?? page).opacity)));

const position = (stack: Locator) =>
  stack.evaluate((el) => ({ left: el.scrollLeft, width: el.clientWidth }));

test('without JS a stack snaps sheet to sheet, with arrows that take focus', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const stack = page.locator('[data-paper-stack]').first();
  await stack.scrollIntoViewIfNeeded();

  await expect.poll(async () => (await sheetOpacities(stack)).slice(0, 2)).toEqual([1, 0.5]);

  // A scroll that stops between two sheets lands on one of them.
  await stack.evaluate((el) => {
    el.style.scrollBehavior = 'auto';
    el.scrollLeft = el.clientWidth * 0.3;
  });
  await expect.poll(async () => (await position(stack)).left).toBe(0);

  // The next arrow straddles the stack's right edge, halfway down.
  const box = (await stack.boundingBox())!;
  await page.mouse.click(box.x + box.width + 8, box.y + box.height / 2);
  await expect.poll(async () => {
    const { left, width } = await position(stack);
    return Math.round(left / width);
  }).toBe(1);
  const { left, width } = await position(stack);
  expect(Math.abs(left - width)).toBeLessThanOrEqual(1);
  await expect.poll(async () => (await sheetOpacities(stack)).slice(0, 2)).toEqual([0.5, 1]);

  // The click left the arrow focused, so the keyboard can keep turning.
  await page.keyboard.press('Enter');
  await expect.poll(async () => {
    const { left, width } = await position(stack);
    return Math.round(left / width);
  }).toBe(2);
});

for (const width of [390, 1440]) {
  test(`without JS at ${width}px each arrow sits whole on the page, centred on the sheet's edge`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    const stack = page.locator('[data-paper-stack]').first();
    await stack.scrollIntoViewIfNeeded();

    const arrows = await stack.evaluate((el) => {
      const sheet = el.getBoundingClientRect();
      return (['left', 'right'] as const).map((side) => {
        const s = getComputedStyle(el, `::scroll-button(${side})`);
        const size = parseFloat(s.width);
        const x0 = side === 'left' ? sheet.left + parseFloat(s.left) : sheet.right - parseFloat(s.right) - size;
        return { size, x0, x1: x0 + size, edge: side === 'left' ? sheet.left : sheet.right, page: innerWidth };
      });
    });
    for (const { size, x0, x1, edge, page: pageWidth } of arrows) {
      expect(size).toBeGreaterThanOrEqual(24);
      expect(x0).toBeGreaterThanOrEqual(0);
      expect(x1).toBeLessThanOrEqual(pageWidth);
      expect(Math.abs((x0 + x1) / 2 - edge)).toBeLessThanOrEqual(0.5);
    }
  });
}
