import { expect, test } from '@playwright/test';

import { frontPage, frontPageIndex, waitForIslandMounted } from './support/paperStack';

// The marker editor walkthrough presses things by dispatching mousedown and mouseup on its
// targets; the shared press layer (TechnicalDrawing/demo-cursor-press.ts) answers those with
// a pulse on the drawn cursor and a flare at the event point, and ignores trusted presses.
test('walkthrough presses pulse the drawn cursor and flare; the visitor\'s own do not', async ({ page }) => {
  await page.goto('/');
  const stack = page.locator('article.technical-drawing-stack').nth(1);
  await stack.scrollIntoViewIfNeeded();
  const front = frontPage(stack, await frontPageIndex(stack));
  const island = await waitForIslandMounted(front);
  const overlay = island.locator('.mock-map-overlay');
  await expect(overlay).toBeVisible({ timeout: 15_000 });

  // The first press: the cursor gains data-pressed and a flare is drawn where the press was.
  const pressed = stack.locator('[data-demo-cursor][data-pressed]');
  await expect(pressed).toHaveCount(1, { timeout: 30_000 });
  const cursor = await pressed.boundingBox();
  const flares = page.locator('.demo-cursor-flare');
  await expect(flares.first()).toBeAttached();
  const at = await flares.first().evaluate((el) => ({
    x: parseFloat((el as HTMLElement).style.left),
    y: parseFloat((el as HTMLElement).style.top),
  }));
  expect(cursor).not.toBeNull();
  // The hot spot is the arrow tip near the box's top-left corner.
  expect(Math.abs(at.x - cursor!.x)).toBeLessThan(cursor!.width);
  expect(Math.abs(at.y - cursor!.y)).toBeLessThan(cursor!.height);

  // The pulse ends with the release and the flares clean up after themselves.
  await expect(pressed).toHaveCount(0, { timeout: 2_000 });
  await expect(flares).toHaveCount(0, { timeout: 1_000 });

  // A trusted press from the visitor hands the demo over and draws nothing.
  await overlay.focus();
  await expect(page.getByText('Demo paused')).toBeVisible();
  await expect(flares).toHaveCount(0, { timeout: 1_000 });
  const box = (await overlay.boundingBox())!;
  await page.mouse.click(box.x + 8, box.y + 8);
  await page.waitForTimeout(400);
  await expect(flares).toHaveCount(0);
  await expect(stack.locator('[data-demo-cursor][data-pressed]')).toHaveCount(0);
});

// demoPress() sends the down, holds while the pulse shows, then sends the up and the click,
// and the release ring trails the up. So the cursor is pressed before the widget hears the
// click, and the release ring lands after it.
test('the cursor presses before the widget acts and releases after', async ({ page }) => {
  await page.goto('/');
  const stack = page.locator('article.technical-drawing-stack').nth(1);
  await stack.scrollIntoViewIfNeeded();
  const front = frontPage(stack, await frontPageIndex(stack));
  const island = await waitForIslandMounted(front);
  await expect(island.locator('.mock-map-overlay')).toBeVisible({ timeout: 15_000 });

  // Log the first full walkthrough press: when the down was seen, when the click reached
  // its target (and whether the cursor was still pressed then), and when the release ring
  // was drawn.
  await page.evaluate(() => {
    const log: Record<string, number | boolean> = {};
    const w = window as Window & { __pressLog?: typeof log };
    w.__pressLog = log;
    document.addEventListener('mousedown', (event) => {
      if (event.isTrusted || 'down' in log) return;
      log.down = performance.now();
    }, true);
    document.addEventListener('click', (event) => {
      if (event.isTrusted || !('down' in log) || 'click' in log) return;
      log.click = performance.now();
      log.pressedAtClick = document.querySelector('[data-demo-cursor][data-pressed]') !== null;
    }, true);
    new MutationObserver((records) => {
      if (!('click' in log) || 'release' in log) return;
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node instanceof Element && node.matches('.demo-cursor-flare--up')) {
            log.release = performance.now();
          }
        }
      }
    }).observe(document.body, { childList: true, subtree: true });
  });

  await page.waitForFunction(
    () => 'release' in ((window as Window & { __pressLog?: object }).__pressLog ?? {}),
    undefined,
    { timeout: 30_000 },
  );
  const log = await page.evaluate(
    () => (window as Window & { __pressLog?: Record<string, number | boolean> }).__pressLog!,
  );
  expect(log.pressedAtClick).toBe(true);
  expect((log.click as number) - (log.down as number)).toBeGreaterThanOrEqual(80);
  expect(log.release as number).toBeGreaterThan(log.click as number);
});
