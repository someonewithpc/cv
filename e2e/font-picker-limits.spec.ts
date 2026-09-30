import { expect, test } from '@playwright/test';

import { cssString, unquoteCssString } from '../src/components/FontPickerDemo/picker/cssString';
import { render } from '../src/components/FontPickerDemo/picker/fontOverride';
import { FetchCapError, LIMITS, cappedFetch, resetSpent } from '../src/components/FontPickerDemo/picker/proxiedFetch';

// The picker's own modules, run in the test process: the CSS they write is parsed by the
// browser, and fetch is replaced so nothing leaves the machine

const HOSTILE = [
  `Evil'; } body { display: none } .x { font-family: '`,
  `Evil"; } body { display: none } /*`,
  'Back\\slash {brace} ; semi',
  'Line\nbreak</style><style>body{display:none}',
];

test('a family name with quotes, braces and semicolons stays inside its font-family rule', async ({ page }) => {
  for (const family of HOSTILE) {
    expect(unquoteCssString(cssString(family))).toBe(family);

    const css = render({ family, style: 'normal', size: 1, weight: null }, {});
    const parsed = await page.evaluate((text) => {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(text);
      return [...sheet.cssRules].map((rule) => ({
        selector: (rule as CSSStyleRule).selectorText,
        fontFamily: (rule as CSSStyleRule).style.getPropertyValue('font-family'),
      }));
    }, css);

    expect(parsed).toHaveLength(1);
    expect(parsed[0].selector).toBe('[data-font-picker-island] .edit-style');
    expect(unquoteCssString(parsed[0].fontFamily.replace(/, sans-serif$/, ''))).toBe(family);
  }
});

function stubFetch(body: () => Response | Promise<Response>) {
  const calls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    calls.push(String(input));
    return body();
  }) as typeof fetch;
  return calls;
}

test('stylesheet fetches stop at the byte, count and time limits', async () => {
  const realFetch = globalThis.fetch;
  try {
    resetSpent();
    stubFetch(() => new Response('x'.repeat(LIMITS.responseBytes + 1), { headers: { 'content-type': 'text/css' } }));
    const big = await cappedFetch('https://example.test/big.css');
    await expect(big.text()).rejects.toBeInstanceOf(FetchCapError);

    resetSpent();
    const calls = stubFetch(() => new Response('a{}', { headers: { 'content-type': 'text/css' } }));
    for (let i = 0; i < LIMITS.requests; i++) await (await cappedFetch(`https://example.test/${i}.css`)).text();
    await expect(cappedFetch('https://example.test/one-more.css')).rejects.toBeInstanceOf(FetchCapError);
    expect(calls).toHaveLength(LIMITS.requests);
    expect(calls[0]).toBe('/api/font-proxy?url=https%3A%2F%2Fexample.test%2F0.css');

    resetSpent();
    const timeout = LIMITS.timeoutMs;
    LIMITS.timeoutMs = 50;
    globalThis.fetch = ((_: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal!.reason));
    })) as typeof fetch;
    await expect(cappedFetch('https://example.test/slow.css')).rejects.toBeInstanceOf(FetchCapError);
    LIMITS.timeoutMs = timeout;
  } finally {
    globalThis.fetch = realFetch;
  }
});
