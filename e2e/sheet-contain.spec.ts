import { expect, test } from '@playwright/test';

import { demoStack } from './support/paperStack';

/**
 * Each sheet has layout containment, so a change inside it lays out the sheet alone
 * (Page.astro). It must paint exactly as it did without it. Adding style containment next to
 * layout makes Blink paint the sheet from its offset rounded to a whole pixel, and at 390 the
 * sheets sit at x 13.64, so the frame line and the logo moved by a pixel. A sheet is shot with
 * its rule and again with layout containment taken off, and the two shots must match. With
 * script on, the logo sheet animates, so only the Marker Editor's sheet is shot there.
 */
const ADD_TOOL = 'Space Builder · Add Tool';
const MARKER_EDITOR = 'Interactive Map Marker Editor';
const SHEET = 'article.technical-drawing-stack > * > section';

for (const [javaScriptEnabled, stacks] of [[false, [ADD_TOOL, MARKER_EDITOR]], [true, [MARKER_EDITOR]]] as const) {
  test.describe(`script ${javaScriptEnabled ? 'on' : 'off'}`, () => {
    test.use({ javaScriptEnabled, reducedMotion: 'reduce', viewport: { width: 390, height: 844 } });

    test('sheets paint the same with and without layout containment at 390px', async ({ page }) => {
      if (javaScriptEnabled) await page.clock.install();
      await page.goto('/');
      await page.waitForLoadState('load');

      expect(await page.locator(SHEET).first().evaluate((el) => getComputedStyle(el).contain)).toBe('size layout');

      // addStyleTag waits on the tag's load event, which never fires with script off.
      const setRule = (css: string) => page.evaluate((text) => {
        const tag = document.getElementById('sheet-contain-probe')
          ?? document.head.appendChild(Object.assign(document.createElement('style'), { id: 'sheet-contain-probe' }));
        tag.textContent = text;
      }, css);

      for (const title of stacks) {
        const sheet = demoStack(page, title).locator(':scope > * > section').first();
        await sheet.scrollIntoViewIfNeeded();
        await page.waitForTimeout(1000);
        if (javaScriptEnabled) await page.clock.pauseAt(Date.now() + 1000);

        const shot = () => sheet.screenshot({ animations: 'disabled', caret: 'hide' });
        const contained = await shot();
        await setRule(`${SHEET} { contain: size !important; }`);
        const plain = await shot();
        await setRule('');

        expect(contained.equals(plain), `${title} moved when layout containment came off`).toBe(true);
        if (javaScriptEnabled) await page.clock.resume();
      }
    });
  });
}
