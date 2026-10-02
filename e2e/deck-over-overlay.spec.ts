import type { Locator } from '@playwright/test';

import { demoStack, frontDeck, frontPage, frontPageIndex, waitForIslandMounted } from './support/paperStack';
import { expect, test } from './support/timeScale';

/**
 * S23: a demo that draws over its own sheet (the marker editor's dialog and backdrop, the font
 * picker's toasts) leaves the deck on top, so pause stays in sight and in reach. In the band the
 * deck outranks those layers on the sheet; in the slip it is off the sheet they are drawn on.
 */
const OVERLAYS = [
  { demo: 'Interactive Map Marker Editor', overlay: '#marker-editor' },
  { demo: 'Interactive Map Font Picker', overlay: '.font-picker-toast' },
];

/** Whether the deck paints over the overlay wherever the two meet. Both let the pointer
 *  through in places, so the hit test makes them catch it for the measurement. */
async function deckOnTop(deck: Locator, overlay: Locator) {
  return overlay.evaluate((layer, el) => {
    const d = el.getBoundingClientRect();
    const o = layer.getBoundingClientRect();
    const left = Math.max(d.left, o.left), right = Math.min(d.right, o.right);
    const top = Math.max(d.top, o.top), bottom = Math.min(d.bottom, o.bottom);
    if (right - left < 1 || bottom - top < 1) return 'apart';
    const style = document.createElement('style');
    style.textContent = '.deck-over-overlay-probe, .deck-over-overlay-probe * { pointer-events: auto !important; }';
    document.head.append(style);
    for (const box of [layer, el]) box.classList.add('deck-over-overlay-probe');
    let covered = false;
    for (let i = 1; i < 6; i++) {
      for (let j = 1; j < 4; j++) {
        const hit = document.elementFromPoint(left + ((right - left) * i) / 6, top + ((bottom - top) * j) / 4);
        if (!hit || !el.contains(hit)) covered = true;
      }
    }
    for (const box of [layer, el]) box.classList.remove('deck-over-overlay-probe');
    style.remove();
    return covered ? 'overlay' : 'deck';
  }, await deck.elementHandle());
}

for (const width of [1440, 1024, 554, 390]) {
  const home = width > 680 ? 'band' : 'slip';
  test.describe(`${width}px, deck in the ${home}`, () => {
    test.use({ viewport: { width, height: 900 } });

    for (const { demo, overlay } of OVERLAYS) {
      test(`pause works while ${demo} shows ${overlay}`, async ({ page }) => {
        await page.goto('/');
        const stack = demoStack(page, demo);
        await stack.evaluate((el) => el.scrollIntoView({ block: 'center' }));
        const front = frontPage(stack, await frontPageIndex(stack));
        await waitForIslandMounted(front);
        const deck = frontDeck(stack, front);
        await expect(deck).toHaveAttribute('data-state', 'playing', { timeout: 30_000 });

        const layer = stack.locator(overlay).first();
        await expect(layer).toBeVisible({ timeout: 60_000 });
        await expect(deck).toHaveAttribute('data-state', 'playing');
        expect(await deck.evaluate((el) => el.parentElement!.matches('.callout-card'))).toBe(home === 'slip');
        expect(['deck', 'apart']).toContain(await deckOnTop(deck, layer));
        if (home === 'band') expect(await deckOnTop(deck, layer)).toBe('deck');

        await deck.locator('[data-demo-key="pause"]').click();
        await expect(deck).toHaveAttribute('data-state', 'user');
        await expect(deck.locator('[data-demo-key="pause"]')).toHaveAttribute('aria-pressed', 'true');
      });
    }
  });
}
