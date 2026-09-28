import { expect, test } from '@playwright/test';

// A screen reader can read an unlabelled <svg> as "image" or "group". Each one on the page
// says what it is: aria-hidden when it only decorates, role="img" with a name when it is the
// picture, role="presentation" when its own text (the callout labels) should be read.
for (const width of [1440, 390]) {
  test(`every inline SVG at ${width} is hidden, named or presentational`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    for (const stack of await page.locator('article.technical-drawing-stack').all()) {
      await stack.scrollIntoViewIfNeeded();
    }
    await page.waitForTimeout(2000);

    const bare = await page.evaluate(() =>
      [...document.querySelectorAll('svg')]
        .filter((svg) => !svg.parentElement?.closest('svg, [aria-hidden="true"]'))
        .filter((svg) => {
          if (svg.getAttribute('aria-hidden') === 'true') return false;
          const role = svg.getAttribute('role');
          if (role === 'presentation' || role === 'none') return false;
          return !(role === 'img' && (svg.getAttribute('aria-label') || svg.querySelector(':scope > title')));
        })
        .map((svg) => `${svg.parentElement?.className} > svg.${svg.getAttribute('class') ?? ''}`),
    );
    expect(bare).toEqual([]);
  });
}
