import { expect, test } from '@playwright/test';

import { demoStack, frontPage, frontPageIndex, waitForIslandMounted } from './support/paperStack';

/**
 * The live marker editor with its shape fill step open, taken over from the walkthrough
 * before it reaches the colour steps itself, so the picker's state is ours to drive.
 */
async function shapeFillStep(page: import('@playwright/test').Page) {
  await page.goto('/');
  const stack = demoStack(page, 'Interactive Map Marker Editor');
  await stack.scrollIntoViewIfNeeded();
  await waitForIslandMounted(frontPage(stack, await frontPageIndex(stack)));

  const editor = page.locator('.marker-editor:not(.marker-editor--embed)');
  await expect(editor).toBeVisible({ timeout: 60_000 });

  // Hover hands the walkthrough over to the pointer, so the step stays open once clicked.
  await editor.locator('svg').first().hover();
  await editor.locator('[data-demo-target="editor:step:shapeFill"]').first().click();

  const swatch = editor.locator('#marker-fill-color-marker-shape');
  await expect(swatch).toBeVisible();
  return { editor, swatch, picker: swatch.locator('xpath=following-sibling::div') };
}

test('main page: the walkthrough holds still while a native colour picker has focus', async ({ page }) => {
  test.setTimeout(90_000);
  const { swatch } = await shapeFillStep(page);

  // A native picker's popup is outside the document, so the page sees no further pointer
  // activity while it is open and the idle resume (2s) used to fire underneath it.
  await swatch.click({ force: true });
  await page.waitForTimeout(4000);

  await expect(swatch).toBeFocused();
  await expect(page.locator('.mock-map-demo-cursor')).toHaveCount(0);
  await expect(page.getByText('Demo playing · move to take over')).toHaveCount(0);
});

test('main page: the on-page picker opens on a press of the swatch and closes on the ways out', async ({ page }) => {
  test.setTimeout(90_000);
  const { editor, swatch, picker } = await shapeFillStep(page);

  // Closed until pressed.
  await expect(picker).toBeHidden();

  await swatch.click({ force: true });
  await expect(picker).toBeVisible();

  // Pressed again.
  await swatch.click({ force: true });
  await expect(picker).toBeHidden();

  await swatch.click({ force: true });
  await expect(picker).toBeVisible();

  // Escape.
  await page.keyboard.press('Escape');
  await expect(picker).toBeHidden();

  await swatch.click({ force: true });
  await expect(picker).toBeVisible();

  // A press outside the field.
  await editor.locator('svg').first().click();
  await expect(picker).toBeHidden();
});
