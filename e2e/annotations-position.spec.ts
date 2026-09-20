import { expect, test } from '@playwright/test';

/**
 * TechnicalDrawing/annotations-position.ts anchors every callout of an Annotations
 * overlay to the artwork's own box, and a callout with a target to that element, at any
 * container width. Each annotated layer is checked in place: the stack's splay rotate is
 * switched off for the read (it never moves layout, and turning every page to the front
 * would take a swipe each), and the artwork's box is its layout box, read through a
 * ResizeObserver so a `scale` on the artwork (the original Visrez logo carries one) does
 * not leak into it. Targets are read from their client rects, which is where the visitor
 * sees them; a segment anchor is mapped from the target's SVG through its root's client
 * rect and viewBox, not the screen matrix the script uses.
 */

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
];

const TOLERANCE = 1;
const TARGET_TOLERANCE = 2;
const NORMAL_TOLERANCE = 3;

type Box = { left: number; top: number; right: number; bottom: number };
type Point = { x: number; y: number };

type Reading = {
  layer: string;
  mode: string;
  corners: { min: [number, number]; max: [number, number] };
  tips: { tip: string; error: number }[];
  targets: {
    label: string;
    target: string;
    error: number;
    /** Degrees off the segment's normal, for a callout drawn along one. */
    offNormal: number | null;
    labelOverTarget: boolean;
    shaftOverLabel: boolean;
    overTitleBlock: boolean;
    inSheet: boolean;
    labelBox: Box;
    underline: [Point, Point];
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
    // A segment anchor, from the target's root svg: its viewBox meets its client rect.
    const segmentPoint = (el: Element, x: number, y: number) => {
      const root = (el instanceof SVGSVGElement ? el : (el as SVGElement).ownerSVGElement)!;
      const rect = root.getBoundingClientRect();
      const vb = root.viewBox.baseVal;
      const scale = Math.min(rect.width / vb.width, rect.height / vb.height);
      return {
        x: rect.left + (rect.width - vb.width * scale) / 2 + (x - vb.x) * scale,
        y: rect.top + (rect.height - vb.height * scale) / 2 + (y - vb.y) * scale,
      };
    };
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

      const section = svg.closest('section')!;
      const sheet = box(section.getBoundingClientRect());
      const titleBlock = box(section.querySelector(':scope > table')!.getBoundingClientRect());
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
        const anchorAttr = callout.dataset.anchor ?? '0.5 0.5';
        const segment = anchorAttr.startsWith('segment')
          ? anchorAttr.slice('segment'.length).trim().split(/\s+/).map(Number)
          : null;
        const [ax, fy] = segment ? [] : anchorAttr.split(/\s+/).map(Number);
        const ends = segment && [segmentPoint(elements[0], segment[0], segment[1]), segmentPoint(elements[0], segment[2], segment[3])];
        // A callout with no segment mirrors across the target's vertical axis when its
        // authored side would leave the cell or lie over the target or the title block;
        // annotations-position.ts marks that with data-mirrored on the group.
        const fx = !ends && callout.dataset.mirrored === 'true' ? 1 - ax : ax;
        const anchor = ends
          ? { x: (ends[0].x + ends[1].x) / 2, y: (ends[0].y + ends[1].y) / 2 }
          : {
              x: targetBox.left + fx * (targetBox.right - targetBox.left),
              y: targetBox.top + fy * (targetBox.bottom - targetBox.top),
            };
        const pathCtm = path.getScreenCTM()!;
        const d = path.getAttribute('d')!.match(/-?[\d.]+(?:e-?\d+)?/g)!.map(Number);
        const tip = new DOMPoint(d[0], d[1]).matrixTransform(pathCtm);
        const end = new DOMPoint(d[0] + d[2], d[1] + d[3]).matrixTransform(pathCtm);
        const lineEnd = new DOMPoint(d[0] + d[2] + d[4], d[1] + d[3] + d[5]).matrixTransform(pathCtm);
        const shaft = Math.hypot(end.x - tip.x, end.y - tip.y);
        const dir = { x: (end.x - tip.x) / shaft, y: (end.y - tip.y) / shaft };
        // The tip stops short of the anchor along the shaft by the gap.
        const gap = (Number(callout.dataset.gap) || 0) * Math.min(targetBox.right - targetBox.left, targetBox.bottom - targetBox.top);
        const expectedTip = { x: anchor.x + gap * dir.x, y: anchor.y + gap * dir.y };
        let offNormal: number | null = null;
        if (ends && callout.dataset.angle === 'normal') {
          const length = Math.hypot(ends[1].x - ends[0].x, ends[1].y - ends[0].y);
          const normal = { x: (ends[1].y - ends[0].y) / length, y: -(ends[1].x - ends[0].x) / length };
          offNormal = (Math.acos(Math.min(1, Math.max(-1, normal.x * dir.x + normal.y * dir.y))) * 180) / Math.PI;
        }
        const labelBox = box(text.getBoundingClientRect());
        // A shaft may start at the label's corner; only a run through the glyphs counts.
        const glyphs = { left: labelBox.left + 1, top: labelBox.top + 1, right: labelBox.right - 1, bottom: labelBox.bottom - 1 };
        targets.push({
          label: text.textContent?.trim() ?? '',
          target: selector,
          error: Math.hypot(tip.x - expectedTip.x, tip.y - expectedTip.y),
          offNormal,
          labelOverTarget: intersects(labelBox, targetBox),
          shaftOverLabel: segmentCrosses(tip, end, glyphs),
          overTitleBlock: intersects(labelBox, titleBlock) || segmentCrosses(tip, end, titleBlock),
          inSheet: contains(sheet, labelBox) && contains(sheet, { left: tip.x, top: tip.y, right: tip.x, bottom: tip.y }),
          labelBox,
          underline: [{ x: end.x, y: end.y }, { x: lineEnd.x, y: lineEnd.y }],
        });
      }

      readings.push({ layer, mode: svg.dataset.annotations ?? '', corners: { min: corner(-1), max: corner(1) }, tips, targets });
    }
    return readings;
  });
}

const intersects = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
// Half a pixel around a segment, so two collinear underlines still meet.
const around = (p: Point, q: Point): Box => ({
  left: Math.min(p.x, q.x) - 0.5, top: Math.min(p.y, q.y) - 0.5, right: Math.max(p.x, q.x) + 0.5, bottom: Math.max(p.y, q.y) + 0.5,
});
/** Whether a segment meets a box, or (given two points) another segment, by their bounds. */
const crosses = (segment: [Point, Point], other: Box | [Point, Point]) =>
  intersects(around(...segment), Array.isArray(other) ? around(...other) : other);

for (const viewport of VIEWPORTS) {
  test(`at ${viewport.width}px every callout lands on its target and the unit square on the artwork box`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.addStyleTag({ content: 'article.technical-drawing-stack > div { rotate: none !important; }' });

    const overlays = page.locator('svg[data-annotations]');
    await expect(overlays.first()).toBeAttached();
    await expect.poll(() => page.locator('svg[data-annotations="js"]').count()).toBe(await overlays.count());
    // The cube's faces are targets and spin for three seconds after load; the script
    // re-reads them when that ends. An animation on a scroll timeline (the Groups sheet's
    // pip track) runs for as long as the page does and is not waited for.
    await expect
      .poll(() => page.evaluate(() =>
        [...document.querySelectorAll('svg[data-annotations]')].every((svg) => {
          const artwork = [...svg.parentElement!.children].find((child) => child !== svg)!;
          return artwork
            .getAnimations({ subtree: true })
            .every((animation) => animation.playState !== 'running' || !(animation.timeline instanceof DocumentTimeline));
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
        expect(callout.overTitleBlock, `${name} over the title block`).toBe(false);
        expect(callout.inSheet, `${name} outside the sheet`).toBe(true);
        if (callout.offNormal !== null) {
          expect(callout.offNormal, `${name} off the edge's normal`).toBeLessThanOrEqual(NORMAL_TOLERANCE);
        }
      }
      for (const a of reading.targets) {
        for (const b of reading.targets) {
          if (a === b) continue;
          const name = `${label}: "${a.label}" and "${b.label}"`;
          expect(intersects(a.labelBox, b.labelBox), `${name} labels overlap`).toBe(false);
          expect(crosses(a.underline, b.labelBox), `${name} underline runs into the label`).toBe(false);
          expect(crosses(a.underline, b.underline), `${name} underlines cross`).toBe(false);
        }
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
