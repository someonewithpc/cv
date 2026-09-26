import { expect, test } from '@playwright/test';

test('every section number is centred in the desk between the window edge and its paper', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1920, height: 900 });
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);

  const offCentre: string[] = [];
  for (let width = 1216; width <= 1920; width += 8) {
    await page.setViewportSize({ width, height: 900 });
    const gaps = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('.folio-rail')].map((rail) => {
        const section = rail.nextElementSibling!;
        const paper = (section.querySelector(':scope > .cutting-mat') ?? section).getBoundingClientRect();
        const number = rail.querySelector('.folio-number')!;
        const box = number.getBoundingClientRect();
        return { number: number.textContent, shown: box.width > 0, left: box.left, right: paper.left - box.right };
      }),
    );
    for (const { number, shown, left, right } of gaps) {
      if (!shown) offCentre.push(`${number} at ${width}px: hidden`);
      else if (Math.abs(left - right) > 1) {
        offCentre.push(`${number} at ${width}px: ${left.toFixed(1)}px left, ${right.toFixed(1)}px right`);
      }
    }
  }

  expect(offCentre).toEqual([]);
});
