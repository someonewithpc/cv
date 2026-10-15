import { expect, test } from '@playwright/test';

import { THEME_IDS, THEME_STORAGE_KEY } from '../src/themes';

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
  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-theme', theme);
  await expect(html).not.toHaveClass(/theme-transition/);
};

const widest = (clipPath: string) => Math.max(...[...clipPath.matchAll(/-?\d+(\.\d+)?/g)].map((m) => Math.abs(+m[0])));

test.use({ reducedMotion: 'no-preference' });

test('every theme wipes in from its icon and sticks', async ({ page }) => {
  await instrument(page);
  await page.goto('/');
  await expect(page.locator('#theme-picker input')).toHaveCount(4);

  for (const theme of THEME_IDS.toReversed()) {
    await pick(page, theme);

    const wipes = await page.evaluate(() => window.__themeWipes.splice(0));
    expect(wipes, `no clip-path wipe for ${theme}`).toHaveLength(1);
    expect(wipes[0].pseudoElement).toBe('::view-transition-new(theme-transition)');

    // Starts at the icon in the picker, ends well past the viewport.
    const [from, to] = wipes[0].clipPaths;
    expect(from).toMatch(/^path\("M /);
    expect(widest(to)).toBeGreaterThan(widest(from) * 2);

    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    expect(await page.evaluate((key) => localStorage.getItem(key), THEME_STORAGE_KEY)).toBe(theme);
  }

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('#theme-picker input[value="light"]')).toBeChecked();
});

const PAGE_BACKGROUNDS = {
  light: 'oklch(1 0 90)',
  dark: 'oklch(0.31 0.02 240)',
  arctic: 'oklch(0.955 0.015 235)',
  'dark-forest': 'oklch(0.323 0.044 139)',
};

const metaThemeColor = (page: import('@playwright/test').Page) => page.evaluate(
  () => document.querySelector('meta[name="theme-color"]')?.getAttribute('content'),
);

test('the theme-color meta follows each pick', async ({ page }) => {
  await page.goto('/');

  for (const [theme, background] of Object.entries(PAGE_BACKGROUNDS)) {
    await pick(page, theme);
    expect(await metaThemeColor(page)).toBe(background);
  }

  await page.reload();
  expect(await metaThemeColor(page)).toBe(PAGE_BACKGROUNDS['dark-forest']);
});

test('a stored theme sets the chrome colour before paint', async ({ page }) => {
  await page.addInitScript((key) => localStorage.setItem(key, 'arctic'), THEME_STORAGE_KEY);
  await page.goto('/');

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'arctic');
  expect(await metaThemeColor(page)).toBe(PAGE_BACKGROUNDS.arctic);
});

test('a second pick during the wipe wins', async ({ page }) => {
  await instrument(page);
  await page.goto('/');

  await page.locator('#theme-picker input[value="dark"]').click({ force: true });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  // The wipe captures <html>, so every point hit-tests to the root while it runs and
  // this click has to be resolved against the labels instead.
  await expect(page.locator('html')).toHaveClass(/theme-transition/);
  await page.locator('#theme-picker input[value="arctic"]').click({ force: true });

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'arctic');
  await expect(page.locator('#theme-picker input[value="arctic"]')).toBeChecked();
  expect(await page.evaluate((key) => localStorage.getItem(key), THEME_STORAGE_KEY)).toBe('arctic');

  // The first transition's cleanup must not strip the class from the second one.
  await expect(page.locator('html')).toHaveClass('');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'arctic');
});

test('a transition that never finishes still applies and persists the pick', async ({ page }) => {
  await instrument(page);
  // Chrome hands a backgrounded tab no rendering opportunities, so a transition
  // started there never settles. The pick has to survive that.
  await page.addInitScript(() => {
    const startViewTransition = document.startViewTransition.bind(document);
    document.startViewTransition = (callback) => ({
      ...startViewTransition(callback),
      ready: new Promise<void>(() => {}),
      finished: new Promise<void>(() => {}),
    }) as ViewTransition;
  });
  await page.goto('/');

  await page.locator('#theme-picker label:has(input[value="dark"])').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await page.evaluate((key) => localStorage.getItem(key), THEME_STORAGE_KEY)).toBe('dark');
});

test('a hidden page skips the transition', async ({ page }) => {
  await instrument(page);
  await page.addInitScript(() => {
    Object.defineProperty(document, 'visibilityState', { get: () => 'hidden' });
  });
  await page.goto('/');

  await pick(page, 'dark');
  expect(await page.evaluate(() => window.__viewTransitions)).toBe(0);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('picking the theme already on screen does not start a transition', async ({ page }) => {
  await instrument(page);
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');

  // Nothing stored, so no radio is checked and Forest comes from the OS's dark scheme alone.
  await expect(page.locator('#theme-picker input:checked')).toHaveCount(0);

  await pick(page, 'dark-forest');
  expect(await page.evaluate(() => window.__viewTransitions)).toBe(0);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark-forest');

  await pick(page, 'arctic');
  expect(await page.evaluate(() => window.__viewTransitions)).toBe(1);
});

// The picker is fixed in the top right corner, over the band Name.astro leaves above the
// title block on a narrow window. A classic scrollbar moves both the same way, so overlay
// scrollbars catch it too.
test('the picker stays off the title block on a narrow window', async ({ page }) => {
  for (const width of [832, 390, 360, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    const picker = (await page.locator('#theme-picker').boundingBox())!;
    const block = (await page.locator('#profile .title-block').boundingBox())!;
    const across = Math.min(picker.x + picker.width, block.x + block.width) - Math.max(picker.x, block.x);
    const down = Math.min(picker.y + picker.height, block.y + block.height) - Math.max(picker.y, block.y);
    expect(across > 0 && down > 0, `picker over the title block at ${width}px`).toBe(false);
  }
});
