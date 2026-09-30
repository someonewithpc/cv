import { expect, type Page, test } from '@playwright/test';

// Runs in the firefox-noscript project only (playwright.config.ts): system Firefox with its
// javascript.enabled pref off. Firefox has no ::scroll-button() or ::scroll-marker and panel.ts
// cannot build the arrows and pips, so the Variants catalog's style strip is a bare scroll-snap
// row there, and card.scss shows the next finish's edge to say so. As in firefox-noscript-row,
// everything below reads the page through evaluate and drives it with the mouse.

type Strip = { left: number; right: number; middle: number; width: number; scrollLeft: number; snap: string; gap: number; slideWidth: number; nextShows: number; pipTrack: string };

const STRIP = '.variants-catalog .option-item ul.styles';

const readStrip = (page: Page) =>
  page.evaluate((selector) => {
    const strip = document.querySelector<HTMLElement>(selector)!;
    const box = strip.getBoundingClientRect();
    const slides = [...strip.children].map((slide) => slide.getBoundingClientRect());
    const track = strip.parentElement!.querySelector<HTMLElement>('.pip-track');
    return {
      left: box.left,
      right: box.right,
      middle: (box.top + box.bottom) / 2,
      width: box.width,
      scrollLeft: strip.scrollLeft,
      snap: getComputedStyle(strip.children[0]).scrollSnapAlign,
      gap: parseFloat(getComputedStyle(strip).columnGap) || 0,
      slideWidth: slides[0].width,
      nextShows: box.right - slides[1].left,
      pipTrack: track ? getComputedStyle(track).display : 'missing',
    } satisfies Strip;
  }, STRIP);

const settled = async (page: Page) => {
  let last = Number.NaN;
  await expect
    .poll(async () => {
      const now = (await readStrip(page)).scrollLeft;
      const still = now === last;
      last = now;
      return still;
    }, { intervals: [250] })
    .toBe(true);
  return readStrip(page);
};

for (const width of [1440, 390]) {
  test.describe(`at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });

    test('the style strip shows the next finish at its edge and snaps one finish at a time', async ({ page }) => {
      await page.goto('/');
      expect(await page.evaluate(() => matchMedia('(scripting: none)').matches), 'the pref gives a page without script').toBe(true);
      await page.evaluate((selector) => document.querySelector(selector)!.scrollIntoView({ block: 'center' }), STRIP);

      const start = await readStrip(page);
      expect(start.scrollLeft).toBe(0);
      expect(start.snap).toBe('start');
      // More than a hairline of the second finish inside the strip: its edge is on show.
      expect(start.nextShows).toBeGreaterThan(4);
      // The lone dot of the pip track has no pip row here.
      expect(start.pipTrack).toBe('none');

      await page.mouse.move(Math.round((start.left + start.right) / 2), Math.round(start.middle));
      // A third of a finish: short of the next one, so only the snap can carry the strip there.
      await page.mouse.wheel(Math.round(start.width / 3), 0);
      const next = await settled(page);
      expect(next.scrollLeft).toBeCloseTo(start.slideWidth + start.gap, 0);
    });
  });
}
