import { readFileSync } from 'node:fs';

import { expect, test } from '@playwright/test';

const ALIAS = 'contact@hsal.es';

test('the contact row links the alias, and the built HTML never spells an address out', async ({ page }) => {
  await page.goto('/');
  const link = page.locator('address.contact a[href^="mailto:"]');
  await expect(link).toHaveAttribute('href', `mailto:${ALIAS}`);
  await expect(link).toHaveText(ALIAS);

  const html = readFileSync('dist/client/index.html', 'utf8');
  // Lore URLs quote the personal address as part of a message id; those are links, not contact.
  const addresses = html.match(/[\w.+-]+@hsal\.es/g) ?? [];
  expect(addresses.filter((a) => !html.includes(`lore.kernel.org/git/${a.split('@')[0]}`))).toEqual([]);
  expect(html).not.toContain(ALIAS);
});

test('the oembed card links the alias too', async ({ page }) => {
  const card = await page.request.get('/oembed.json?url=' + encodeURIComponent('https://hsal.es/'));
  expect(card.ok()).toBeTruthy();
  const { html } = await card.json();
  expect(html).not.toContain(ALIAS);
  await page.setContent(html);
  await expect(page.locator('.oembed-card a[href^="mailto:"]')).toHaveAttribute('href', `mailto:${ALIAS}`);
});
