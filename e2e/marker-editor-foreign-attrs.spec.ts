import { expect, test } from '@playwright/test';

import { demoStack, frontPage, frontPageIndex, waitForIslandMounted } from './support/paperStack';

/**
 * Kept out of marker-editor.spec.ts and marker-editor-pages.spec.ts: parallel branches are
 * editing the Marker Editor, and a test appended to either file conflicts with all of them.
 */

test.beforeEach(async ({ page }) => {
  // Every element a marker part writes `data-kind` onto also gets one attribute with an
  // unknown constructor prefix — the same shape #220 C42 found crashing deserializeMarker.
  await page.addInitScript(() => {
    const setAttribute = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function (name: string, value: string) {
      setAttribute.call(this, name, value);
      if (name === 'data-kind') setAttribute.call(this, 'data-foo-flag', 'Weird:xyz');
    };
  });
  await page.goto('/');
});

function markerEditorStack(page: import('@playwright/test').Page) {
  return demoStack(page, 'Interactive Map Marker Editor');
}

test('a stored marker with a foreign attribute loads without crashing and keeps its known parts', async ({ page }) => {
  const pageErrors: Error[] = [];
  page.on('pageerror', (error) => pageErrors.push(error));

  const stack = markerEditorStack(page);
  await stack.scrollIntoViewIfNeeded();
  const front = frontPage(stack, await frontPageIndex(stack));

  const island = await waitForIslandMounted(front);
  const overlay = island.locator('.mock-map-overlay');
  const pins = overlay.locator('button.space-pin');
  await expect(pins.first()).toBeVisible({ timeout: 15_000 });

  // Pins only answer once a real pointer has taken over from the auto-playing demo.
  await overlay.focus();
  await expect(page.getByText('Demo paused')).toBeVisible();
  await pins.first().click();

  await page.getByRole('option', { name: 'Create new marker' }).click();

  const editor = page.locator('#marker-editor');
  await expect(editor).toBeVisible();

  const shapeOptions = editor.getByRole('listbox', { name: 'Shape' }).locator('[aria-selected="true"]');
  const shapeBefore = await shapeOptions.getAttribute('aria-label');
  expect(shapeBefore).not.toBeNull();

  // Saving serializes the marker (through the patched setAttribute above) and stores it.
  await editor.locator('[data-demo-target="editor:save"]').click();
  await expect(editor).toHaveCount(0);

  // Reopening the same marker runs deserializeMarker again, this time on the stored SVG
  // that now carries the foreign attribute.
  const picker = page.getByRole('listbox', { name: 'Markers' });
  await expect(picker).toBeVisible();
  await picker.getByRole('button', { name: 'Edit marker' }).click();

  await expect(editor).toBeVisible();
  const shapeAfter = await shapeOptions.getAttribute('aria-label');
  expect(shapeAfter).toBe(shapeBefore);

  expect(pageErrors).toEqual([]);
});
