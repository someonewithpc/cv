import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('the kernel and GCC cards fold their patch lists under a count', async ({ page }) => {
  for (const id of ['highlight-linux-kernel', 'highlight-gcc']) {
    const fold = page.locator(`#${id} nav details`);
    const patches = fold.locator('li a');
    const count = await patches.count();
    expect(count).toBeGreaterThan(0);

    await expect(fold).not.toHaveAttribute('open');
    await expect(fold.locator('summary')).toHaveText(`${count} patches`);
    await expect(patches.first()).toBeHidden();

    await fold.locator('summary').click();
    await expect(patches.first()).toBeVisible();
  }
});

test("the GCC card's other links stay in view with its patches folded", async ({ page }) => {
  await expect(page.locator('#highlight-gcc nav > a', { hasText: 'Commit' })).toBeVisible();
});

test('the Blender GSoC card is gone', async ({ page }) => {
  await expect(page.locator('#highlight-blender-gsoc-2019')).toHaveCount(0);
});
