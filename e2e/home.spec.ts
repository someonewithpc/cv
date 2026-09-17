import { expect, test } from '@playwright/test';

test('loads the homepage with no console errors and all four demos present', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Demos' })).toBeVisible();

  const stacks = page.locator('article.technical-drawing-stack');
  await expect(stacks).toHaveCount(4);

  // Every page repeats the stack's subtitle as an <h3>, so scope to the front page's own
  // <h2> (title ?? subtitle) rather than matching all six pages' headings at once.
  await expect(stacks.nth(0).locator('h2.typewriter').first()).toHaveText('Visrez Animated Loading Logo');
  await expect(stacks.nth(1).locator('h2.typewriter').first()).toHaveText('Interactive Map Marker Editor');
  await expect(stacks.nth(2).locator('h2.typewriter').first()).toHaveText('Space Builder · Add Tool');
  await expect(stacks.nth(3).locator('h2.typewriter').first()).toHaveText('Interactive Map Font Picker');

  // Give every stack a chance to reach the viewport and boot its islands before checking
  // for errors — a mid-boot exception would otherwise land after this listener stopped
  // being interesting to the test, not before.
  for (const stack of await stacks.all()) {
    await stack.scrollIntoViewIfNeeded();
  }
  await page.waitForTimeout(2000);

  expect(errors, `console errors on load:\n${errors.join('\n')}`).toEqual([]);
});
