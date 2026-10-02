import { expect, test, type Locator, type Page } from '@playwright/test';

import { demoStack, frontPage, frontPageIndex, waitForIslandMounted } from './support/paperStack';

function spaceBuilderStack(page: Page) {
  return demoStack(page, 'Space Builder · Add Tool');
}

/** The object variants demo, whose picker this one reuses. */
function variantsStack(page: Page) {
  return demoStack(page, 'Space Builder · Object Variants');
}

async function waitForSceneReady(front: Locator): Promise<Locator> {
  const island = await waitForIslandMounted(front);
  const app = island.locator('[data-ready]');
  await expect(app).toHaveAttribute('data-ready', 'true', { timeout: 30_000 });
  return app;
}

/** The Add tool's sidebar, open, with the walkthrough handed over to the test. */
async function openCatalog(page: Page): Promise<Locator> {
  const stack = spaceBuilderStack(page);
  await stack.scrollIntoViewIfNeeded();
  const app = await waitForSceneReady(frontPage(stack, await frontPageIndex(stack)));

  await app.focus();
  if ((await app.getAttribute('data-panel')) !== 'catalog') {
    await app.getByRole('button', { name: 'Add object' }).click();
  }
  await expect(app).toHaveAttribute('data-panel', 'catalog');
  return app;
}

function card(app: Locator, id: string) {
  return app.locator(`[data-catalog-item="${id}"]`);
}

/** Clicks where the carousel's next arrow sits, a scroll button with no node of its own. */
async function clickNextArrow(page: Page, styles: Locator) {
  const box = await styles.boundingBox();
  if (!box) throw new Error('The carousel has no layout box');
  await page.mouse.click(box.x + box.width - 14, box.y + box.height / 2);
}

/** Every part of the picker, by the class names the two demos share. */
const PICKER_PARTS = [
  'ul.object-icons.styles',
  'ul.styles > li.style',
  'li.style .group-object-count',
  '.pip-track',
  '.pip-track .pip-trail',
  '.pip-track .active-pip',
  '.item-label .object-name',
  '.object-size',
];

test.describe('desktop', () => {
  // The sizes on the card are printed for the visitor's region; a metric one reads metres.
  test.use({ locale: 'pt-PT' });

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
  });

  test('the selected object\'s card holds the picker, drawn as the variants demo draws it', async ({ page }) => {
    const app = await openCatalog(page);
    const chair = card(app, 'chair');

    // The Add tool opens on the chair, so the picker on show is the selected object's.
    await expect(chair).toHaveClass(/active/);
    await expect(chair.locator('ul.styles > li.style')).toHaveCount(5);
    await expect(chair.locator('li.style').first().locator('.group-object-count'))
      .toContainText('5');

    // The same parts, by the same names, as the card the object variants demo draws.
    // Its panel, not the drawn copy the demo's other sheets carry.
    const reference = variantsStack(page)
      .locator('.variants-stage [data-catalog-item="chair"]').first();
    await reference.scrollIntoViewIfNeeded();
    for (const part of PICKER_PARTS) {
      expect(await chair.locator(part).count(), part)
        .toBe(await reference.locator(part).count());
    }
  });

  test('the banquet set carries the seats and size rows', async ({ page }) => {
    const app = await openCatalog(page);
    const set = card(app, 'table-round');

    await expect(set.locator('details.hover-select')).toHaveCount(2);
    await expect(set.locator('.object-pax .hover-select-current')).toContainText('8 seats');
    // Sizes read with the product's rounding, as VariantsDemo/units.ts prints them.
    await expect(set.locator('.object-size .hover-select-current .option-text'))
      .toHaveText('2.4m x 1.2m');
  });

  test('stepping the carousel picks that finish', async ({ page }) => {
    const app = await openCatalog(page);
    const chair = card(app, 'chair');
    const styles = chair.locator('ul.styles');

    await expect(chair).toHaveAttribute('data-variant', 'chair');
    await clickNextArrow(page, styles);

    await expect(chair).toHaveAttribute('data-variant', 'chair-gold');
    await expect(styles).toHaveAttribute('data-index', '1');
    // A pick on the card already in play keeps it the catalog's selected object.
    await expect(chair).toHaveClass(/active/);
  });

  test('hovering an option shows it and leaving puts the held object back', async ({ page }) => {
    const app = await openCatalog(page);
    const set = card(app, 'table-round');
    const seats = set.locator('.object-pax');

    await seats.locator('.hover-select-current').click();
    await seats.locator('.hover-select-options li').nth(2).locator('button').hover();
    await expect(set).toHaveAttribute('data-variant', 'table-4-243');

    // Out of the card without a click, so nothing was picked.
    const box = await set.boundingBox();
    if (!box) throw new Error('The card has no layout box');
    await page.mouse.move(box.x + box.width + 60, box.y + box.height / 2, { steps: 6 });
    await expect(set).toHaveAttribute('data-variant', 'table-8-243');
  });

  test('picking a seat count selects the set and shows that object', async ({ page }) => {
    const app = await openCatalog(page);
    const set = card(app, 'table-round');

    await set.locator('.object-pax .hover-select-current').click();
    await set.locator('.object-pax .hover-select-options li').nth(1).locator('button')
      .click();

    await expect(set).toHaveAttribute('data-variant', 'table-6-243');
    await expect(set).toHaveClass(/active/);
    await expect(set.locator('.object-icons img'))
      .toHaveAttribute('src', /table-6-thumb(\.[\w-]+)?\.webp$/);
    await expect(card(app, 'chair')).not.toHaveClass(/active/);
  });
});

test.describe('phone', () => {
  test.use({ locale: 'pt-PT', viewport: { width: 390, height: 844 } });

  test('the picker is in the sidebar there too', async ({ page }) => {
    await page.goto('/');
    const app = await openCatalog(page);
    const chair = card(app, 'chair');

    await expect(app.locator('.sidebar')).toBeVisible();
    await expect(chair).toBeVisible();
    await expect(chair.locator('ul.styles > li.style')).toHaveCount(5);
    await expect(chair.locator('.pip-track .active-pip')).toBeAttached();

    const set = card(app, 'table-round');
    await set.scrollIntoViewIfNeeded();
    await expect(set.locator('details.hover-select')).toHaveCount(2);
    await expect(set.locator('.object-pax .hover-select-current')).toBeVisible();
  });
});
