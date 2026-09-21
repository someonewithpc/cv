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

/** One lettered detail per demo, in order. */
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

test('the cutting mat lies under every detail and leaves the desk showing at 1440px', async ({ page }) => {
  await withTheme(page, 'light');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');

  const mat = page.locator('#demos .cutting-mat');
  await expect(mat).toHaveCount(1);

  const box = await mat.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    const stacks = [...document.querySelectorAll('article.technical-drawing-stack')]
      .map((stack) => stack.getBoundingClientRect())
      .map(({ left, right, top, bottom }) => ({ left, right, top, bottom }));
    return {
      left: rect.left,
      right: rect.right,
      top: rect.top + scrollY,
      bottom: rect.bottom + scrollY,
      viewport: document.documentElement.clientWidth,
      padding: parseFloat(style.paddingLeft),
      border: parseFloat(style.borderTopWidth),
      clip: style.backgroundClip,
      layers: style.backgroundImage.split('linear-gradient(').length - 1,
      stacks: stacks.map(({ left, right, top, bottom }) => ({ left, right, top: top + scrollY, bottom: bottom + scrollY })),
    };
  });

  // Narrower than the viewport, with desk left and right of it.
  expect(box.left).toBeGreaterThan(0);
  expect(box.right).toBeLessThan(box.viewport);
  expect(box.right - box.left).toBeLessThan(box.viewport);

  // Every stack lies on it.
  expect(box.stacks).toHaveLength(LETTERS.length);
  for (const stack of box.stacks) {
    expect(stack.left).toBeGreaterThanOrEqual(box.left);
    expect(stack.right).toBeLessThanOrEqual(box.right);
    expect(stack.top).toBeGreaterThanOrEqual(box.top);
    expect(stack.bottom).toBeLessThanOrEqual(box.bottom);
  }

  // The rim is a plain margin closed by one line: the two rulings are clipped to the content
  // box, and only the mat's own colour reaches the border box.
  expect(box.padding).toBeGreaterThanOrEqual(16);
  expect(box.border).toBe(1);
  expect(box.layers).toBe(3);
  expect(box.clip).toBe('content-box, content-box, border-box');
});

test('each demo is a lettered detail and nothing else is called out', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');

  const bubbles = page.locator('#demos .cutting-mat .callout .callout-bubble');
  await expect(bubbles).toHaveText(LETTERS);

  const callouts = page.locator('#demos .callout');
  await expect(callouts).toHaveCount(LETTERS.length);
  // Each detail encloses exactly one stack.
  for (let index = 0; index < LETTERS.length; index++) {
    await expect(callouts.nth(index).locator('article.technical-drawing-stack')).toHaveCount(1);
  }

  await expect(page.locator('#open-source .callout')).toHaveCount(0);
  await expect(page.locator('main > .callout')).toHaveCount(0);
});

test('the mat runs the full width of a phone and nothing scrolls sideways', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.waitForTimeout(1000);

  const fit = await page.locator('#demos .cutting-mat').evaluate((el) => ({
    width: el.getBoundingClientRect().width,
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    padding: parseFloat(getComputedStyle(el).paddingLeft),
  }));
  expect(fit.width).toBe(fit.clientWidth);
  expect(fit.scrollWidth).toBe(fit.clientWidth);
  // The rim shrinks to the page gutter but never away.
  expect(fit.padding).toBeGreaterThan(0);
});

test('every band on the desk is a sheet of the same width, edged and lifted', async ({ page }) => {
  await withTheme(page, 'light');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');

  const sheets = await page.evaluate(() => {
    const main = document.querySelector('main')!;
    const bands = [
      ...[...main.children].filter((el) => !el.classList.contains('full-width')),
      ...main.querySelectorAll(':scope > .full-width > *:not(.cutting-mat)'),
    ];
    return bands.map((band) => {
      const rect = band.getBoundingClientRect();
      const style = getComputedStyle(band);
      const headings = [...band.querySelectorAll('h1, h2')].map((heading) => {
        const box = heading.getBoundingClientRect();
        return { left: box.left, right: box.right, text: heading.textContent?.trim().slice(0, 24) };
      });
      return {
        name: band.id || band.tagName,
        width: rect.width,
        left: rect.left,
        right: rect.right,
        shadow: style.boxShadow,
        border: parseFloat(style.borderTopWidth),
        headings,
      };
    });
  });

  expect(sheets.length).toBeGreaterThanOrEqual(4);
  const widest = Math.max(...sheets.map((sheet) => sheet.width));
  for (const sheet of sheets) {
    expect(Math.abs(sheet.width - widest), `${sheet.name} width`).toBeLessThanOrEqual(1);
    expect(sheet.shadow, `${sheet.name} shadow`).not.toBe('none');
    expect(sheet.border, `${sheet.name} edge`).toBe(1);
    for (const heading of sheet.headings) {
      expect(heading.left, `${sheet.name} / ${heading.text} left`).toBeGreaterThanOrEqual(sheet.left);
      expect(heading.right, `${sheet.name} / ${heading.text} right`).toBeLessThanOrEqual(sheet.right);
    }
  }
});
