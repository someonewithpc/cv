import { expect, test } from '@playwright/test';

/**
 * A detail's chain-line boundary (Callout.astro) stands the same distance off its view on all
 * four sides, and with no desk beside it the cutting mat (index.astro) runs its ruling out to
 * the window's edges instead of showing a rim and an edge line down each side of the screen.
 * Every callout on the page is checked, whatever it holds and however many there are.
 */

const PHONE = { width: 390, height: 844 };
const NO_DESK = { width: 1024, height: 768 };
const DESK = { width: 1440, height: 900 };

for (const viewport of [PHONE, NO_DESK, DESK]) {
  test(`the boundary stands the same distance off the view all round at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');

    const insets = await page.locator('.callout-view').evaluateAll((views) => views.map((view) => {
      const outer = view.getBoundingClientRect();
      const inner = view.firstElementChild!.getBoundingClientRect();
      return {
        top: inner.top - outer.top,
        right: outer.right - inner.right,
        bottom: outer.bottom - inner.bottom,
        left: inner.left - outer.left,
      };
    }));
    expect(insets.length).toBeGreaterThan(0);
    for (const inset of insets) {
      const sides = Object.values(inset);
      expect(Math.max(...sides) - Math.min(...sides), JSON.stringify(inset)).toBeLessThanOrEqual(1);
    }
  });
}

for (const viewport of [PHONE, NO_DESK]) {
  test(`with no desk the mat is ruled out to the window's edges at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');

    const mat = await page.locator('.cutting-mat').evaluate((el) => {
      const box = el.getBoundingClientRect();
      const ruling = getComputedStyle(el, '::before');
      const style = getComputedStyle(el);
      return {
        left: box.left,
        right: box.right,
        window: document.documentElement.clientWidth,
        edges: [style.borderLeftWidth, style.borderRightWidth],
        ruling: [ruling.left, ruling.right],
      };
    });
    expect(mat.left).toBeLessThanOrEqual(0);
    expect(mat.right).toBeGreaterThanOrEqual(mat.window);
    expect(mat.edges).toEqual(['0px', '0px']);
    expect(mat.ruling).toEqual(['0px', '0px']);
  });
}

test('on a phone the peel hints are written past the boundary, not across it', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.goto('/');

  const frame = page.locator('.technical-drawing-frame[data-hint-show]');
  await expect(frame).toHaveCount(1);
  const hints = await frame.evaluate((el) => {
    const view = el.closest('.callout-view')!.getBoundingClientRect();
    const fwd = el.querySelector('.flip-hint--fwd.hint-words')!.getBoundingClientRect();
    const back = el.querySelector('.flip-hint--back.hint-words')!.getBoundingClientRect();
    return { viewTop: view.top, viewBottom: view.bottom, fwdTop: fwd.top, backBottom: back.bottom };
  });
  expect(hints.fwdTop).toBeGreaterThanOrEqual(hints.viewBottom);
  expect(hints.backBottom).toBeLessThanOrEqual(hints.viewTop);
});

test('with room for them the peel hints are written inside the boundary', async ({ page }) => {
  await page.setViewportSize(NO_DESK);
  await page.goto('/');

  const frame = page.locator('.technical-drawing-frame[data-hint-show]');
  await expect(frame).toHaveCount(1);
  const hints = await frame.evaluate((el) => {
    const view = el.closest('.callout-view')!.getBoundingClientRect();
    const fwd = el.querySelector('.flip-hint--fwd.hint-words')!.getBoundingClientRect();
    const back = el.querySelector('.flip-hint--back.hint-words')!.getBoundingClientRect();
    return { viewTop: view.top, viewBottom: view.bottom, fwdBottom: fwd.bottom, backTop: back.top };
  });
  // The boundary is a 1px line on the view's own edge.
  expect(hints.fwdBottom).toBeLessThanOrEqual(hints.viewBottom - 1);
  expect(hints.backTop).toBeGreaterThanOrEqual(hints.viewTop + 1);
});
