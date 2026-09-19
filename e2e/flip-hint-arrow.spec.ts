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
  /** How far the tip is from the crease, in px: negative is short of it, still on the paper. */
  offCrease: number;
  /** The angle between the arrow's last stroke and the crease's normal, in degrees. */
  angleToNormal: number;
  /** How far the arrow's tail is from where the last line of the words stops, in px. */
  tailToWords: number;
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

    // Where the last line of the sentence stops, which is where the tail belongs: the paragraph's
    // own box is wider than its words whenever the line is right-aligned or held short.
    const words = frame.querySelector<HTMLElement>(`.flip-hint--${which}.hint-words`)!;
    const range = document.createRange();
    range.selectNodeContents(words);
    const lines = [...range.getClientRects()];
    const last = lines[lines.length - 1] ?? words.getBoundingClientRect();
    const stop = { x: last.right, y: last.top + last.height / 2 };

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
    // The arrow comes from the words, which are on the paper, so it runs out across the crease.
    const cosine = (travel.x * out.x + travel.y * out.y) / travelLength;

    return {
      alongCrease: (off.x * edge.x + off.y * edge.y) / edgeLength,
      offCrease: off.x * out.x + off.y * out.y,
      angleToNormal: (Math.acos(Math.max(-1, Math.min(1, cosine))) * 180) / Math.PI,
      tailToWords: Math.hypot(tail.x - stop.x, tail.y - stop.y),
      painted: Number(getComputedStyle(arrow).opacity) > 0.5,
      animations: arrow.getAnimations({ subtree: true }).length,
    };
  }, way);
}

/** Whether each hint's words and its arrow are drawn within the front sheet, and by how much. */
function onSheet(page: Page) {
  return page.evaluate(() => {
    const frame = document.querySelector('.technical-drawing-frame')!;
    const sheet = frame.querySelector<HTMLElement>('.paper-front')!.getBoundingClientRect();
    const spill = (box: DOMRect) => Math.max(
      sheet.left - box.left, sheet.top - box.top, box.right - sheet.right, box.bottom - sheet.bottom,
    );
    const out: Record<string, number> = {};
    for (const way of ['fwd', 'back']) {
      for (const part of ['hint-words', 'hint-arrow']) {
        const el = frame.querySelector(`.flip-hint--${way}.${part}`)!;
        // An SVG overlay is as big as the frame whatever it draws, so measure the ink.
        const box = part === 'hint-arrow'
          ? (el.querySelector<SVGPathElement>('.hint-shaft')!.getBoundingClientRect())
          : el.getBoundingClientRect();
        out[`${way} ${part}`] = spill(box);
      }
    }
    return out;
  });
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
  expect(forward.offCrease).toBeLessThan(-1);
  expect(forward.offCrease).toBeGreaterThan(-16);
  expect(forward.angleToNormal).toBeLessThan(8);

  // Words and arrow are one annotation, so the line leaves where the sentence stops.
  expect(forward.tailToWords).toBeLessThan(12);

  // The hint is a drawing, not a demonstration: nothing about it moves while it waits.
  expect(forward.animations).toBe(0);

  // Nothing about the hints may widen the document: they are drawn on an overlay that is allowed
  // to spill, and a stroke escaping to the right would put a scrollbar under the whole page.
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
  expect(back.offCrease).toBeLessThan(-1);
  expect(back.offCrease).toBeGreaterThan(-16);
  expect(back.angleToNormal).toBeLessThan(8);
  expect(back.tailToWords).toBeLessThan(12);
  expect(back.animations).toBe(0);

  await swipeStack(page, stack, false);
  await expect(stack).toHaveAttribute('data-paper-returned', '');
  expect((await aim(page, 'fwd')).painted).toBe(false);
  expect((await aim(page, 'back')).painted).toBe(false);
});

// Below the sheet there is only the room the fan reserves, and on a phone that reserve is
// thinner than a line of marker: the sentence spilled onto the grid between two stacks, where it
// read as a caption for the page rather than a note on the drawing. Both hints belong on the
// paper, and the sizes here are the ones the layout actually changes shape at, portrait and
// landscape, plus a phone held sideways.
const sizes = [
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 768, height: 1024 },
  { width: 844, height: 390 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
];

test('both hints stay on the sheet at every width', async ({ page }) => {
  await page.goto('/');

  for (const size of sizes) {
    await page.setViewportSize(size);
    await page.waitForTimeout(700);

    for (const [part, spill] of Object.entries(await onSheet(page))) {
      expect(spill, `${part} at ${size.width}x${size.height}`).toBeLessThanOrEqual(1);
    }
  }
});

// The marker crosses the title block's rules and the artwork, and the accent ink alone sank into
// both at around 1.4:1. A pass in the sheet's own colour under the stroke puts paper back behind
// it, and the ink itself is taken from whichever page is in front, so a blueprint sheet gets the
// near-white it writes its own accents in rather than the page's dark orange.
test('the arrow reads against what it crosses in every theme', async ({ page }) => {
  await page.goto('/');

  for (const theme of ['light', 'dark', 'arctic', 'dark-forest']) {
    await page.evaluate((name) => localStorage.setItem('cv-theme', name), theme);
    await page.reload();
    await page.waitForTimeout(1200);

    const { points, ink } = await page.evaluate(() => {
      const shaft = document.querySelector<SVGPathElement>('.flip-hint--fwd.hint-arrow .hint-shaft')!;
      const matrix = shaft.getScreenCTM()!;
      const total = shaft.getTotalLength();
      const points: [number, number][] = [];
      for (let i = 0; i <= 40; i += 1) {
        const p = shaft.getPointAtLength((total * i) / 40);
        points.push([
          Math.round(p.x * matrix.a + p.y * matrix.c + matrix.e),
          Math.round(p.x * matrix.b + p.y * matrix.d + matrix.f),
        ]);
      }
      // The themes name their colours in oklch, which no amount of string work turns into the
      // sRGB the screenshot is in; the canvas already knows how.
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      const context = canvas.getContext('2d')!;
      context.fillStyle = getComputedStyle(shaft).stroke;
      context.fillRect(0, 0, 1, 1);
      const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
      return { points, ink: [r, g, b] as [number, number, number] };
    });

    // Hiding the ink and leaving its halo is what "the background the stroke is read against"
    // means: sample the same path the line takes, one point every fortieth of its length.
    const hidden = await page.addStyleTag({
      content: '.hint-shaft, .hint-pass, .hint-head { opacity: 0 !important; transition: none !important; }',
    });
    const shot = await page.screenshot();
    await hidden.evaluate((node: Element) => node.remove());

    const { data, info } = await sharp(shot).raw().toBuffer({ resolveWithObject: true });
    let worst = Infinity;
    for (const [x, y] of points) {
      if (x < 0 || y < 0 || x >= info.width || y >= info.height) continue;
      const at = (y * info.width + x) * info.channels;
      worst = Math.min(worst, contrast(ink, [data[at], data[at + 1], data[at + 2]]));
    }
    expect(worst, `${theme} contrast`).toBeGreaterThanOrEqual(3);
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
