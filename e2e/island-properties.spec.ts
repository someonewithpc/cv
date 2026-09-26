import { demoStack, turnToPage } from './support/paperStack';
import { expect, test } from './support/timeScale';

// The tagging tool's save ring and the font picker's fieldset border each animate three custom
// properties. The stylesheet registers them with @property: an unregistered property has no
// type, so a keyframe between two angles would flip halfway instead of moving.
const PROPERTIES = {
  '--status-border-colored-width': '360deg',
  '--status-border-color': 'rgb(187, 187, 187)',
  '--status-border-start': '0deg',
  '--font-settings-border-colored-width': '360deg',
  '--font-settings-border-color': 'rgb(187, 187, 187)',
  '--font-settings-border-start': '0deg',
};

test.describe('without JS', () => {
  test.use({ javaScriptEnabled: false });

  test('the stylesheet registers the six border properties', async ({ page }) => {
    await page.goto('/');
    // A registered property computes to its initial value on an element that never sets it
    const values = await page.locator('body').evaluate((body, names) => {
      const style = getComputedStyle(body);
      return Object.fromEntries(names.map((name) => [name, style.getPropertyValue(name).trim()]));
    }, Object.keys(PROPERTIES));
    expect(values).toEqual(PROPERTIES);
  });
});

/** Puts the element in its pending orbit, frozen halfway, and says where the arc starts. */
async function halfwayStart(element: import('@playwright/test').Locator, property: string) {
  const value = await element.evaluate((el, name) => {
    el.classList.remove('idle', 'success', 'error');
    el.classList.add('pending');
    const orbit = el.getAnimations().find((a) => (a as CSSAnimation).animationName.endsWith('-pending'));
    if (!orbit) return 'no pending animation';
    orbit.pause();
    orbit.currentTime = 500;
    return getComputedStyle(el).getPropertyValue(name).trim();
  }, property);
  expect(value).toMatch(/^[\d.]+deg$/);
  expect(parseFloat(value)).toBeGreaterThan(0);
  expect(parseFloat(value)).toBeLessThan(360);
}

test('the tagging tool save ring passes through the angles between its keyframes', async ({ page }) => {
  await page.goto('/');
  const stack = demoStack(page, 'Library Tagging Tool');
  await stack.scrollIntoViewIfNeeded();
  await halfwayStart(stack.locator('.panel-preview-library-object').first(), '--status-border-start');
});

test('the font picker fieldset border passes through the angles between its keyframes', async ({ page }) => {
  await page.goto('/');
  const stack = demoStack(page, 'Interactive Map Font Picker');
  await stack.scrollIntoViewIfNeeded();
  await turnToPage(stack, 'Loading Indicator');
  await halfwayStart(stack.locator('[data-border-demo]'), '--font-settings-border-start');
});
