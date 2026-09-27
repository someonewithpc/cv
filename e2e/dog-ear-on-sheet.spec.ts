import { expect, test } from '@playwright/test';
import sharp from 'sharp';

import { dogEarShown } from './support/paperStack';

/**
 * The resting dog-ear's flap paints only on the sheet. Its box stands 1px past the sheet's
 * right and bottom edges, and the clip that cuts the corner off along the crease left a sliver
 * of each tip out there, which the flap's reflection then laid 1px outside the other edge: a
 * stray dot at each crease tip, at rest and at every size the pulse breathes it to. Measured on
 * the corner crop with the flap shown and hidden: whatever changes between the two is the flap.
 */
test.use({ viewport: { width: 1440, height: 900 } });

const SHEET = ':scope > :not(.paper-fold, .paper-back-grab, .paper-clip, .paper-clip-under, .paper-flip-hint)';

test('the dog-ear paints nothing past the sheet\'s edges, at rest and breathing', async ({ page }) => {
  await page.goto('/');
  const stack = page.locator('article.technical-drawing-stack').last();
  await stack.evaluate((el) => {
    const bottom = el.getBoundingClientRect().bottom + window.scrollY;
    window.scrollTo({ top: bottom - window.innerHeight + 60, behavior: 'instant' });
  });
  await dogEarShown(stack);
  const front = stack.locator('.paper-front');
  const pulses = () => front.evaluate((el) => el.getAnimations({ subtree: true })
    .filter((animation) => (animation as CSSAnimation).animationName?.startsWith('fold-pulse-')).length);
  await expect.poll(pulses, { timeout: 5_000 }).toBe(3);

  const box = (await front.locator(SHEET).first().boundingBox())!;
  const right = box.x + box.width;
  const bottom = box.y + box.height;
  // The whole flap at its largest, plus 8px past the sheet's right and bottom edges.
  const clip = { x: Math.round(right) + 8 - 136, y: Math.round(bottom) + 8 - 96, width: 136, height: 96 };

  // At rest (the pulse's start), on its way out, and at its full breath.
  for (const at of [0, 6_750, 8_625]) {
    await front.evaluate((el, at) => {
      for (const animation of el.getAnimations({ subtree: true })) {
        if ((animation as CSSAnimation).animationName?.startsWith('fold-pulse-')) {
          animation.pause();
          animation.currentTime = at;
        }
      }
    }, at);
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
    const shown = await page.screenshot({ clip, animations: 'allow' });
    const tag = await page.addStyleTag({ content: '.paper-front > .paper-fold { visibility: hidden !important; }' });
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
    const hidden = await page.screenshot({ clip, animations: 'allow' });
    await tag.evaluate((el) => el.remove());

    const a = await sharp(shown).raw().toBuffer({ resolveWithObject: true });
    const b = await sharp(hidden).raw().toBuffer();
    const { width, height, channels } = a.info;
    const scale = width / clip.width;
    const edgeX = (right - clip.x) * scale;
    const edgeY = (bottom - clip.y) * scale;
    const outside: string[] = [];
    let inside = 0;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = (y * width + x) * channels;
        let delta = 0;
        for (let c = 0; c < 3; c += 1) delta = Math.max(delta, Math.abs(a.data[i + c] - b[i + c]));
        if (delta <= 4) continue;
        if (x >= edgeX || y >= edgeY) outside.push(`${x - edgeX},${y - edgeY}`);
        else inside += 1;
      }
    }
    expect(inside, `the flap is drawn at ${at}ms`).toBeGreaterThan(500);
    expect(outside, `flap pixels past the sheet's edges at ${at}ms`).toEqual([]);
  }
});
