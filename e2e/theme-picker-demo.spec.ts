import { expect, test, type Locator, type Page } from '@playwright/test';

import { demoStack, frontPage, frontPageIndex, frontPageName, settledAfter, swipeStack, turnToPage } from './support/paperStack';

const PAGES = ['Theme Picker', 'Token Layers', 'Default and Override', 'The Wipe'];

// The picks here go through the picker's own code, wipe included; the wipe is
// theme-picker.spec.ts's business, so this suite skips it and reads the result.
test.use({ reducedMotion: 'reduce' });

function pickerStack(page: Page) {
  return demoStack(page, 'Theme Picker');
}

/** The live sheet, mounted, so its keys press the picker in the corner. */
async function mountedSheet(page: Page): Promise<Locator> {
  const stack = pickerStack(page);
  await stack.scrollIntoViewIfNeeded();
  const sheet = frontPage(stack, await frontPageIndex(stack)).locator('.theme-picker-demo');
  await expect(sheet).toHaveAttribute('data-mounted', 'true', { timeout: 15_000 });
  return sheet;
}

const visible = (readout: Locator) => readout.locator('span').filter({ visible: true });
const stored = (page: Page) => page.evaluate(() => localStorage.getItem('cv-theme'));

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

test('main page: with nothing picked the readout names the OS theme and says who chose it', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  const sheet = await mountedSheet(page);

  await expect(page.locator('#theme-picker input:checked')).toHaveCount(0);
  await expect(visible(sheet.locator('[data-readout="theme"]'))).toHaveText('Dark');
  await expect(visible(sheet.locator('[data-readout="chosen"]'))).toHaveText(/the OS colour scheme/);
  await expect(sheet.locator('[data-pick="dark"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(sheet.locator('[data-pick="light"]')).toHaveAttribute('aria-pressed', 'false');
});

test('main page: a key on the sheet presses the picker in the corner, and the forget key undoes it', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  const sheet = await mountedSheet(page);

  await sheet.locator('[data-pick="arctic"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'arctic');
  await expect(page.locator('#theme-picker input[value="arctic"]')).toBeChecked();
  expect(await stored(page)).toBe('arctic');
  await expect(visible(sheet.locator('[data-readout="theme"]'))).toHaveText('Arctic');
  await expect(visible(sheet.locator('[data-readout="chosen"]'))).toHaveText(/a pick, kept in this browser/);
  await expect(sheet.locator('[data-pick="arctic"]')).toHaveAttribute('aria-pressed', 'true');

  // The seeds are painted from the tokens, so the canvas swatch follows the pick.
  const canvas = sheet.locator('.seed').first().locator('.swatch');
  const arcticCanvas = await canvas.evaluate((el) => getComputedStyle(el).backgroundColor);

  await sheet.locator('[data-forget]').click();
  await expect(page.locator('html')).not.toHaveAttribute('data-theme');
  await expect(page.locator('#theme-picker input:checked')).toHaveCount(0);
  expect(await stored(page)).toBeNull();
  await expect(visible(sheet.locator('[data-readout="theme"]'))).toHaveText('Light');
  await expect(visible(sheet.locator('[data-readout="chosen"]'))).toHaveText(/the OS colour scheme/);
  expect(await canvas.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(arcticCanvas);
});

test('main page: the keys work from the keyboard', async ({ page }) => {
  await page.goto('/');
  const sheet = await mountedSheet(page);

  await sheet.locator('[data-pick="dark-forest"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark-forest');
  await expect(page.locator('#theme-picker input[value="dark-forest"]')).toBeChecked();
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

  const lit = () => sheet.locator('.rules li').evaluateAll((rows) =>
    rows.filter((row) => getComputedStyle(row).getPropertyValue('--shown').trim() === '1').map((row) => row.getAttribute('data-chosen')),
  );
  expect(await lit()).toEqual(['os']);

  await page.locator('#theme-picker label:has(input[value="arctic"])').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'arctic');
  expect(await lit()).toEqual(['stamp', 'radio']);
});
