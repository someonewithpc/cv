import { expect, test } from '@playwright/test';

const ROOMS = ['foyer', 'vitrine', 'logo', 'markers', 'spaces', 'archive'];

test('the floor plan links every room and marks the one on screen', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');

  const plan = page.locator('.floor-plan');
  await expect(plan).toHaveAttribute('open', '');

  const links = plan.locator('nav a[data-plan-room]');
  await expect(links).toHaveCount(ROOMS.length);
  for (const id of ROOMS) {
    await expect(plan.locator(`nav a[data-plan-room="${id}"]`)).toHaveAttribute('href', `#${id}`);
    await expect(page.locator(`section#${id}.room`)).toHaveCount(1);
  }

  await expect(plan.locator('nav a[data-plan-room="foyer"]')).toHaveAttribute('aria-current', 'true');

  await page.locator('#spaces').scrollIntoViewIfNeeded();
  await page.evaluate(() => {
    const room = document.getElementById('spaces')!;
    window.scrollTo(0, room.offsetTop + room.offsetHeight / 2 - window.innerHeight / 2);
  });
  await expect(plan.locator('nav a[data-plan-room="spaces"]')).toHaveAttribute('aria-current', 'true');
  await expect(plan.locator('nav a[data-plan-room="foyer"]')).not.toHaveAttribute('aria-current', 'true');
  await expect(plan.locator('.floor-plan-key li[data-plan-room="spaces"]')).toHaveAttribute('aria-current', 'true');
});

test('a plan link scrolls to its room', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');

  await page.locator('.floor-plan nav a[data-plan-room="archive"]').click();
  await expect(page).toHaveURL(/#archive$/);
  const top = await page.locator('#archive').evaluate((el) => el.getBoundingClientRect().top);
  expect(Math.abs(top)).toBeLessThan(2);
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('the URL fragment fills the room on the plan', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/#markers');

    const plan = page.locator('.floor-plan');
    await expect(plan).not.toHaveAttribute('data-live', '');

    const fill = (id: string) =>
      plan.locator(`nav a[data-plan-room="${id}"] rect`).evaluate((el) => getComputedStyle(el).fill);
    const here = await fill('markers');
    expect(here).not.toBe('rgba(0, 0, 0, 0)');
    expect(await fill('foyer')).toBe('rgba(0, 0, 0, 0)');
    await expect(plan.locator('.floor-plan-key li[data-plan-room="markers"]')).toHaveCSS('font-weight', '700');
  });
});

test('a phone fits the rooms without sideways scroll and folds the plan into a tile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.waitForTimeout(1000);

  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);

  const plan = page.locator('.floor-plan');
  await expect(plan).not.toHaveAttribute('open', '');
  await plan.locator('summary').click();
  await expect(plan).toHaveAttribute('open', '');
  await plan.locator('nav a[data-plan-room="vitrine"]').click();
  await expect(plan).not.toHaveAttribute('open', '');
  await expect(page).toHaveURL(/#vitrine$/);
});
