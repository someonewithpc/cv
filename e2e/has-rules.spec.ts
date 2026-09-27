import { expect, test } from '@playwright/test';

// The page's :root:has() theme rules and the callout's :has() rules were replaced (#171 NJ7,
// NJ8). With script off the theme still comes from the radios; with script on the slip reads
// the stack's page count from the view.

test.describe('with JavaScript off', () => {
  test.use({ javaScriptEnabled: false, colorScheme: 'dark' });

  test('a picked theme applies from the radio alone', async ({ page }) => {
    await page.goto('/');
    const root = page.locator(':root');
    const icon = page.locator('.tech-icon').first();
    await expect(root).toHaveCSS('--theme-kind', 'dark');
    await expect(icon).toHaveCSS('--icon-contrast-stroke-width', '9');

    // A light pick under a dark OS: the radio outranks the OS default, for the icons too.
    await page.locator('#theme-light').check({ force: true });
    await expect(root).toHaveCSS('--theme-kind', 'light');
    await expect(icon).toHaveCSS('--icon-contrast-stroke-width', '3');

    await page.locator('#theme-dark-forest').check({ force: true });
    await expect(root).toHaveCSS('--theme-kind', 'dark-forest');
    await expect(icon).toHaveCSS('--icon-contrast-stroke-width', '9');
  });
});

test('every slip carries its stack\'s page count', async ({ page }) => {
  await page.goto('/');
  const views = page.locator('.callout[data-card] .callout-view');
  expect(await views.count()).toBeGreaterThan(3);
  for (const view of await views.all()) {
    const count = await view.locator('[data-page-count]').first().getAttribute('data-page-count');
    await expect(view).toHaveCSS('--slip-pages', String(count));
  }
});
