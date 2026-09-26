import { expect, test } from '@playwright/test';

test('every section number shares one axis, centred in the desk between the window edge and the mat', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1920, height: 900 });
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);

  const problems: string[] = [];
  for (let width = 1216; width <= 1920; width += 8) {
    await page.setViewportSize({ width, height: 900 });
    const { matLeft, folios } = await page.evaluate(() => ({
      matLeft: document.querySelector('#demos .cutting-mat')!.getBoundingClientRect().left,
      folios: [...document.querySelectorAll<HTMLElement>('.folio-rail')].map((rail) => {
        const number = rail.querySelector('.folio-number')!;
        const box = number.getBoundingClientRect();
        const label = rail.querySelector('.folio-label')!.getBoundingClientRect();
        return {
          number: number.textContent,
          shown: box.width > 0,
          left: box.left,
          right: box.right,
          labelLeft: label.left,
          labelRight: label.right,
        };
      }),
    }));
    if (folios.length < 2) problems.push(`${width}px: ${folios.length} section numbers`);

    const axis = matLeft / 2;
    for (const { number, shown, left, right, labelLeft, labelRight } of folios) {
      if (!shown) {
        problems.push(`${number} at ${width}px: hidden`);
        continue;
      }
      const centre = (left + right) / 2;
      if (Math.abs(centre - axis) > 0.5) {
        problems.push(`${number} at ${width}px: centre ${centre.toFixed(1)}, axis ${axis.toFixed(1)}`);
      }
      const labelCentre = (labelLeft + labelRight) / 2;
      if (Math.abs(labelCentre - axis) > 0.5) {
        problems.push(`${number} label at ${width}px: centre ${labelCentre.toFixed(1)}, axis ${axis.toFixed(1)}`);
      }
      if (left <= 0 || right >= matLeft) {
        problems.push(`${number} at ${width}px: ${left.toFixed(1)}px from the window, ${(matLeft - right).toFixed(1)}px from the mat`);
      }
      if (labelLeft <= 0 || labelRight >= matLeft) {
        problems.push(`${number} label at ${width}px: ${labelLeft.toFixed(1)}px from the window, ${(matLeft - labelRight).toFixed(1)}px from the mat`);
      }
    }
  }

  expect(problems).toEqual([]);
});
