import { expect, test } from '@playwright/test';

import { waitForEveryStackMounted } from './support/paperStack';

test('loads the homepage with no console errors and every demo titled', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Demos' })).toBeVisible();

  const stacks = page.locator('article.technical-drawing-stack');
  expect(await stacks.count(), 'the page shows no demo stack').toBeGreaterThan(0);

  // Every page repeats the stack's subtitle as an <h3>, so scope to the front page's own
  // <h2> (title ?? subtitle), which on a stack at rest is the demo's title.
  for (const stack of await stacks.all()) {
    const title = await stack.getAttribute('aria-label');
    expect(title, 'a stack with no title').toBeTruthy();
    await expect(stack.locator('h2.typewriter').first()).toHaveText(title!);
  }

  // Give every stack a chance to reach the viewport and boot its islands before checking
  // for errors — a mid-boot exception would otherwise land after this listener stopped
  // being interesting to the test, not before.
  await waitForEveryStackMounted(page);

  expect(errors, `console errors on load:\n${errors.join('\n')}`).toEqual([]);
});
