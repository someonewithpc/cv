import { expect, test } from '@playwright/test';

declare global {
  interface Window {
    __themeWipes: { pseudoElement: string; clipPaths: string[] }[];
    __viewTransitions: number;
  }
}

// The wipe is a WAAPI animation on a ::view-transition-new pseudo-element, which
// getAnimations() only reports for the half second it runs. Record the calls instead
// of racing them.
const instrument = async (page: import('@playwright/test').Page) => {
  await page.addInitScript(() => {
    window.__themeWipes = [];
    window.__viewTransitions = 0;

    const startViewTransition = document.startViewTransition?.bind(document);
    if (startViewTransition) {
      document.startViewTransition = (callback) => {
        window.__viewTransitions += 1;
        return startViewTransition(callback);
      };
    }

    const animate = Element.prototype.animate;
    Element.prototype.animate = function (keyframes, options) {
      const pseudoElement = typeof options === 'object' && options ? options.pseudoElement : null;
      if (pseudoElement?.includes('view-transition')) {
        window.__themeWipes.push({
          pseudoElement,
          clipPaths: (keyframes as Keyframe[]).map((frame) => String(frame.clipPath)),
        });
      }
      return animate.call(this, keyframes, options);
    };
  });
};

const pick = async (page: import('@playwright/test').Page, theme: string) => {
  await page.locator(`#theme-picker label:has(input[value="${theme}"])`).click();
  await page.waitForTimeout(900);
};

const widest = (clipPath: string) => Math.max(...[...clipPath.matchAll(/-?\d+(\.\d+)?/g)].map((m) => Math.abs(+m[0])));

test.use({ reducedMotion: 'no-preference' });

test('every theme wipes in from its icon and sticks', async ({ page }) => {
  await instrument(page);
  await page.goto('/');
  await expect(page.locator('#theme-picker input')).toHaveCount(4);

  for (const theme of ['dark', 'arctic', 'dark-forest', 'light']) {
    await pick(page, theme);

    const wipes = await page.evaluate(() => window.__themeWipes.splice(0));
    expect(wipes, `no clip-path wipe for ${theme}`).toHaveLength(1);
    expect(wipes[0].pseudoElement).toBe('::view-transition-new(theme-transition)');

    // Starts at the icon in the picker, ends well past the viewport.
    const [from, to] = wipes[0].clipPaths;
    expect(from).toMatch(/^path\("M /);
    expect(widest(to)).toBeGreaterThan(widest(from) * 2);

    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    expect(await page.evaluate(() => localStorage.getItem('cv-theme'))).toBe(theme);
  }

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('#theme-picker input[value="light"]')).toBeChecked();
});

test('picking the theme already on screen does not start a transition', async ({ page }) => {
  await instrument(page);
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');

  // Nothing stored, so no radio is checked and the dark theme comes from the OS alone.
  await expect(page.locator('#theme-picker input:checked')).toHaveCount(0);

  await pick(page, 'dark');
  expect(await page.evaluate(() => window.__viewTransitions)).toBe(0);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  await pick(page, 'arctic');
  expect(await page.evaluate(() => window.__viewTransitions)).toBe(1);
});
