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
/** Past 105rem (Layout.astro, design-mix.spec.ts's CARDS_FROM) the title card stands in a lane
 * beside the stack, and the bubble should stand in the lane on the view's other side. */
const DESK_CARD = { width: 1728, height: 900 };

for (const viewport of [PHONE, NO_DESK, DESK]) {
  test(`the boundary stands the same distance off the view all round at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');

    // Layout boxes, not painted ones: the title card is laid in the view as a slip below 105rem,
    // and beside it above that, out of the flow.
    const insets = await page.locator('.callout-view').evaluateAll((views) => views.map((view) => {
      const box = (el: HTMLElement) => ({
        top: el.offsetTop,
        left: el.offsetLeft,
        bottom: el.offsetTop + el.offsetHeight,
        right: el.offsetLeft + el.offsetWidth,
      });
      const outer = box(view as HTMLElement);
      const parts = [...view.children]
        .filter((child) => (child as HTMLElement).offsetHeight > 0 && getComputedStyle(child).position !== 'absolute')
        .map((child) => box(child as HTMLElement));
      const inner = {
        top: Math.min(...parts.map((part) => part.top)),
        left: Math.min(...parts.map((part) => part.left)),
        bottom: Math.max(...parts.map((part) => part.bottom)),
        right: Math.max(...parts.map((part) => part.right)),
      };
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
    return { viewTop: view.top, viewBottom: view.bottom, fwdTop: fwd.top, fwdBottom: fwd.bottom, backBottom: back.bottom };
  });
  // Under the sheet the hint lands on the title card's slip, which is inside the boundary, so it
  // only has to keep off the line: wholly past it or wholly inside it.
  expect(hints.fwdTop >= hints.viewBottom || hints.fwdBottom <= hints.viewBottom - 1).toBe(true);
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

test('the bubble stands on the opposite side of the view from the card, and alternates with it', async ({ page }) => {
  await page.setViewportSize(DESK_CARD);
  await page.goto('/');

  const rows = await page.locator('#demos .callout[data-card]').evaluateAll((callouts) => callouts.slice(0, 2).map((callout) => {
    const view = callout.querySelector('.callout-view')!.getBoundingClientRect();
    const card = callout.querySelector('.callout-card')!.getBoundingClientRect();
    const bubble = callout.querySelector('.callout-bubble')!.getBoundingClientRect();
    const mid = (view.left + view.right) / 2;
    return {
      side: (callout as HTMLElement).dataset.card,
      cardOnLeft: card.left < mid,
      bubbleOnLeft: bubble.left < mid,
    };
  }));

  expect(rows.length).toBe(2);
  for (const row of rows) {
    expect(row.bubbleOnLeft, `${row.side} row, bubble opposite the card`).toBe(!row.cardOnLeft);
  }
  // Consecutive detail rows alternate sides (index.astro), so the bubble should too.
  expect(rows[0].bubbleOnLeft).not.toBe(rows[1].bubbleOnLeft);
});
