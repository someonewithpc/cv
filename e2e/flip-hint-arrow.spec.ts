import { expect, type Page, test } from '@playwright/test';
import sharp from 'sharp';

import { swipeStack } from './support/paperStack';

type Rgb = readonly [number, number, number];

const luminance = ([r, g, b]: Rgb) => {
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};

/** WCAG contrast ratio between two sRGB colours. */
function contrast(a: Rgb, b: Rgb): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

/**
 * The hints point at a crease, so what these tests measure is geometry: where the tip of each
 * arrow lands, and which way it is travelling when it gets there. Both creases are read back off
 * the stack itself rather than written down here, so the numbers that draw the fold stay the only
 * copy. The page grows a demo every few weeks and the stack's own insides move around, so nothing
 * here may assume how many stacks there are or how a page is built.
 *
 * The fold rests still under reduced motion (the dog-ear's tease runs once and stops), which is
 * what makes the crease a fixed thing to aim at.
 */
test.use({ reducedMotion: 'reduce' });

type Aim = {
  /** How far along the crease the tip misses its middle, in px. */
  alongCrease: number;
  /** How far off the paper the tip stands, in px: positive is clear of it. */
  offCrease: number;
  /** The angle between the arrow's last stroke and the crease's normal, in degrees. */
  angleToNormal: number;
  /** How far the tail's start stands from the words' box, in px: 0 when it touches. */
  tailToWords: number;
  /** How far the tip stands from the crease's middle, in px. */
  tipToMiddle: number;
  painted: boolean;
  animations: number;
};

function aim(page: Page, way: 'fwd' | 'back'): Promise<Aim> {
  return page.evaluate((which) => {
    const frame = document.querySelector('.technical-drawing-frame')!;
    const front = frame.querySelector<HTMLElement>('.paper-front')!;
    const sheet = front.getBoundingClientRect();

    // The fold sizes are lengths in whatever unit the stack wrote them, so let the browser
    // resolve them instead of parsing.
    const px = (value: string) => {
      const probe = document.createElement('div');
      probe.style.cssText = `position:absolute;visibility:hidden;width:${value || '0px'}`;
      front.appendChild(probe);
      const width = probe.getBoundingClientRect().width;
      probe.remove();
      return width;
    };
    const prop = (el: Element, name: string) => px(getComputedStyle(el).getPropertyValue(name).trim());

    const stack = frame.querySelector('article.technical-drawing-stack')!;
    // The dog-ear's crease cuts the sheet's bottom-right corner, the folded-away one its
    // top-left. Both run between the two intercepts the stack keeps.
    const crease = which === 'fwd'
      ? {
        a: { x: sheet.right - prop(front, '--fold-x'), y: sheet.bottom },
        b: { x: sheet.right, y: sheet.bottom - prop(front, '--fold-y') },
        corner: { x: sheet.right, y: sheet.bottom },
      }
      : {
        a: { x: sheet.left + prop(stack, '--fold-back-rest-x'), y: sheet.top },
        b: { x: sheet.left, y: sheet.top + prop(stack, '--fold-back-rest-y') },
        corner: { x: sheet.left, y: sheet.top },
      };
    const middle = { x: (crease.a.x + crease.b.x) / 2, y: (crease.a.y + crease.b.y) / 2 };

    const arrow = frame.querySelector<SVGSVGElement>(`.flip-hint--${which}.hint-arrow`)!;
    const shaft = arrow.querySelector<SVGPathElement>('.hint-shaft')!;
    const matrix = shaft.getScreenCTM()!;
    const at = (length: number) => {
      const point = shaft.getPointAtLength(length);
      return {
        x: point.x * matrix.a + point.y * matrix.c + matrix.e,
        y: point.x * matrix.b + point.y * matrix.d + matrix.f,
      };
    };
    const tip = at(shaft.getTotalLength());
    const before = at(shaft.getTotalLength() - 2);
    const tail = at(0);
    const words = frame.querySelector<HTMLElement>(`.flip-hint--${which}.hint-words`)!.getBoundingClientRect();
    const tailToWords = Math.hypot(
      Math.max(words.left - tail.x, 0, tail.x - words.right),
      Math.max(words.top - tail.y, 0, tail.y - words.bottom),
    );

    // Along the crease, and out of the sheet across it.
    const edge = { x: crease.b.x - crease.a.x, y: crease.b.y - crease.a.y };
    const edgeLength = Math.hypot(edge.x, edge.y);
    let out = { x: -edge.y, y: edge.x };
    if ((crease.corner.x - middle.x) * out.x + (crease.corner.y - middle.y) * out.y < 0) {
      out = { x: -out.x, y: -out.y };
    }
    const outLength = Math.hypot(out.x, out.y);
    out = { x: out.x / outLength, y: out.y / outLength };

    const off = { x: tip.x - middle.x, y: tip.y - middle.y };
    const travel = { x: tip.x - before.x, y: tip.y - before.y };
    const travelLength = Math.hypot(travel.x, travel.y);
    const cosine = (travel.x * -out.x + travel.y * -out.y) / travelLength;

    return {
      alongCrease: (off.x * edge.x + off.y * edge.y) / edgeLength,
      offCrease: off.x * out.x + off.y * out.y,
      angleToNormal: (Math.acos(Math.max(-1, Math.min(1, cosine))) * 180) / Math.PI,
      tailToWords,
      tipToMiddle: Math.hypot(off.x, off.y),
      painted: Number(getComputedStyle(arrow).opacity) > 0.5,
      animations: arrow.getAnimations({ subtree: true }).length,
    };
  }, way);
}

const armed = (page: Page, index: number) => page.evaluate((i) => {
  const hints = document.querySelectorAll('.technical-drawing-frame')[i].querySelector('.flip-hints')!;
  return getComputedStyle(hints).display !== 'none';
}, index);

test('the way out points square at the middle of the dog-ear crease', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(1200);

  const forward = await aim(page, 'fwd');
  expect(forward.painted).toBe(true);
  expect(Math.abs(forward.alongCrease)).toBeLessThan(6);
  expect(forward.offCrease).toBeGreaterThan(1);
  expect(forward.offCrease).toBeLessThan(16);
  expect(forward.angleToNormal).toBeLessThan(8);

  // The hint is a drawing, not a demonstration: nothing about it moves while it waits.
  expect(forward.animations).toBe(0);

  // The way back's arrow reaches out past the frame's left edge, which is the one direction the
  // page has no room to give.
  const [scrollWidth, clientWidth] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(scrollWidth).toBe(clientWidth);
});

test('the top stack alone carries the hints', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(1200);

  const frames = await page.locator('.technical-drawing-frame').count();
  expect(frames).toBeGreaterThanOrEqual(2);
  expect(await armed(page, 0)).toBe(true);
  for (let i = 1; i < frames; i += 1) {
    expect(await armed(page, i), `stack ${i}`).toBe(false);
  }
});

test('a turn hands over to the way back, which points at the folded-away crease', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(800);

  const stack = page.locator('article.technical-drawing-stack').first();
  await stack.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);

  await swipeStack(page, stack, true);
  await expect(stack).toHaveAttribute('data-paper-turned', '');

  expect((await aim(page, 'fwd')).painted).toBe(false);
  const back = await aim(page, 'back');
  expect(back.painted).toBe(true);
  expect(Math.abs(back.alongCrease)).toBeLessThan(6);
  expect(back.offCrease).toBeGreaterThan(1);
  expect(back.offCrease).toBeLessThan(16);
  expect(back.angleToNormal).toBeLessThan(8);
  expect(back.animations).toBe(0);

  await swipeStack(page, stack, false);
  await expect(stack).toHaveAttribute('data-paper-returned', '');
  expect((await aim(page, 'fwd')).painted).toBe(false);
  expect((await aim(page, 'back')).painted).toBe(false);
});

/**
 * Where the hints sit: in the gap between this stack and its neighbours, mostly off the paper.
 * Each is measured as its words' box plus its arrow's, against the front sheet and against
 * whatever comes next in the page's flow (or, for the way back, before).
 */
type Place = {
  /** The share of the hint's painted area (words plus arrow) that lies on the front sheet. */
  onSheet: number;
  /** Room between the words and the nearest neighbour in the page's flow, in px. */
  toNeighbour: number;
  /** The words' box against the viewport: negative when any of it is off screen. */
  inView: number;
};

function placed(page: Page, way: 'fwd' | 'back'): Promise<Place> {
  return page.evaluate((which) => {
    const frame = document.querySelector('.technical-drawing-frame')!;
    const sheet = frame.querySelector<HTMLElement>('.paper-front')!.getBoundingClientRect();
    const words = frame.querySelector<HTMLElement>(`.flip-hint--${which}.hint-words`)!.getBoundingClientRect();
    // The arrow's own box is the whole layer once the script has drawn it, so take the strokes.
    const strokes = [...frame.querySelectorAll<SVGPathElement>(
      `.flip-hint--${which}.hint-arrow .hint-shaft, .flip-hint--${which}.hint-arrow .hint-head`,
    )].map((stroke) => stroke.getBoundingClientRect());
    const arrow = new DOMRect(
      Math.min(...strokes.map((r) => r.left)),
      Math.min(...strokes.map((r) => r.top)),
      Math.max(...strokes.map((r) => r.right)) - Math.min(...strokes.map((r) => r.left)),
      Math.max(...strokes.map((r) => r.bottom)) - Math.min(...strokes.map((r) => r.top)),
    );

    const overlap = (a: DOMRect, b: DOMRect) =>
      Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
      * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    const area = (a: DOMRect) => a.width * a.height;

    // The stacks are laid out one under another; scripts between them take no room.
    const demo = frame.closest('#demos > *')!;
    let neighbour = which === 'fwd' ? demo.nextElementSibling : demo.previousElementSibling;
    while (neighbour && neighbour.tagName === 'SCRIPT') {
      neighbour = which === 'fwd' ? neighbour.nextElementSibling : neighbour.previousElementSibling;
    }
    const other = neighbour!.getBoundingClientRect();

    return {
      onSheet: (overlap(words, sheet) + overlap(arrow, sheet)) / (area(words) + area(arrow)),
      toNeighbour: which === 'fwd' ? other.top - words.bottom : words.top - other.bottom,
      inView: Math.min(words.left, words.top, innerWidth - words.right, innerHeight - words.bottom),
    };
  }, way);
}

const sizes = [
  { width: 360, height: 780 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
];

// The words stay where the stylesheet puts them and the arrow is drawn between them and the
// crease, so at any width the tail is at the words and the head lands square on the fold.
test('each arrow runs from its words to the middle of its crease at every width', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(1200);

  const stack = page.locator('article.technical-drawing-stack').first();
  for (const way of ['fwd', 'back'] as const) {
    if (way === 'back') {
      await stack.scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
      await swipeStack(page, stack, true);
      await expect(stack).toHaveAttribute('data-paper-turned', '');
    }
    for (const size of sizes) {
      await page.setViewportSize(size);
      await page.waitForTimeout(700);
      const label = `${way} at ${size.width}`;

      const arrow = await aim(page, way);
      expect(arrow.painted, `${label} painted`).toBe(true);
      expect(arrow.tailToWords, `${label} tail at the words`).toBeLessThan(12);
      expect(arrow.tipToMiddle, `${label} tip on the crease's middle`).toBeLessThan(6);
      expect(arrow.angleToNormal, `${label} square to the crease`).toBeLessThan(10);
    }
  }
});

test('both hints sit in the gap beside the stack at every width', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(1200);

  for (const size of sizes) {
    await page.setViewportSize(size);
    await page.waitForTimeout(700);
    const label = `at ${size.width}`;

    for (const way of ['fwd', 'back'] as const) {
      // Bring the end of the sheet the hint belongs to into view before measuring against it.
      await page.evaluate((which) => {
        const frame = document.querySelector('.technical-drawing-frame')!.getBoundingClientRect();
        window.scrollTo(0, scrollY + (which === 'fwd' ? frame.bottom : frame.top) - innerHeight / 2);
      }, way);
      await page.waitForTimeout(300);

      const place = await placed(page, way);
      expect(place.onSheet, `${way} on the sheet ${label}`).toBeLessThan(0.3);
      expect(place.toNeighbour, `${way} room to the neighbour ${label}`).toBeGreaterThan(8);
      expect(place.inView, `${way} in view ${label}`).toBeGreaterThanOrEqual(0);
    }
  }
});

// Both hints are written on the page, not on the sheet, so it is the page's own colour their
// ink has to stand off, in every theme. The arrow's tail also crosses the fanned pages behind
// the sheet on its way in, which is what the pass in the page colour under its stroke is for.
test('the hint reads against the page in every theme and at every width', async ({ page }) => {
  await page.goto('/');

  for (const theme of ['light', 'dark', 'arctic', 'dark-forest']) {
    await page.evaluate((name) => localStorage.setItem('cv-theme', name), theme);
    await page.reload();
    await page.waitForTimeout(1200);

    for (const size of sizes) {
      await page.setViewportSize(size);
      await page.evaluate(() => {
        const frame = document.querySelector('.technical-drawing-frame')!.getBoundingClientRect();
        window.scrollTo(0, scrollY + frame.bottom - innerHeight / 2);
      });
      await page.waitForTimeout(700);

      const { words, path, ink } = await page.evaluate(() => {
        const frame = document.querySelector('.technical-drawing-frame')!;
        const text = frame.querySelector<HTMLElement>('.flip-hint--fwd.hint-words')!;
        const box = text.getBoundingClientRect();
        const words = { left: box.left, top: box.top, right: box.right, bottom: box.bottom };

        // One point every fortieth of the shaft and of the head, in screen pixels.
        const path: [number, number][] = [];
        for (const part of ['hint-shaft', 'hint-head']) {
          const stroke = frame.querySelector<SVGPathElement>(`.flip-hint--fwd.hint-arrow .${part}`)!;
          const matrix = stroke.getScreenCTM()!;
          const total = stroke.getTotalLength();
          for (let i = 0; i <= 40; i += 1) {
            const p = stroke.getPointAtLength((total * i) / 40);
            path.push([
              Math.round(p.x * matrix.a + p.y * matrix.c + matrix.e),
              Math.round(p.x * matrix.b + p.y * matrix.d + matrix.f),
            ]);
          }
        }
        // The themes name their colours in oklch, which no amount of string work turns into the
        // sRGB the screenshot is in; the canvas already knows how.
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 1;
        const context = canvas.getContext('2d')!;
        context.fillStyle = getComputedStyle(text).color;
        context.fillRect(0, 0, 1, 1);
        const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
        return { words, path, ink: [r, g, b] as Rgb };
      });

      // Hide the ink and leave the halo: what remains is what each stroke and glyph is read
      // against.
      const hidden = await page.addStyleTag({
        content: '.hint-words, .hint-shaft, .hint-pass, .hint-head { opacity: 0 !important; transition: none !important; }',
      });
      const shot = await page.screenshot();
      await hidden.evaluate((node: Element) => node.remove());
      const { data, info } = await sharp(shot).raw().toBuffer({ resolveWithObject: true });
      const at = ([x, y]: readonly [number, number]) => {
        const i = (y * info.width + x) * info.channels;
        return [data[i], data[i + 1], data[i + 2]] as const;
      };

      let worstWords = Infinity;
      for (let y = Math.ceil(words.top); y < words.bottom; y += 2) {
        for (let x = Math.ceil(words.left); x < words.right; x += 2) {
          worstWords = Math.min(worstWords, contrast(ink, at([x, y])));
        }
      }
      let worstArrow = Infinity;
      for (const point of path) {
        if (point[0] < 0 || point[1] < 0 || point[0] >= info.width || point[1] >= info.height) continue;
        worstArrow = Math.min(worstArrow, contrast(ink, at(point)));
      }
      expect(worstWords, `${theme} words at ${size.width}`).toBeGreaterThanOrEqual(4.5);
      expect(worstArrow, `${theme} arrow at ${size.width}`).toBeGreaterThanOrEqual(4.5);
    }
  }
});

test.describe('with JavaScript off', () => {
  test.use({ javaScriptEnabled: false });

  test('no hint is painted, since nothing will turn the page', async ({ page }) => {
    await page.goto('/');

    const hints = page.locator('.flip-hints');
    await expect(hints).toHaveCount(await page.locator('.technical-drawing-frame').count());
    for (const hint of await hints.all()) await expect(hint).toBeHidden();
  });
});
