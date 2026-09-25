import { expect, test } from '@playwright/test';

/**
 * A title too long for a phone sheet's block takes a second line, never an ellipsis. Every
 * block on the page is walked, whichever stack it is in, so a new stack is covered too.
 */
for (const [width, height] of [[360, 780], [390, 844]]) {
  test(`no title block title is cut off at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/');

    const blocks = page.locator('section > table');
    expect(await blocks.count()).toBeGreaterThan(0);

    const cut = await blocks.evaluateAll((all) => all.flatMap((table) =>
      [...table.querySelectorAll<HTMLElement>('.title-name h2, .title-name h3')]
        .filter((heading) => heading.scrollWidth > heading.clientWidth)
        .map((heading) => `${heading.textContent?.trim()}: ${heading.scrollWidth}px in ${heading.clientWidth}px`)));

    expect(cut).toEqual([]);
  });
}
