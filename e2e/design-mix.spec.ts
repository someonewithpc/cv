import { expect, test } from '@playwright/test';

/** The width past which Layout.astro lays the page on a desk. */
const DESK_FROM = 1024;

/** --theme-desk per theme, as ThemePicker.astro writes it. */
const DESKS = {
  light: 'oklch(0.87 0.022 76)',
  dark: 'oklch(0.175 0.018 48)',
  arctic: 'oklch(0.875 0.009 85)',
  'dark-forest': 'oklch(0.225 0.045 58)',
} as const;

const withTheme = async (page: import('@playwright/test').Page, theme: string) => {
  await page.addInitScript((id) => {
    try {
      localStorage.setItem('cv-theme', id);
    } catch {
      /* ignore */
    }
  }, theme);
};

/** Serialised the way the browser serialises it, so the two sides compare like with like. */
const asComputedColor = (page: import('@playwright/test').Page, color: string) =>
  page.evaluate((value) => {
    const probe = document.createElement('div');
    probe.style.backgroundColor = value;
    document.body.append(probe);
    const computed = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return computed;
  }, color);

for (const [theme, desk] of Object.entries(DESKS)) {
  test(`the ${theme} desk fills main past ${DESK_FROM}px`, async ({ page }) => {
    await withTheme(page, theme);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');

    const main = page.locator('main');
    await expect(main).toHaveCSS('--theme-desk', desk);

    const background = await main.evaluate((el) => {
      const style = getComputedStyle(el);
      return { image: style.backgroundImage, color: style.backgroundColor };
    });

    // The grain is one inline SVG tile: a fine noise stretched along the grain,
    // displaced by a coarse one so the lines wander rather than band.
    expect(background.image).toContain('feTurbulence');
    expect(background.image).toContain('feDisplacementMap');
    expect(background.color).toBe(await asComputedColor(page, desk));
  });
}

test(`no desk at ${DESK_FROM}px, where the page column still fills the viewport`, async ({ page }) => {
  await withTheme(page, 'light');
  await page.setViewportSize({ width: DESK_FROM, height: 768 });
  await page.goto('/');

  const background = await page.locator('main').evaluate((el) => {
    const style = getComputedStyle(el);
    return { image: style.backgroundImage, color: style.backgroundColor };
  });

  // What main has always had: the two drafting-grid gradients over a transparent box.
  expect(background.image).not.toContain('url(');
  expect(background.image.match(/linear-gradient/g)).toHaveLength(2);
  expect(background.color).toBe('rgba(0, 0, 0, 0)');
});

for (const width of [390, 1024, 1440]) {
  test(`the home page does not scroll sideways at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/');
    await page.waitForTimeout(1000);

    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
  });
}
