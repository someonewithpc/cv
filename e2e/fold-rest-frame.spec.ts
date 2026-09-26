import { expect, test } from '@playwright/test';

/**
 * The flip-hint layer is the stack's sibling inside .technical-drawing-frame, so PaperStack's
 * own --fold-rest-x/-y (published on the stack, for the dog-ear to rest at) does not reach it
 * by inheritance. The frame declares the same two custom properties from the one scss source
 * PaperStack reads, rather than a script copying the stack's computed value onto the frame at
 * boot. This checks the frame's copy still resolves to the dog-ear's actual rest size, 2cm by
 * 1cm, in the page's own pixels — the one thing a script would have gotten right by
 * construction and a second copy of the same source could still get wrong.
 */
test('the frame\'s fold-rest size matches the dog-ear\'s 2cm by 1cm rest, in px', async ({ page }) => {
  await page.goto('/');

  const pxPerCm = await page.evaluate(() => {
    const probe = document.createElement('div');
    probe.style.cssText = 'position:absolute;visibility:hidden;width:1cm';
    document.body.appendChild(probe);
    const width = probe.getBoundingClientRect().width;
    probe.remove();
    return width;
  });

  const frames = await page.locator('.technical-drawing-frame').count();
  expect(frames).toBeGreaterThan(0);

  for (let i = 0; i < frames; i += 1) {
    const [x, y] = await page.locator('.technical-drawing-frame').nth(i).evaluate((frame) => {
      const style = getComputedStyle(frame);
      const px = (value: string) => {
        const probe = document.createElement('div');
        probe.style.cssText = `position:absolute;visibility:hidden;width:${value}`;
        frame.appendChild(probe);
        const width = probe.getBoundingClientRect().width;
        probe.remove();
        return width;
      };
      return [px(style.getPropertyValue('--fold-rest-x')), px(style.getPropertyValue('--fold-rest-y'))];
    });
    expect(Math.abs(x - 2 * pxPerCm), `frame ${i} --fold-rest-x`).toBeLessThanOrEqual(0.5);
    expect(Math.abs(y - 1 * pxPerCm), `frame ${i} --fold-rest-y`).toBeLessThanOrEqual(0.5);
  }
});
