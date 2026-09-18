import { expect, test } from '@playwright/test';

/**
 * Between the portrait breakpoint and 56em the note is tucked behind a folded
 * corner in the sheet's bottom-left. 800px puts every stack in that state.
 */
const TUCKED_LANDSCAPE = { width: 800, height: 1000 };

test('the tucked note tab keeps to the sheet margin, clear of the artwork and its chrome', async ({ page }) => {
  await page.setViewportSize(TUCKED_LANDSCAPE);
  await page.goto('/');

  const stacks = page.locator('article.technical-drawing-stack');
  const count = await stacks.count();
  expect(count).toBeGreaterThan(0);

  let tabsChecked = 0;
  for (let index = 0; index < count; index += 1) {
    const stack = stacks.nth(index);
    // Centred, not merely in view: the page's own desktop-hint footer is fixed to
    // the bottom of the viewport and would answer the hit tests below.
    await stack.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    // The scenes mount on the viewport; give their chrome time to lay itself out.
    await page.waitForTimeout(2500);

    const measured = await stack.evaluate((el) => {
      const front = [...el.children].find(
        (wrapper) => getComputedStyle(wrapper).getPropertyValue('--page-index').trim() === '1',
      ) ?? el.children[0];
      const tab = front.querySelector('.note-fold');
      if (!tab || getComputedStyle(tab).display === 'none') return null;

      const section = front.querySelector('section')!;
      const style = getComputedStyle(section);
      const sectionBox = section.getBoundingClientRect();
      const box = tab.getBoundingClientRect();

      /* The tab is the lower-left triangle of its box. Sample inside it and read
         back what is painted there, rather than comparing boxes: a scene's own
         chrome can be parked off-frame with a transform and still report a
         rectangle over this corner. */
      const samples = [
        [box.left + box.width * 0.1, box.bottom - box.height * 0.1],
        [box.left + box.width * 0.3, box.bottom - box.height * 0.1],
        [box.left + box.width * 0.1, box.bottom - box.height * 0.5],
      ].map(([x, y]) => {
        const painted = document.elementsFromPoint(x, y);
        return {
          top: painted[0]?.classList.contains('note-fold') ?? false,
          fromContent: painted.some((node) => node.closest('.content') !== null),
        };
      });

      return {
        // Where the sheet's grid starts, i.e. the inner edge of the margin.
        gridLeft: sectionBox.left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft),
        tabRight: box.right,
        samples,
      };
    });

    if (!measured) continue;
    tabsChecked += 1;

    expect(measured.tabRight, `stack ${index}: the tab reaches past the sheet margin`)
      .toBeLessThanOrEqual(measured.gridLeft + 1);
    for (const [sample, painted] of measured.samples.entries()) {
      expect(painted.top, `stack ${index}: something paints over the tab at sample ${sample}`).toBe(true);
      expect(painted.fromContent, `stack ${index}: the tab sits on the artwork at sample ${sample}`).toBe(false);
    }
  }

  expect(tabsChecked, 'no stack showed a tucked note tab to check').toBeGreaterThan(0);
});
