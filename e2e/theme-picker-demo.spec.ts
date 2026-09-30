import { expect, test, type Locator, type Page } from '@playwright/test';

import { demoStack, frontPage, frontPageIndex, frontPageName, settledAfter, swipeStack, turnToPage } from './support/paperStack';

const PAGES = ['Theme Picker', 'The Wipe', 'The Wipe in Code', 'Token Layers', 'Default and Override'];

function pickerStack(page: Page) {
  return demoStack(page, 'Theme Picker');
}

/** The live sheet, mounted, so the stage has its script. */
async function mountedSheet(page: Page): Promise<Locator> {
  const stack = pickerStack(page);
  await stack.scrollIntoViewIfNeeded();
  const sheet = frontPage(stack, await frontPageIndex(stack)).locator('.theme-picker-demo');
  await expect(sheet).toHaveAttribute('data-mounted', 'true', { timeout: 15_000 });
  return sheet;
}

/* Playwright's CSS locators pierce the shadow root, so the stage's screen and keys are
   reached like any other element. */
const screen = (sheet: Locator) => sheet.locator('[data-stage] [data-screen]');
const stageKey = (sheet: Locator, id: string) => sheet.locator('[data-stage] button[data-pick="' + id + '"]');
const stored = (page: Page) => page.evaluate(() => localStorage.getItem('cv-theme'));

/** What the page keeps of a pick: the stamp, the stored key, the checked radio. */
async function pageUntouched(page: Page) {
  await expect(page.locator('html')).not.toHaveAttribute('data-theme');
  expect(await stored(page)).toBeNull();
  await expect(page.locator('#theme-picker input:checked')).toHaveCount(0);
}

test.describe('with motion', () => {
  test('forward swipes visit every page in order, then wrap', async ({ page }) => {
    await page.goto('/');
    const stack = pickerStack(page);
    await stack.scrollIntoViewIfNeeded();
    await expect(stack).toHaveAttribute('aria-roledescription', 'paper stack');
    await expect.poll(async () => {
      const before = await stack.evaluate((el) => el.getBoundingClientRect().top);
      await page.evaluate(() => new Promise(requestAnimationFrame));
      return before === (await stack.evaluate((el) => el.getBoundingClientRect().top));
    }).toBe(true);
    await settledAfter(stack, async () => {}, false);

    expect(await stack.locator(':scope > div').count()).toBe(PAGES.length);
    expect(await frontPageName(stack)).toBe(PAGES[0]);
    for (let i = 1; i < PAGES.length; i += 1) {
      await swipeStack(page, stack, true);
      expect(await frontPageName(stack), `page ${i} after ${i} forward swipe(s)`).toBe(PAGES[i]);
    }
    await swipeStack(page, stack, true);
    expect(await frontPageName(stack)).toBe(PAGES[0]);
  });

  test('main page: the walkthrough wipes the stage through the themes and leaves the page alone', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');
    const sheet = await mountedSheet(page);
    await expect(sheet).toHaveAttribute('data-autoplay-state', 'playing');

    const stamps: string[] = [];
    for (let i = 0; i < 2; i += 1) {
      await expect.poll(() => screen(sheet).getAttribute('data-demo-theme'), { timeout: 15_000 })
        .not.toBe(stamps.at(-1) ?? null);
      stamps.push((await screen(sheet).getAttribute('data-demo-theme')) ?? '');
      await pageUntouched(page);
    }
    // The OS scheme is light, so the walkthrough's first pick changes nothing and the
    // stamps seen are the next two in the table.
    expect(stamps).toEqual(['dark', 'arctic']);

    // The stage paints from its own copy of the tokens: its canvas is arctic's paper,
    // while the page's canvas is still light's.
    await expect.poll(() => screen(sheet).evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('oklch(0.955 0.015 235)');
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('oklch(1 0 90)');
  });
});

test.describe('reduced motion', () => {
  // The stage's keys still work here, with no wipe, and the walkthrough waits paused.
  test.use({ reducedMotion: 'reduce' });

  test('main page: a key on the stage stamps the stage, not the page', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');
    const sheet = await mountedSheet(page);
    await expect(sheet).toHaveAttribute('data-autoplay-state', 'paused');
    await expect(screen(sheet)).not.toHaveAttribute('data-demo-theme');

    // The page on the stage paints from the stage's tokens, down to its title card.
    const card = sheet.locator('[data-stage] [data-paper="under"] .card');
    const cardBefore = await card.evaluate((el) => getComputedStyle(el).backgroundColor);

    await stageKey(sheet, 'dark-forest').click();
    await expect(screen(sheet)).toHaveAttribute('data-demo-theme', 'dark-forest');
    await expect(stageKey(sheet, 'dark-forest')).toHaveAttribute('aria-pressed', 'true');
    await pageUntouched(page);
    expect(await card.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(cardBefore);
    await expect(sheet.locator('[data-stage] [data-stage-shown]').filter({ visible: true })).toHaveText('"dark-forest"');

    // A pick in the corner moves the page, and not the stage.
    await page.locator('#theme-picker label:has(input[value="arctic"])').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'arctic');
    await expect(screen(sheet)).toHaveAttribute('data-demo-theme', 'dark-forest');
  });

  test('main page: the stage keys work from the keyboard', async ({ page }) => {
    await page.goto('/');
    const sheet = await mountedSheet(page);

    await stageKey(sheet, 'arctic').focus();
    await page.keyboard.press('Enter');
    await expect(screen(sheet)).toHaveAttribute('data-demo-theme', 'arctic');
    await pageUntouched(page);
  });

  test('tokens page: the neutral ramp runs from the canvas to the ink in twelve distinct steps, and follows a switch', async ({ page }) => {
    await page.goto('/');
    const stack = pickerStack(page);
    await stack.scrollIntoViewIfNeeded();
    await turnToPage(stack, 'Token Layers');
    const sheet = frontPage(stack, await frontPageIndex(stack)).locator('.tokens-sheet');

    const ramp = () => sheet.locator('.ramp').first().locator('.swatch').evaluateAll((swatches) =>
      swatches.map((swatch) => getComputedStyle(swatch).backgroundColor),
    );
    const seeds = () => sheet.locator('.seeds .swatch').evaluateAll((swatches) =>
      swatches.map((swatch) => getComputedStyle(swatch).backgroundColor),
    );

    const light = await ramp();
    expect(light).toHaveLength(12);
    expect(new Set(light).size).toBe(12);
    const [canvas, ink] = await seeds();
    expect(light[0]).toBe(canvas);
    expect(light[11]).toBe(ink);

    await page.locator('#theme-picker label:has(input[value="dark"])').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    const dark = await ramp();
    expect(dark).not.toEqual(light);
    expect(dark[0]).toBe((await seeds())[0]);
  });

  test('default page: the OS rule is lit until a pick, then the stamp and the radio are', async ({ page }) => {
    await page.goto('/');
    const stack = pickerStack(page);
    await stack.scrollIntoViewIfNeeded();
    await turnToPage(stack, 'Default and Override');
    const sheet = frontPage(stack, await frontPageIndex(stack)).locator('.default-sheet');

    const lit = () => sheet.locator('.cascade li').evaluateAll((rows) =>
      rows.filter((row) => getComputedStyle(row).getPropertyValue('--shown').trim() === '1').map((row) => row.getAttribute('data-chosen')),
    );
    expect(await lit()).toEqual(['os']);

    await page.locator('#theme-picker label:has(input[value="arctic"])').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'arctic');
    expect(await lit()).toEqual(['stamp', 'radio']);
  });
  test('code page: five steps coloured at build, transformPath opened, and the end frame drawn for the theme on screen', async ({ page }) => {
    await page.goto('/');
    const stack = pickerStack(page);
    await stack.scrollIntoViewIfNeeded();
    await turnToPage(stack, 'The Wipe in Code');
    const sheet = frontPage(stack, await frontPageIndex(stack)).locator('.code-sheet');

    await expect(sheet.locator('.steps > li')).toHaveCount(5);
    await expect(sheet.locator('.steps > li').first().locator('pre')).toHaveText('const viewTransition = document.startViewTransition(() => { /**/ });');
    await expect(sheet.locator('.inside .row')).toHaveCount(3);

    // src/highlight.ts ran at build: keywords and functions carry their kind's class, and no
    // highlighter script is on the page.
    await expect(sheet.locator('.steps pre.hl').first()).toBeVisible();
    expect(await sheet.locator('.steps pre.hl .tok-keyword').count()).toBeGreaterThan(0);
    expect(await sheet.locator('.steps pre.hl .tok-function').count()).toBeGreaterThan(0);

    // Code words in the prose are set as inline code, on a ground of their own.
    const inline = sheet.locator('.step-name code', { hasText: 'startViewTransition' });
    await expect(inline).toBeVisible();
    expect(await inline.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
    expect(await page.locator('script[src*="shiki"], script[src*="prism"]').count()).toBe(0);

    // One end frame per theme is drawn; the selectors show the one on screen, and the tones
    // are set per theme, so the fill differs between two themes.
    const shown = () => sheet.locator('.end-icon').evaluateAll((frames) =>
      frames.filter((frame) => getComputedStyle(frame).display !== 'none').map((frame) => frame.getAttribute('data-shown')),
    );
    const fill = () => sheet.evaluate((el) => getComputedStyle(el).getPropertyValue('--tone-fill').trim());
    await page.locator('#theme-picker label:has(input[value="dark"])').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    expect(await shown()).toEqual(['dark']);
    const darkFill = await fill();
    expect(darkFill).toMatch(/^oklch\(/);
    await page.locator('#theme-picker label:has(input[value="arctic"])').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'arctic');
    expect(await shown()).toEqual(['arctic']);
    expect(await fill()).not.toBe(darkFill);
  });

});

test.describe('without script', () => {
  test.use({ javaScriptEnabled: false });

  test('main page: the stage renders from its declarative shadow root, on the OS scheme', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');
    const stack = pickerStack(page);
    await stack.scrollIntoViewIfNeeded();
    const sheet = stack.locator('.theme-picker-demo').first();

    expect(await sheet.locator('[data-stage]').evaluate((el) => !!el.shadowRoot && !el.querySelector('template'))).toBe(true);
    await expect(screen(sheet)).not.toHaveAttribute('data-demo-theme');
    await expect.poll(() => screen(sheet).evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('oklch(0.2 0.035 265)');
  });
});
