import { expect, test, type Locator } from '@playwright/test';

test.use({ viewport: { width: 1440, height: 1000 } });

const printed = (link: Locator) => link.evaluate((a) => getComputedStyle(a, '::after').content);

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.emulateMedia({ media: 'print' });
});

test('the contact row prints each profile address without scheme, www. or trailing slash', async ({ page }) => {
  const contact = page.locator('.title-block .contact');

  expect(await printed(contact.locator('[data-contact="github"] a'))).toBe('"github.com/someonewithpc"');
  expect(await printed(contact.locator('[data-contact="codeberg"] a'))).toBe('"codeberg.org/someonewithpc"');
  expect(await printed(contact.locator('[data-contact="linkedin"] a'))).toBe('"linkedin.com/in/someonewithpc"');
  expect(await printed(contact.locator('[data-contact="email"] a'))).toBe('none');
});

test('highlight and contribution links print their short address', async ({ page }) => {
  const nixpkgs = page.locator('#open-source article nav a[href="https://github.com/NixOS/nixpkgs/pull/574647"]');
  expect(await printed(nixpkgs)).toBe('"github.com/NixOS/nixpkgs/pull/574647"');

  const row = page.locator('#open-source .row a.title[href^="https://github.com/"]').first();
  const href = await row.getAttribute('href');
  expect(await printed(row)).toBe(`"${href!.replace('https://', '')}"`);
});

test('a card link whose words are its address prints it once', async ({ page }) => {
  const site = page.locator('#open-source article nav a[href="https://www.gnusocial.rocks/"]');
  await expect(site).toHaveText('gnusocial.rocks');
  expect(await printed(site)).toBe('none');
});

test('in-page anchors and running text print no address', async ({ page }) => {
  for (const link of await page.locator('a[href^="#"]').all()) {
    expect(await link.getAttribute('data-print')).toBeNull();
  }
  await expect(page.locator('a[data-print]')).toHaveCount(
    await page.locator('.title-block .contact a[rel~="me"], #open-source article nav a, #open-source .row a.title').count() - 1,
  );
});
