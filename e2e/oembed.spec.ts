import { expect, test } from '@playwright/test';

import { AUTHOR_NAME, CONTACT, SITE_TITLE, SITE_URL } from '../src/site';

// Both endpoints are static files written by astro build, so they answer the same for any
// query string; the discovery links name hsal.es, never the localhost origin the suite uses.
const SITE_ROOT = `${SITE_URL}/`;
const QUERY = `?url=${encodeURIComponent(SITE_ROOT)}&maxwidth=100`;

test('homepage carries a JSON and an XML oEmbed discovery link pointing at itself', async ({ page }) => {
  await page.goto('/');
  for (const [type, path] of [
    ['application/json+oembed', '/oembed.json'],
    ['text/xml+oembed', '/oembed.xml'],
  ]) {
    const href = await page.locator(`link[rel="alternate"][type="${type}"]`).getAttribute('href');
    const discovered = new URL(href!);
    expect(discovered.origin + discovered.pathname, type).toBe(SITE_URL + path);
    expect(discovered.searchParams.get('url'), type).toBe(SITE_ROOT);
  }
});

test('oembed.json answers with a rich embed whatever the query string', async ({ request }) => {
  const response = await request.get(`/oembed.json${QUERY}`);
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toMatch(/^application\/json/);
  expect(response.headers()['access-control-allow-origin']).toBe('*');

  const body = await response.json();
  expect(body).toMatchObject({
    version: '1.0',
    type: 'rich',
    title: SITE_TITLE,
    author_name: AUTHOR_NAME,
    provider_name: AUTHOR_NAME,
    provider_url: SITE_URL,
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

test('oembed.xml carries the same fields as oembed.json', async ({ page, request }) => {
  const json = await (await request.get('/oembed.json')).json();
  const response = await request.get(`/oembed.xml${QUERY}`);
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toMatch(/^text\/xml/);

  const xml = await response.text();
  const fields = await page.evaluate((source) => {
    const doc = new DOMParser().parseFromString(source, 'text/xml');
    if (doc.querySelector('parsererror')) return null;
    const root = doc.documentElement;
    return { root: root.nodeName, values: Object.fromEntries([...root.children].map((el) => [el.nodeName, el.textContent])) };
  }, xml);

  expect(fields?.root).toBe('oembed');
  expect(fields?.values).toEqual(Object.fromEntries(Object.entries(json).map(([key, value]) => [key, String(value)])));
});

test('the card has no page of its own', async ({ request }) => {
  for (const path of ['/oembed-card.html/', '/oembed-card.html', '/oembed-card-fragment/']) {
    expect((await request.get(path)).status(), path).toBe(404);
  }
});
