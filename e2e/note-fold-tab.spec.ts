import { expect, test } from '@playwright/test';

import { frontPageName } from './support/paperStack';

/**
 * Between the portrait breakpoint and 56em the note is tucked behind a folded
 * corner in the sheet's bottom-left. 800px puts every stack in that state.
 */
const TUCKED = { width: 800, height: 1000 };

/** Buttons, links and fields. A scene's own surface is not one of these. */
const CONTROLS = 'a[href], button, input, select, textarea, [role="button"], [draggable="true"]';

/**
 * The tab lies on the artwork on purpose, so a demo's backdrop may run under it.
 * A control may not, and nothing may paint over the tab itself.
 */
test('the tucked note tab covers no control, and nothing covers it', async ({ page }) => {
  await page.setViewportSize(TUCKED);
  await page.goto('/');

  const stacks = page.locator('article.technical-drawing-stack');
  const stackCount = await stacks.count();
  expect(stackCount).toBeGreaterThan(0);

  let pagesChecked = 0;
  for (let index = 0; index < stackCount; index += 1) {
    const stack = stacks.nth(index);
    // Centred, not merely in view: the page's own desktop-hint footer is fixed to
    // the bottom of the viewport and would answer the hit tests below.
    await stack.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(2000);

    const pageCount = await stack.locator(':scope > div').count();
    for (let turn = 0; turn < pageCount; turn += 1) {
      if (turn > 0) {
        const before = await frontPageName(stack);
        await stack.focus();
        await page.keyboard.press('ArrowRight');
        await expect.poll(async () => frontPageName(stack), { timeout: 15_000 }).not.toBe(before);
        await page.waitForTimeout(800);
      }

      const measured = await stack.evaluate((el, controls) => {
        const front = [...el.children].find(
          (wrapper) => getComputedStyle(wrapper).getPropertyValue('--page-index').trim() === '1',
        ) ?? el.children[0];
        const tab = front.querySelector('.note-fold');
        if (!tab || getComputedStyle(tab).display === 'none') return null;

        const box = tab.getBoundingClientRect();
        const cell = front.querySelector('.content')!.getBoundingClientRect();

        /* Sample inside the tab's own triangle and read back what is painted
           there: a scene stacks its chrome up to z-index 30 inside the cell, and
           that used to outrank the tab. */
        const covered = [
          [box.left + box.width * 0.1, box.bottom - box.height * 0.1],
          [box.left + box.width * 0.3, box.bottom - box.height * 0.1],
          [box.left + box.width * 0.1, box.bottom - box.height * 0.5],
        ].filter(([x, y]) => !document.elementsFromPoint(x, y)[0]?.classList.contains('note-fold')).length;

        const overlapping = [...front.querySelectorAll(controls)]
          .filter((node) => node !== tab && !tab.contains(node))
          .map((node) => ({ node, rect: node.getBoundingClientRect() }))
          .filter(({ rect }) => rect.width > 0 && rect.height > 0)
          // The artwork itself can be focusable: the map takes over on focus, the
          // scene apps take arrow keys. Anything that large is the backdrop the
          // tab is meant to lie on, and a control is small next to the cell.
          .filter(({ rect }) => rect.width * rect.height < cell.width * cell.height * 0.4)
          .filter(({ rect }) =>
            rect.right > box.left && rect.left < box.right && rect.bottom > box.top && rect.top < box.bottom)
          // A control parked off-frame by a transform still reports a box there.
          .filter(({ node, rect }) => {
            const x = Math.min(Math.max((Math.max(box.left, rect.left) + Math.min(box.right, rect.right)) / 2, box.left + 1), box.right - 1);
            const y = Math.min(Math.max((Math.max(box.top, rect.top) + Math.min(box.bottom, rect.bottom)) / 2, box.top + 1), box.bottom - 1);
            return document.elementsFromPoint(x, y).includes(node);
          })
          .map(({ node }) => `${node.tagName.toLowerCase()}.${(node.getAttribute('class') ?? '').split(' ')[0]}`);

        return { title: front.querySelector('h2.typewriter')?.textContent?.trim(), covered, overlapping };
      }, CONTROLS);

      if (!measured) continue;
      pagesChecked += 1;

      expect(measured.overlapping, `${measured.title}: the note tab lies on a control`).toEqual([]);
      expect(measured.covered, `${measured.title}: something paints over the note tab`).toBe(0);
    }
  }

  expect(pagesChecked, 'no page showed a tucked note tab to check').toBeGreaterThan(0);
});
