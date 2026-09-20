import { expect, type Page, test } from '@playwright/test';

/** Prose and code: what a page puts in its artwork cell and never moves again. */
const PROSE = 'p, li, h3, h4, dd, dt, figcaption';

/**
 * Landscape sheets, from a narrow laptop to wider than the 60em the page content caps at.
 * Below 40em the sheet turns portrait and gives the title block a row of its own, which has
 * no room problem to solve.
 */
const WIDTHS = [760, 1024, 1440];

/**
 * Pages whose artwork asks for more room than the column it was given, so it runs under the
 * block wherever the block is. Nothing about the sheet's own width says so, which is why the
 * sheet-width ladder cannot answer them. Space Builder's cover page hands its scene the whole
 * sheet; the Visrez listing is a full-width code block.
 */
const OVERRUNS_ITS_COLUMN = ['Space Builder · Add Tool', 'Path Data'];

// The walkthroughs move panels around while they play; a still page is what can be measured.
test.use({ reducedMotion: 'reduce' });

type Sheet = { title: string; buried: string[] };

/**
 * Every page of every stack. Once a stack's script runs, all of its pages share one grid cell
 * and only the fold clip-path says which is in front, so every page's boxes are live and can
 * be measured without turning to it.
 */
async function sheets(page: Page, selector: string): Promise<Sheet[]> {
  const stacks = page.locator('article.technical-drawing-stack');
  const count = await stacks.count();
  expect(count).toBeGreaterThan(0);

  const all: Sheet[] = [];
  for (let index = 0; index < count; index += 1) {
    const stack = stacks.nth(index);
    await stack.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(2500);

    const found = await stack.evaluate((el, what) =>
      [...el.querySelectorAll('section')].map((section) => {
        const block = section.querySelector(':scope > table');
        const cell = section.querySelector(':scope > .content');
        if (!block || !cell) return null;

        const box = block.getBoundingClientRect();
        const artwork = cell.getBoundingClientRect();
        const over = (rect: DOMRect) => rect.right > box.left && rect.left < box.right
          && rect.bottom > box.top && rect.top < box.bottom;

        const buried = [...cell.querySelectorAll(what)]
          .map((node) => ({ node, rect: node.getBoundingClientRect() }))
          .filter(({ rect }) => rect.width > 0 && rect.height > 0)
          // The artwork itself can be focusable: a scene takes arrow keys, a map takes over
          // on focus. Anything that large is the backdrop, not something being buried.
          .filter(({ rect }) => rect.width * rect.height < artwork.width * artwork.height * 0.4)
          // A pin or a panel that hangs out of its own cell is that demo's overflow to
          // answer; the block can only be asked to stay out of the cell it was given.
          .filter(({ rect }) => rect.left >= artwork.left - 1 && rect.right <= artwork.right + 1)
          .filter(({ rect }) => over(rect))
          .map(({ node }) => node.textContent?.trim().replace(/\s+/g, ' ').slice(0, 24)
            || node.tagName.toLowerCase());

        return {
          title: section.querySelector('h2')?.textContent?.trim() ?? '?',
          buried: [...new Set(buried)],
        };
      }).filter(Boolean), selector);

    all.push(...(found as Sheet[]));
  }
  return all;
}

const under = (all: Sheet[], except: string[] = []) => Object.fromEntries(
  all.filter((sheet) => sheet.buried.length > 0 && !except.includes(sheet.title))
    .map((sheet) => [sheet.title, sheet.buried]),
);

for (const width of WIDTHS) {
  test(`the title block buries no text at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');

    expect(under(await sheets(page, PROSE), OVERRUNS_ITS_COLUMN)).toEqual({});
  });
}

/**
 * The projection symbol is drawn in its own corner cell or not at all. A sheet that has shed
 * the Proj. cell shows no symbol anywhere else in the block, beside the title least of all.
 */
for (const [width, height] of [[390, 844], [760, 900], [1024, 900], [1440, 900]]) {
  test(`the projection symbol stays in its own cell at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/');

    const blocks = page.locator('article.technical-drawing-stack section > table');
    expect(await blocks.count()).toBeGreaterThan(0);

    const strays = await blocks.evaluateAll((tables) => tables.flatMap((table) => {
      const cell = table.querySelector<HTMLElement>('.title-proj');
      const cellShown = cell !== null && getComputedStyle(cell).display !== 'none';
      return [...table.querySelectorAll<SVGElement>('svg[data-icon="first-angle-projection"]')]
        .filter((svg) => !cellShown || svg.closest('.title-proj') !== cell)
        .filter((svg) => svg.getBoundingClientRect().width > 0)
        .map(() => table.getAttribute('aria-label'));
    }));
    expect(strays).toEqual([]);

    // The cell itself is drawn on a desktop sheet and shed on a phone sheet.
    const cell = blocks.first().locator('.title-proj');
    if (width >= 1024) await expect(cell).toBeVisible();
    else if (width < 760) await expect(cell).toBeHidden();
  });
}
