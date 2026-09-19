import { expect, test } from '@playwright/test';

/**
 * TechnicalDrawing/annotations-position.ts anchors every callout of an Annotations
 * overlay to the artwork's own box, and a callout with a target to that element, at any
 * container width. Each annotated layer is checked in place: the stack's splay rotate is
 * switched off for the read (it never moves layout, and turning every page to the front
 * would take a swipe each), and the artwork's box is its layout box, read through a
 * ResizeObserver so a `scale` on the artwork (the original Visrez logo carries one) does
 * not leak into it. Targets are read from their client rects, which is where the visitor
 * sees them.
 */

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
];

const TOLERANCE = 1;
const TARGET_TOLERANCE = 2;

type Box = { left: number; top: number; right: number; bottom: number };

type Reading = {
  layer: string;
  mode: string;
  corners: { min: [number, number]; max: [number, number] };
  tips: { tip: string; error: number }[];
  targets: {
    label: string;
    target: string;
    error: number;
    labelOverTarget: boolean;
    shaftOverLabel: boolean;
    inSheet: boolean;
  }[];
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
    const box = (rect: DOMRect): Box => ({ left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom });
    const union = (rects: DOMRect[]) => ({
      left: Math.min(...rects.map((r) => r.left)),
      top: Math.min(...rects.map((r) => r.top)),
      right: Math.max(...rects.map((r) => r.right)),
      bottom: Math.max(...rects.map((r) => r.bottom)),
    });
    const intersects = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    const contains = (a: Box, b: Box) => b.left >= a.left && b.right <= a.right && b.top >= a.top && b.bottom <= a.bottom;
    // Segment against box, by clipping the segment's parameter to each slab.
    const segmentCrosses = (p: DOMPoint, q: DOMPoint, b: Box) => {
      let t0 = 0;
      let t1 = 1;
      for (const [d, lo, hi] of [
        [q.x - p.x, b.left - p.x, b.right - p.x],
        [q.y - p.y, b.top - p.y, b.bottom - p.y],
      ]) {
        if (Math.abs(d) < 1e-9) {
          if (lo > 0 || hi < 0) return false;
          continue;
        }
        const [a, c] = d > 0 ? [lo / d, hi / d] : [hi / d, lo / d];
        t0 = Math.max(t0, a);
        t1 = Math.min(t1, c);
        if (t0 > t1) return false;
      }
      return true;
    };

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

      const sheet = box(svg.closest('section')!.getBoundingClientRect());
      const tips: Reading['tips'] = [];
      const targets: Reading['targets'] = [];
      for (const callout of svg.querySelectorAll<SVGGElement>('[data-tip]')) {
        if (!callout.getClientRects().length) continue;
        const path = callout.querySelector('path')!;
        const text = callout.querySelector('text')!;
        const selector = callout.dataset.target;
        if (!selector) {
          const [x, y] = (callout.dataset.tip ?? '').trim().split(/\s+/).map(Number);
          const point = new DOMPoint(x, y).matrixTransform(callout.getScreenCTM()!);
          const target = expected(x, y);
          tips.push({ tip: callout.dataset.tip ?? '', error: Math.hypot(point.x - target.x, point.y - target.y) });
          continue;
        }
        const elements = artwork.matches(selector) ? [artwork] : [...artwork.querySelectorAll(selector)];
        const targetBox = union(elements.map((el) => el.getBoundingClientRect()));
        const [fx, fy] = (callout.dataset.anchor ?? '0.5 0.5').split(/\s+/).map(Number);
        const anchor = {
          x: targetBox.left + fx * (targetBox.right - targetBox.left),
          y: targetBox.top + fy * (targetBox.bottom - targetBox.top),
        };
        const pathCtm = path.getScreenCTM()!;
        const d = path.getAttribute('d')!.match(/-?[\d.]+(?:e-?\d+)?/g)!.map(Number);
        const tip = new DOMPoint(d[0], d[1]).matrixTransform(pathCtm);
        const end = new DOMPoint(d[0] + d[2], d[1] + d[3]).matrixTransform(pathCtm);
        const labelBox = box(text.getBoundingClientRect());
        // A shaft may start at the label's corner; only a run through the glyphs counts.
        const glyphs = { left: labelBox.left + 1, top: labelBox.top + 1, right: labelBox.right - 1, bottom: labelBox.bottom - 1 };
        targets.push({
          label: text.textContent?.trim() ?? '',
          target: selector,
          error: Math.hypot(tip.x - anchor.x, tip.y - anchor.y),
          labelOverTarget: intersects(labelBox, targetBox),
          shaftOverLabel: segmentCrosses(tip, end, glyphs),
          inSheet: contains(sheet, labelBox) && contains(sheet, { left: tip.x, top: tip.y, right: tip.x, bottom: tip.y }),
        });
      }

      readings.push({ layer, mode: svg.dataset.annotations ?? '', corners: { min: corner(-1), max: corner(1) }, tips, targets });
    }
    return readings;
  });
}

for (const viewport of VIEWPORTS) {
  test(`at ${viewport.width}px every callout lands on its target and the unit square on the artwork box`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.addStyleTag({ content: 'article.technical-drawing-stack > div { rotate: none !important; }' });

    const overlays = page.locator('svg[data-annotations]');
    await expect(overlays.first()).toBeAttached();
    await expect.poll(() => page.locator('svg[data-annotations="js"]').count()).toBe(await overlays.count());
    // The cube's faces are targets and spin for three seconds after load; the script
    // re-reads them when that ends.
    await expect
      .poll(() => page.evaluate(() =>
        [...document.querySelectorAll('svg[data-annotations]')].every((svg) => {
          const artwork = [...svg.parentElement!.children].find((child) => child !== svg)!;
          return artwork.getAnimations({ subtree: true }).every((animation) => animation.playState !== 'running');
        })), { timeout: 10_000 })
      .toBe(true);
    await page.waitForTimeout(100);

    const readings = await readOverlays(page);
    expect(readings.length).toBeGreaterThanOrEqual(5);
    for (const reading of readings) {
      const label = `${reading.layer} at ${viewport.width}px`;
      expect(reading.mode, label).toBe('js');
      expect(reading.tips.length + reading.targets.length, label).toBeGreaterThan(0);
      for (const axis of [0, 1] as const) {
        expect(Math.abs(reading.corners.min[axis]), `${label}: (-1,-1)`).toBeLessThanOrEqual(TOLERANCE);
        expect(Math.abs(reading.corners.max[axis]), `${label}: (1,1)`).toBeLessThanOrEqual(TOLERANCE);
      }
      for (const { tip, error } of reading.tips) {
        expect(error, `${label}: tip ${tip}`).toBeLessThanOrEqual(TOLERANCE);
      }
      for (const callout of reading.targets) {
        const name = `${label}: "${callout.label}" -> ${callout.target}`;
        expect(callout.error, `${name} tip error`).toBeLessThanOrEqual(TARGET_TOLERANCE);
        expect(callout.labelOverTarget, `${name} label over target`).toBe(false);
        expect(callout.shaftOverLabel, `${name} shaft over label`).toBe(false);
        expect(callout.inSheet, `${name} outside the sheet`).toBe(true);
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
