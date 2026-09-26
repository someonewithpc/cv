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

// The slip rises as far as the peel hint allows piece by piece: the title's label, each line of
// text and each rule keep the slip's inset below the hint only where the hint's words and arrow
// are over them. On a phone the label would crowd the words, so the title stays under them; at
// 560px the label stands level with the hint, left of it, with its text under it; at 768px the
// title's text fits beside it too, and the notes and the rule over them run on under it.
for (const [width, place] of [[390, 'under'], [560, 'level'], [768, 'beside']] as const) {
  test(`the title stands ${place === 'under' ? 'under' : 'beside'} the peel hint at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    const callout = page.locator('#demos .callout[data-card]:has(.technical-drawing-frame[data-hint-show])');
    await expect(callout).toHaveCount(1);
    await callout.locator('.callout-card').evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await page.evaluate(() => document.fonts.ready);

    const { pad, beside, hint, label, pieces } = await callout.evaluate((el) => {
      const card = el.querySelector<HTMLElement>('.callout-card')!;
      const words = el.querySelector('.flip-hint--fwd.hint-words')!.getBoundingClientRect();
      const frame = el.querySelector('.technical-drawing-frame')!.getBoundingClientRect();
      const range = document.createRange();
      const lines = (node: Element) => {
        range.selectNodeContents(node);
        return [...range.getClientRects()].filter((r) => r.width > 0);
      };
      const cells = [...card.querySelectorAll('.title-cell')].filter((cell) => cell.getClientRects().length > 0);
      const pieces = cells.flatMap((cell) => {
        const dt = cell.querySelector('dt')!.getBoundingClientRect();
        const box = cell.getBoundingClientRect();
        const rule = parseFloat(getComputedStyle(cell).borderBottomWidth);
        return [
          { top: dt.top, left: dt.left, right: dt.left + Math.max(...lines(cell.querySelector('dt')!).map((r) => r.width)) },
          ...lines(cell.querySelector('dd')!).map((r) => ({ top: r.top, left: r.left, right: r.right })),
          ...(rule ? [{ top: box.bottom - rule, left: box.left, right: box.right }] : []),
        ];
      });
      const [label] = pieces;
      const dt = cells[0].querySelector('dt')!.getBoundingClientRect();
      return {
        pad: parseFloat(getComputedStyle(card).paddingLeft),
        // Text beside the hint keeps 3rem from its words (Callout.astro).
        beside: 3 * parseFloat(getComputedStyle(document.documentElement).fontSize),
        hint: { top: words.top, bottom: words.bottom, left: words.left, right: frame.right },
        label: { ...label, bottom: dt.bottom },
        pieces,
      };
    });

    if (place === 'under') {
      expect(label.top - hint.bottom, 'title under the hint').toBeGreaterThanOrEqual(pad - 1);
    } else {
      expect(label.top, 'title risen beside the hint').toBeLessThan(hint.bottom);
      expect(label.right + pad, 'label left of the hint').toBeLessThanOrEqual(hint.left);
    }
    if (place === 'level') {
      expect(label.top, 'label on the hint line').toBeLessThan(hint.bottom);
      expect(label.bottom, 'label on the hint line').toBeGreaterThan(hint.top);
    }
    for (const piece of pieces) {
      // Clear of the words and of the arrow that runs on from their end.
      if (piece.top < hint.bottom + pad - 1) expect(piece.right + beside, 'text beside the hint stays left of it').toBeLessThanOrEqual(hint.left + 1);
      if (piece.right + pad > hint.left && piece.left - pad < hint.right) {
        expect(piece.top - hint.bottom, 'under the hint by the inset').toBeGreaterThanOrEqual(pad - 1);
      }
    }
    // It rises as far as that allows: whatever holds it down is the inset below the hint.
    const held = Math.min(...pieces.filter((p) => p.right + Math.max(pad, beside) > hint.left).map((p) => p.top - hint.bottom));
    expect(Math.abs(held - pad), `held the inset below the hint (${held} against ${pad})`).toBeLessThanOrEqual(1.5);
  });
}
