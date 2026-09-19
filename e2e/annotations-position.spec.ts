import { expect, test } from '@playwright/test';

/**
 * TechnicalDrawing/annotations-position.ts anchors every callout of an Annotations
 * overlay to the artwork's own box, at any container width. Each annotated layer is
 * checked in place: the stack's splay rotate is switched off for the read (it never
 * moves layout, and turning every page to the front would take a swipe each), and the
 * artwork's box is its layout box, read through a ResizeObserver so a `scale` on the
 * artwork (the original Visrez logo carries one) does not leak into it.
 */

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
];

const TOLERANCE = 1;

type Reading = {
  layer: string;
  mode: string;
  corners: { min: [number, number]; max: [number, number] };
  tips: { tip: string; error: number }[];
};

async function readOverlays(page: import('@playwright/test').Page): Promise<Reading[]> {
  return page.evaluate(async () => {
    const layoutBox = (el: Element) =>
      new Promise<[number, number]>((resolve) => {
        const observer = new ResizeObserver(([entry]) => {
          observer.disconnect();
          const [box] = entry.borderBoxSize;
          resolve([box.inlineSize, box.blockSize]);
        });
        observer.observe(el);
      });

    const readings: Reading[] = [];
    for (const svg of document.querySelectorAll<SVGSVGElement>('svg[data-annotations]')) {
      const content = svg.parentElement!;
      const artwork = [...content.children].find((child) => child !== svg)!;
      const layer =
        svg.closest('article.technical-drawing-stack > div')?.querySelector('h2.typewriter')?.textContent?.trim() ??
        '?';
      const [width, height] = await layoutBox(artwork);
      const rect = artwork.getBoundingClientRect();
      const centre = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      const expected = (x: number, y: number) => ({ x: centre.x + (x * width) / 2, y: centre.y + (y * height) / 2 });

      // The overlay keeps one unit for both axes, so ±1 in artwork terms is ±(half
      // extent / unit) in overlay terms; the script uses the artwork's short side as unit.
      const unit = Math.min(width, height) / 2;
      const scale = { x: width / (2 * unit), y: height / (2 * unit) };
      const ctm = svg.getScreenCTM()!;
      const corner = (sign: number): [number, number] => {
        const point = new DOMPoint(sign * scale.x, sign * scale.y).matrixTransform(ctm);
        const target = expected(sign, sign);
        return [point.x - target.x, point.y - target.y];
      };

      const tips = [...svg.querySelectorAll<SVGGElement>('[data-tip]')].map((callout) => {
        const [x, y] = (callout.dataset.tip ?? '').trim().split(/\s+/).map(Number);
        const point = new DOMPoint(x, y).matrixTransform(callout.getScreenCTM()!);
        const target = expected(x, y);
        return { tip: callout.dataset.tip ?? '', error: Math.hypot(point.x - target.x, point.y - target.y) };
      });

      readings.push({ layer, mode: svg.dataset.annotations ?? '', corners: { min: corner(-1), max: corner(1) }, tips });
    }
    return readings;
  });
}

for (const viewport of VIEWPORTS) {
  test(`at ${viewport.width}px every callout tip and the unit square land on the artwork box`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.addStyleTag({ content: 'article.technical-drawing-stack > div { rotate: none !important; }' });

    const overlays = page.locator('svg[data-annotations]');
    await expect(overlays.first()).toBeAttached();
    await expect.poll(() => page.locator('svg[data-annotations="js"]').count()).toBe(await overlays.count());
    await page.waitForTimeout(100);

    const readings = await readOverlays(page);
    expect(readings.length).toBeGreaterThanOrEqual(5);
    for (const reading of readings) {
      const label = `${reading.layer} at ${viewport.width}px`;
      expect(reading.mode, label).toBe('js');
      expect(reading.tips.length, label).toBeGreaterThan(0);
      for (const axis of [0, 1] as const) {
        expect(Math.abs(reading.corners.min[axis]), `${label}: (-1,-1)`).toBeLessThanOrEqual(TOLERANCE);
        expect(Math.abs(reading.corners.max[axis]), `${label}: (1,1)`).toBeLessThanOrEqual(TOLERANCE);
      }
      for (const { tip, error } of reading.tips) {
        expect(error, `${label}: tip ${tip}`).toBeLessThanOrEqual(TOLERANCE);
      }
    }
  });
}

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('the callouts still render from the stylesheet placement', async ({ page }) => {
    await page.goto('/');
    const overlays = page.locator('svg[data-annotations="css"]');
    expect(await overlays.count()).toBeGreaterThanOrEqual(5);
    await expect(page.locator('svg[data-annotations="js"]')).toHaveCount(0);
    for (const overlay of await overlays.all()) {
      expect(await overlay.locator('[data-tip] path').count()).toBeGreaterThan(0);
    }
  });
});
