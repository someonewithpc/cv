import { expect, type Page, test } from '@playwright/test';

import { swipeStack } from './support/paperStack';

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

test.describe('with JavaScript off', () => {
  test.use({ javaScriptEnabled: false });

  test('no hint is painted, since nothing will turn the page', async ({ page }) => {
    await page.goto('/');

    const hints = page.locator('.flip-hints');
    await expect(hints).toHaveCount(await page.locator('.technical-drawing-frame').count());
    for (const hint of await hints.all()) await expect(hint).toBeHidden();
  });
});
