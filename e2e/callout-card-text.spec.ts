import { expect, test } from '@playwright/test';

/**
 * Below 1680px there is no lane beside the drawing for a detail's title card, so the card is
 * a slip tucked under the stack (Callout.astro), square to it: its top under the sheets, only
 * its text below them, inside the detail's boundary. The text has to be on the page, readable
 * and not covered by the sheets at every width, and inset by the same amount from every edge
 * that shows: the slip's sides and foot, and at the top whatever lies over it.
 */

// The span of an entry's text, and where its first and last lines stand.
const entryText = (cell: Element) => {
  const range = document.createRange();
  const rects = [...cell.querySelectorAll('dt, dd')].flatMap((el) => {
    range.selectNodeContents(el);
    return [...range.getClientRects()].filter((r) => r.width > 0);
  });
  return {
    left: Math.min(...rects.map((r) => r.left)),
    right: Math.max(...rects.map((r) => r.right)),
    top: cell.querySelector('dt')!.getBoundingClientRect().top,
    bottom: cell.querySelector('dd')!.getBoundingClientRect().bottom,
  };
};

for (const width of [390, 1024, 1440]) {
  test(`every title card sticks out from under its stack at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width < 800 ? 844 : 900 });
    await page.goto('/');
    await page.evaluate(() => document.fonts.ready);

    const callouts = page.locator('#demos .callout[data-card]');
    const count = await callouts.count();
    expect(count).toBeGreaterThan(0);

    for (let index = 0; index < count; index++) {
      const callout = callouts.nth(index);
      const notes = callout.locator('.title-cell-notes dd');
      await callout.locator('.callout-card').evaluate((el) => el.scrollIntoView({ block: 'center' }));
      await expect(notes).toBeVisible();
      await expect(notes).toBeInViewport();

      const geometry = await callout.evaluate((el, entryTextSource) => {
        const entryText = new Function(`return ${entryTextSource}`)() as (cell: Element) => { left: number; right: number; top: number; bottom: number };
        const card = el.querySelector<HTMLElement>('.callout-card')!;
        const box = card.getBoundingClientRect();
        const stack = el.querySelector('article.technical-drawing-stack')!.getBoundingClientRect();
        const view = el.querySelector('.callout-view')!.getBoundingClientRect();
        // Every line of the card's text is the card's to paint, not a sheet's over it.
        const covered = [...card.querySelectorAll('dt, dd')].filter((cell) => cell.getClientRects().length > 0).filter((cell) => {
          const r = cell.getBoundingClientRect();
          const hit = document.elementFromPoint(r.left + 4, r.top + r.height / 2);
          return !hit || !card.contains(hit);
        }).length;
        const sizes = [...card.querySelectorAll('.title-card *')]
          .filter((node) => node.childNodes.length > 0)
          .map((node) => parseFloat(getComputedStyle(node).fontSize));
        // How far the first entry starts below what is over its text: the lowest sheet of the
        // fan along it, or the peel hint the top stack writes where the hint is over it.
        const style = getComputedStyle(card);
        const pad = parseFloat(style.paddingLeft);
        const cells = [...card.querySelectorAll('.title-cell')].filter((cell) => cell.getClientRects().length > 0);
        const text = cells.map(entryText);
        const first = text[0];
        let over = -Infinity;
        for (let x = Math.ceil(first.left); x < first.right; x += 2) {
          for (let y = Math.floor(first.top); y > box.top; y--) {
            const hit = document.elementFromPoint(x, y);
            if (hit && !card.contains(hit) && !hit.matches('.callout-view, .callout, .technical-drawing-frame, .technical-drawing-stack')) {
              over = Math.max(over, y);
              break;
            }
          }
        }
        const hint = el.querySelector('.technical-drawing-frame[data-hint-show] .flip-hint--fwd.hint-words')?.getBoundingClientRect();
        const hintOver = !!hint && first.right + pad > hint.left;
        if (hint && hintOver) over = Math.max(over, hint.bottom);
        const inset = {
          pad,
          top: first.top - over,
          left: Math.min(...text.map((t) => t.left)) - box.left - parseFloat(style.borderLeftWidth),
          bottom: box.bottom - parseFloat(style.borderBottomWidth) - text.at(-1)!.bottom,
        };
        const entries = [...card.querySelectorAll('dt')]
          .filter((dt) => dt.getClientRects().length > 0)
          .map((dt) => dt.textContent!.trim());
        const { rotate, transform } = getComputedStyle(card);
        return { box, stack, view, covered, smallest: Math.min(...sizes), entries, rotate, transform, inset, hintOver };
      }, entryText.toString());
      expect(geometry.box.top, 'tucked under the stack').toBeLessThan(geometry.stack.bottom);
      expect(geometry.box.bottom, 'sticks out below it').toBeGreaterThan(geometry.stack.bottom);
      expect(geometry.box.bottom, 'inside the boundary').toBeLessThanOrEqual(geometry.view.bottom);
      expect(geometry.covered, 'lines covered by the sheets').toBe(0);
      expect(geometry.smallest).toBeGreaterThanOrEqual(8);
      // Stacked, the slip keeps to the title and the notes.
      expect(geometry.entries).toEqual(['Title', 'Notes']);
      expect(geometry.rotate, 'square to the stack').toBe('none');
      expect(geometry.transform, 'square to the stack').toBe('none');
      // The same inset all round: the sides, the foot, and over the first entry the fan or the
      // hint, whichever is lower over its text.
      const { pad, top, left, bottom } = geometry.inset;
      expect(Math.abs(left - pad), `inset at the side (${left} against ${pad})`).toBeLessThanOrEqual(1);
      expect(Math.abs(bottom - pad), `inset at the foot (${bottom} against ${pad})`).toBeLessThanOrEqual(1);
      expect(Math.abs(top - pad), `inset over the first entry (${top} against ${pad})`).toBeLessThanOrEqual(1.5);
    }

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

// The title rises beside the peel hint where its text is clear of the hint's words and arrow,
// and stays under them where they are over it. On a phone they are; at 768px the title is short
// enough to stand left of them, and the notes, which run the slip's width, go under them.
for (const [width, under] of [[390, true], [768, false]] as const) {
  test(`the title ${under ? 'stays under' : 'rises beside'} the peel hint at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    const callout = page.locator('#demos .callout[data-card]:has(.technical-drawing-frame[data-hint-show])');
    await expect(callout).toHaveCount(1);
    await callout.locator('.callout-card').evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await page.evaluate(() => document.fonts.ready);

    const result = await callout.evaluate((el, entryTextSource) => {
      const entryText = new Function(`return ${entryTextSource}`)() as (cell: Element) => { left: number; right: number; top: number; bottom: number };
      const card = el.querySelector<HTMLElement>('.callout-card')!;
      const pad = parseFloat(getComputedStyle(card).paddingLeft);
      const hint = el.querySelector('.flip-hint--fwd.hint-words')!.getBoundingClientRect();
      const frame = el.querySelector('.technical-drawing-frame')!.getBoundingClientRect();
      return [...card.querySelectorAll('.title-cell')]
        .filter((cell) => cell.getClientRects().length > 0)
        .map(entryText)
        .map((t) => ({ top: t.top, overlaps: t.right + pad > hint.left && t.left - pad < frame.right, clear: t.top - hint.bottom, pad }));
    }, entryText.toString());

    const [title, ...rest] = result;
    expect(title.overlaps, 'the hint is over the title').toBe(under);
    if (under) expect(title.clear, 'title under the hint').toBeGreaterThanOrEqual(title.pad - 1);
    else expect(title.clear, 'title risen beside the hint').toBeLessThan(0);
    for (const entry of rest.filter((e) => e.overlaps)) {
      expect(entry.clear, 'entry under the hint').toBeGreaterThanOrEqual(entry.pad - 1);
    }
  });
}
