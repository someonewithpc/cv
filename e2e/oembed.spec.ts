import { expect, test } from '@playwright/test';

import { AUTHOR_NAME, CONTACT, SITE_TITLE, SITE_URL } from '../src/site';

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

  // The name must actually be in the rendered card, not just the JSON metadata field,
  // and it is the link back to the site.
  expect(body.html).toMatch(new RegExp(`class="name"><a href="${SITE_URL}">${AUTHOR_NAME}</a>`));

  // The contact row carries the same links as the title block. The mail link is written
  // as character references, so decode before looking for it.
  const decoded = body.html.replace(/&#(\d+);/g, (_: string, n: string) => String.fromCodePoint(Number(n)));
  expect(decoded).toContain(`href="mailto:${CONTACT.email}"`);
  for (const { href } of CONTACT.profiles) {
    expect(body.html).toContain(`href="${href}"`);
  }

  // The whole point of type: rich is that consumers render this snippet instead of
  // iframing the live page, so it must not drag in the actual page's content.
  expect(body.html).not.toContain('Full stack developer');
  expect(body.html).not.toContain('Demos');
});

test('the rendered oEmbed card fragment is not served on its own', async ({ request }) => {
  // OEMBED_CARD_HTML is baked into oembed.json.ts at build time (see
  // scripts/render-oembed-card.mjs); the page that produces it shouldn't be a live route.
  expect((await request.get('/oembed-card.html/')).status()).toBe(404);
  expect((await request.get('/oembed-card.html')).status()).toBe(404);
});

test('oembed.json 404s for a url outside this site', async ({ request }) => {
  const response = await request.get('/oembed.json?url=https%3A%2F%2Fexample.com%2F&format=json');
  expect(response.status()).toBe(404);
});

test('oembed.json only supports the json format', async ({ request }) => {
  const response = await request.get('/oembed.json?format=xml');
  expect(response.status()).toBe(501);
});

test('oembed.json names its provider and can be read cross-origin', async ({ request }) => {
  const response = await request.get(`/oembed.json?url=${encodeURIComponent(SITE_ROOT)}&format=json`);
  expect(response.headers()['access-control-allow-origin']).toBe('*');
  expect(response.headers()['cache-control']).toBe('public, max-age=86400');
  expect(await response.json()).toMatchObject({ provider_name: AUTHOR_NAME, provider_url: SITE_URL, cache_age: 86400 });
});
