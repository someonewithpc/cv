import { expect, test } from '@playwright/test';

import { AUTHOR_NAME, SITE_TITLE, SITE_URL } from '../src/site';

// oembed.json only answers for the real hsal.es origin (see src/site.ts), never the
// localhost address this suite serves the build from, so every request below targets
// that fixed origin rather than baseURL.
const SITE_ROOT = `${SITE_URL}/`;

test('homepage carries an oEmbed discovery link pointing at itself', async ({ page }) => {
  await page.goto('/');
  const link = page.locator('link[type="application/json+oembed"]');
  await expect(link).toHaveAttribute('href', /\/oembed\.json\?url=/);

  const href = await link.getAttribute('href');
  const discovered = new URL(href!);
  expect(discovered.searchParams.get('url')).toBe(SITE_ROOT);
});

test('oembed.json answers with a rich embed for the site url', async ({ request }) => {
  const response = await request.get(`/oembed.json?url=${encodeURIComponent(SITE_ROOT)}&format=json`);
  expect(response.status()).toBe(200);

  const body = await response.json();
  expect(body).toMatchObject({
    version: '1.0',
    type: 'rich',
    title: SITE_TITLE,
    author_name: AUTHOR_NAME,
  });
  expect(body.html).toContain(AUTHOR_NAME);

  // The whole point of type: rich is that consumers render this snippet instead of
  // iframing the live page, so it must not drag in the actual page's content.
  expect(body.html).not.toContain('Full stack developer');
  expect(body.html).not.toContain('Demos');
});

test('oembed.json 404s for a url outside this site', async ({ request }) => {
  const response = await request.get('/oembed.json?url=https%3A%2F%2Fexample.com%2F&format=json');
  expect(response.status()).toBe(404);
});

test('oembed.json only supports the json format', async ({ request }) => {
  const response = await request.get('/oembed.json?format=xml');
  expect(response.status()).toBe(501);
});
