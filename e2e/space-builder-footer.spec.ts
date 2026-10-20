import { expect, test, type Locator } from '@playwright/test';

import { demoStack, frontPage, frontPageIndex } from './support/paperStack';
import { waitForSceneReady } from './support/spaceBuilder';

/** How far each footer button runs past the sidebar, which clips it. */
const overrun = (app: Locator) => app.locator('aside.sidebar').evaluate((sidebar) => {
  const edge = sidebar.getBoundingClientRect().right;
  return [...sidebar.querySelectorAll('footer.sidebar-footer > *')]
    .map((child) => child.getBoundingClientRect())
    .filter((box) => box.width > 0)
    .map((box) => Math.round(Math.max(0, box.right - edge)));
});

for (const width of [390, 1440]) {
  test(`the Add tool's footer buttons stay inside the sidebar at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width > 800 ? 900 : 844 });
    await page.goto('/');
    const stack = demoStack(page, 'Space Builder · Add Tool');
    await stack.scrollIntoViewIfNeeded();
    const app = await waitForSceneReady(frontPage(stack, await frontPageIndex(stack)));

    // The walkthrough opens Options, with Clear, Reset and Save, once it has drawn its area
    await expect(app).toHaveAttribute('data-panel', 'options', { timeout: 30_000 });
    expect(await overrun(app), 'Clear, Reset and Save').toEqual([0, 0, 0]);

    // Focus hands the demo over; Go back from Options is the catalog
    await app.focus();
    await app.getByTitle('Go back').click();
    await expect(app).toHaveAttribute('data-panel', 'catalog');
    expect(await overrun(app), 'the drag hint and Build').toEqual([0, 0]);
  });
}
