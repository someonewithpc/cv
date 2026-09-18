import { expect, test } from '@playwright/test';

import { frontPage, frontPageIndex, waitForIslandMounted } from './support/paperStack';

/**
 * The editor on the drawing stack's own "Marker Editor" page is `inert` on purpose, a
 * diagram rather than a control. The one a visitor can actually use is the live session the
 * map opens, so that is where the picker has to work.
 */
async function liveEditor(page: import('@playwright/test').Page) {
  await page.goto('/');
  const stack = page.locator('article.technical-drawing-stack').nth(1);
  await stack.scrollIntoViewIfNeeded();
  await waitForIslandMounted(frontPage(stack, await frontPageIndex(stack)));

  const editor = page.locator('.marker-editor:not(.marker-editor--embed)');
  await expect(editor).toBeVisible({ timeout: 60_000 });

  // Hover hands the walkthrough over to the pointer, so the step stays open once clicked.
  await editor.locator('svg').first().hover();
  await editor.locator('[data-demo-target="editor:step:shapeFill"]').first().click();
  return editor;
}

test('the fill colour picker is on the page and a drag paints the preview', async ({ page }) => {
  test.setTimeout(120_000);
  const editor = await liveEditor(page);

  const input = editor.locator('#marker-fill-color-marker-shape');
  await expect(input).toBeVisible();
  const area = input.locator('xpath=following-sibling::div').locator('.marker-color-picker__area');
  await expect(area).toBeVisible();

  const before = await input.inputValue();
  const box = (await area.boundingBox())!;

  // A finger crossing the saturation/value field. Every move has to land a colour: this is
  // the gesture the native chooser cannot show, because it draws over the preview.
  await page.mouse.move(box.x + 3, box.y + box.height - 3);
  await page.mouse.down();
  for (let i = 1; i <= 8; i += 1) {
    await page.mouse.move(
      box.x + 3 + (box.width - 6) * (i / 8),
      box.y + box.height - 3 - (box.height - 6) * (i / 8),
    );
  }
  await page.mouse.up();

  const after = await input.inputValue();
  expect(after).not.toBe(before);

  // The preview reads the parsed rule, not a re-rendered <style>: written inside the event,
  // so it is already there with no frame in between.
  const fill = await page.evaluate(() => {
    const style = document.querySelector('.marker-editor:not(.marker-editor--embed) #marker-content-shapeFill style');
    return ((style as SVGStyleElement | null)?.sheet?.cssRules[0] as CSSStyleRule | undefined)
      ?.style.getPropertyValue('fill') ?? '';
  });
  const channels = [1, 3, 5].map((at) => parseInt(after.slice(at, at + 2), 16));
  expect(fill.replace(/\s/g, '')).toBe(`rgb(${channels.join(',')})`);
});

test('the picker follows a colour the walkthrough writes onto the input', async ({ page }) => {
  test.setTimeout(120_000);
  const editor = await liveEditor(page);

  const input = editor.locator('#marker-fill-color-marker-shape');
  await expect(input).toBeVisible();
  const hueKnob = input.locator('xpath=following-sibling::div').locator('.marker-color-picker__hue .marker-color-picker__knob');

  const at = () => hueKnob.evaluate((knob) => (knob as HTMLElement).style.left);
  const before = await at();

  await input.evaluate((element) => {
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setValue.call(element, '#123456');
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });

  expect(await at()).not.toBe(before);
  expect(await input.inputValue()).toBe('#123456');
});
