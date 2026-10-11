import { expect, test } from '@playwright/test';

// The route runs in the preview's worker; the beacon it answers leaves nothing in the browser.

test('POST /api/e answers 204 with no body and no cookie', async ({ request }) => {
  const response = await request.post('/api/e', {
    headers: { 'content-type': 'text/plain' },
    data: JSON.stringify({ s: '0123456789abcdef', e: [['visit', 'example.org', 'wide', 'light'], ['print']] }),
  });
  expect(response.status()).toBe(204);
  expect(response.headers()['set-cookie']).toBeUndefined();
  expect(await response.text()).toBe('');
});

test('GET /api/e answers 405', async ({ request }) => {
  const response = await request.get('/api/e');
  expect(response.status()).toBe(405);
});
