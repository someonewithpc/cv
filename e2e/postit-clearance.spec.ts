import { expect, test } from '@playwright/test';

import { frontPage, frontPageIndex } from './support/paperStack';

// A note keeps clear of its sheet's frame line on every side, and of the title block below it
// when it sits beside the artwork. What is measured is everything the note paints: its box as
// tilted, the tape over its top edge, and its shadow, unless the paper is masked to its box.
const LEAST = { paper: 16, shadow: 4 };

function faultsOf(notes: HTMLElement[], { least, block }: { least: typeof LEAST; block: boolean }) {
  const px = (value: string) => parseFloat(value) || 0;

  // "rgba(0, 0, 0, 0.2) 0px 4px 6px 4px, ..." and each drop-shadow()'s "rgba(...) 0px 4px 5px"
  const shadowReach = (list: string, spreads: boolean) => {
    const reach = { top: 0, right: 0, bottom: 0, left: 0 };
    for (const shadow of list.split(/,(?![^(]*\))/)) {
      if (shadow.includes('inset')) continue;
      const lengths = [...shadow.replace(/rgba?\([^)]*\)/, '').matchAll(/-?[\d.]+px/g)].map((m) => px(m[0]));
      if (lengths.length < 2) continue;
      const [x, y, blur = 0, spread = 0] = lengths;
      const out = blur + (spreads ? spread : 0);
      reach.top = Math.max(reach.top, out - y);
      reach.bottom = Math.max(reach.bottom, out + y);
      reach.left = Math.max(reach.left, out - x);
      reach.right = Math.max(reach.right, out + x);
    }
    return reach;
  };

  const faults: string[] = [];
  for (const note of notes) {
    const box = note.getBoundingClientRect();
    const paper = { top: box.top, right: box.right, bottom: box.bottom, left: box.left };
    const ink = { ...paper };
    const style = getComputedStyle(note);
    if (style.maskImage === 'none') {
      const reaches = [
        shadowReach(style.boxShadow === 'none' ? '' : style.boxShadow, true),
        ...[...style.filter.matchAll(/drop-shadow\(((?:[^()]|\([^()]*\))*)\)/g)].map((m) => shadowReach(m[1], false)),
      ];
      for (const reach of reaches) {
        ink.top = Math.min(ink.top, paper.top - reach.top);
        ink.bottom = Math.max(ink.bottom, paper.bottom + reach.bottom);
        ink.left = Math.min(ink.left, paper.left - reach.left);
        ink.right = Math.max(ink.right, paper.right + reach.right);
      }
      const overhang = -px(getComputedStyle(note, '::before').top);
      if (overhang > 0) ink.top = Math.min(ink.top, paper.top - overhang);
    }

    const sheet = note.closest('section')!;
    const s = sheet.getBoundingClientRect();
    // The sheet's border, its mat, then the one-pixel frame line.
    const inset = px(getComputedStyle(sheet).borderTopWidth) + px(getComputedStyle(sheet).paddingTop) + 1;
    const frame = { top: s.top + inset, right: s.right - inset, bottom: s.bottom - inset, left: s.left + inset };
    const table = block ? sheet.querySelector(':scope > table')?.getBoundingClientRect() : undefined;
    const underBlock = !!table && table.width > 0 && paper.right > table.left && paper.left < table.right;
    const floor = underBlock ? Math.min(frame.bottom, table!.top) : frame.bottom;

    const name = `"${note.textContent!.trim().slice(0, 24)}" (${note.dataset.paper})`;
    for (const [what, edges, min] of [['paper', paper, least.paper], ['shadow', ink, least.shadow]] as const) {
      const gaps = {
        top: edges.top - frame.top,
        right: frame.right - edges.right,
        bottom: floor - edges.bottom,
        left: edges.left - frame.left,
      };
      for (const [side, gap] of Object.entries(gaps)) {
        if (gap >= min) continue;
        const from = side === 'bottom' && underBlock ? 'the title block' : `the ${side} edge`;
        faults.push(`${name}: ${what} ${Math.round(gap)}px from ${from}`);
      }
    }
  }
  return faults;
}

// 980 is about the narrowest window that still shows the notes beside the artwork.
for (const width of [980, 1100, 1440]) {
  test(`notes beside the artwork stay clear of the sheet's edges and the title block at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');

    const notes = page.locator('aside.marker-font:visible');
    expect(await notes.count()).toBeGreaterThan(0);
    expect(await notes.evaluateAll(faultsOf, { least: LEAST, block: true })).toEqual([]);
  });
}

// On a phone the note opens over its sheet from the folded corner.
test('an opened note stays clear of its sheet\'s edges on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  // The first stack whose front sheet has a note.
  for (const stack of await page.locator('article.technical-drawing-stack').all()) {
    const fold = frontPage(stack, await frontPageIndex(stack)).locator('.note-fold');
    if (!(await fold.isVisible())) continue;
    // Centred, so nothing fixed to the viewport is over the corner.
    await stack.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    // The tab is a triangle clipped from its box, so aim inside it: the box's centre sits on
    // the diagonal and lands on the tab or the sheet by the sub-pixel.
    const box = (await fold.boundingBox())!;
    await fold.click({ position: { x: box.width * 0.25, y: box.height * 0.75 } });
    break;
  }
  const note = page.locator('dialog:modal aside.marker-font, dialog:popover-open aside.marker-font');
  await expect(note).toBeVisible();
  // The card fades and slides in.
  await page.waitForTimeout(400);

  expect(await note.evaluateAll(faultsOf, { least: LEAST, block: false })).toEqual([]);
});
