import { demoStack, frontPage, frontPageIndex, waitForIslandMounted } from './support/paperStack';
import { expect, test } from './support/timeScale';

/**
 * The size control runs from 0.5em to 2em, as the product's does, and at 2em the specimen's
 * samples stand twice the sheet's height. On a landscape sheet the title block also reaches
 * into the specimen's column. At every step the readout and every sample left showing stay
 * on the sheet and clear of the title block and the note.
 */
for (const viewport of [{ width: 1440, height: 900 }, { width: 820, height: 900 }]) {
  test(`the specimen stays on the sheet at every size at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    const stack = demoStack(page, 'Interactive Map Font Picker');
    await stack.scrollIntoViewIfNeeded();
    const front = frontPage(stack, await frontPageIndex(stack));
    const island = await waitForIslandMounted(front);
    const size = island.locator('input[data-demo-target="size"]');
    await expect(size).toBeVisible({ timeout: 15_000 });
    await size.focus();

    for (let step = 0.5; step <= 2; step += 0.125) {
      await size.fill(String(step));
      await expect(island.locator('.specimen figcaption')).toContainText(`${step}em`);
      const clashes = await front.evaluate((wrapper) => {
        const section = wrapper.querySelector('section')!;
        const box = (el: Element | null) => el?.getBoundingClientRect();
        const sheet = box(section)!;
        const specimen = box(section.querySelector('.specimen'))!;
        const blocks = [section.querySelector(':scope > table'), ...section.querySelectorAll('.aside .note-card > *')]
          .map(box).filter((r): r is DOMRect => r !== undefined && r.width > 0);
        const meets = (a: DOMRect, b: DOMRect) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
        // A sample that wrapped out sits in the clipped second column, right of the specimen
        const shown = [...section.querySelectorAll('.specimen-samples > *, .specimen figcaption')]
          .map((el) => [el.className, el.getBoundingClientRect()] as const)
          .filter(([, r]) => r.width > 0 && r.left < specimen.right - 1);
        return shown.flatMap(([name, r]) => [
          ...(r.top < sheet.top || r.bottom > sheet.bottom || r.left < sheet.left || r.right > sheet.right ? [`${name} off the sheet`] : []),
          ...blocks.filter((b) => meets(r, b)).map(() => `${name} over the title block or note`),
        ]);
      });
      expect(clashes, `at ${step}em`).toEqual([]);
    }
    await expect(island.locator('.specimen-display')).toBeVisible();
  });
}
