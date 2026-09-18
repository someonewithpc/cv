import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('every contribution row wears the external-link mark, and none nests a link in its summary', async ({ page }) => {
  const summaries = page.locator('#open-source details > summary');
  const rows = await summaries.count();
  expect(rows).toBeGreaterThan(0);

  // A link inside <summary> nests one control in another; the mark is decoration.
  expect(await page.locator('#open-source details > summary a').count()).toBe(0);

  const marks = await summaries.evaluateAll((els) =>
    els.map((el) => {
      const svg = el.querySelector('svg.external-link');
      if (!svg) return null;
      const box = svg.getBoundingClientRect();
      return {
        width: box.width,
        height: box.height,
        hidden: svg.getAttribute('aria-hidden'),
        resolves: !!svg.querySelector('use, symbol'),
      };
    }),
  );
  expect(marks.filter((mark) => mark === null)).toEqual([]);
  for (const mark of marks) {
    expect(mark!.width).toBeGreaterThan(0);
    expect(mark!.height).toBeGreaterThan(0);
    expect(mark!.hidden).toBe('true');
    expect(mark!.resolves).toBe(true);
  }
});

test('the row title is underlined in its own ink and the mark is not', async ({ page }) => {
  const title = page.locator('#open-source details > summary .title').first();
  const text = title.locator('.title-text');

  await expect(text).toHaveCSS('text-decoration-line', 'underline');

  const styles = await title.evaluate((el) => {
    const textSpan = el.querySelector('.title-text')!;
    const mark = el.querySelector('svg.external-link')!;
    const textStyle = getComputedStyle(textSpan);
    return {
      color: textStyle.color,
      decorationColor: textStyle.textDecorationColor,
      markDecoration: getComputedStyle(mark).textDecorationLine,
    };
  });
  // Its own ink, not a link colour.
  expect(styles.decorationColor).toBe(styles.color);
  expect(styles.markDecoration).toBe('none');
});
