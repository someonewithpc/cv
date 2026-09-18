import { expect, test, type Locator } from '@playwright/test';

import { frontPageName } from './support/paperStack';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

/**
 * What the stack says about the pages already turned, and what it actually draws for them:
 * `turned` is the count fold-drag.ts keeps on the stack, `standing` the pages held above the
 * front one, and `showing` the sheet backs painted in the pile (see PaperStack/index.astro).
 * All three should agree with the number of turns.
 */
async function pile(stack: Locator): Promise<{ turned: string, standing: number, showing: number }> {
  return stack.evaluate((el) => {
    const pages = [...el.children] as HTMLElement[];
    const front = pages.find((page) => page.style.getPropertyValue('--page-index').trim() === '1')!;
    const top = front.getBoundingClientRect().top;
    return {
      turned: getComputedStyle(el).getPropertyValue('--pages-turned').trim(),
      standing: pages.filter((page) => page.getBoundingClientRect().top < top - 1).length,
      showing: pages.filter((page) => getComputedStyle(page, '::after').opacity === '1').length,
    };
  });
}

/** Every turned page, ordered as the pile stands: nearest the stack first, furthest out last. */
async function standing(stack: Locator) {
  return stack.evaluate((el) => {
    const pages = [...el.children] as HTMLElement[];
    const front = pages.find((page) => page.style.getPropertyValue('--page-index').trim() === '1')!;
    const base = front.getBoundingClientRect().top;
    return pages
      .filter((page) => getComputedStyle(page, '::after').opacity === '1')
      .map((page) => ({
        // A flip renumbers every page, so the DOM position is the only stable name a sheet has.
        slot: pages.indexOf(page),
        index: Number(page.style.getPropertyValue('--page-index')),
        order: Number(getComputedStyle(page).order),
        rise: base - page.getBoundingClientRect().top,
      }))
      .sort((a, b) => a.rise - b.rise);
  });
}

const turn = async (stack: Locator, key: 'ArrowRight' | 'ArrowLeft') => {
  await stack.focus();
  await stack.page().keyboard.press(key);
  // Long enough for the flip's own glide, and for the pile's 250ms ease, to finish.
  await stack.page().waitForTimeout(2500);
};

test('marker editor: the pile behind the stack counts the pages turned', async ({ page }) => {
  const stack = page.locator('article.technical-drawing-stack').nth(1);
  await stack.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);

  // Nothing turned yet, so nothing stands behind the stack.
  expect(await pile(stack)).toEqual({ turned: '0', standing: 0, showing: 0 });

  await turn(stack, 'ArrowRight');
  expect(await pile(stack)).toEqual({ turned: '1', standing: 1, showing: 1 });

  await turn(stack, 'ArrowRight');
  expect(await pile(stack)).toEqual({ turned: '2', standing: 2, showing: 2 });
  expect(await frontPageName(stack)).toBe('Marker Editor');

  // The pile comes back down page by page, the same way it went up.
  await turn(stack, 'ArrowLeft');
  expect(await pile(stack)).toEqual({ turned: '1', standing: 1, showing: 1 });

  await turn(stack, 'ArrowLeft');
  expect(await pile(stack)).toEqual({ turned: '0', standing: 0, showing: 0 });
  expect(await frontPageName(stack)).toBe('Interactive Map Marker Editor');
});

test('marker editor: a turned page goes to the back of the pile, on an arc', async ({ page }) => {
  const stack = page.locator('article.technical-drawing-stack').nth(1);
  await stack.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);

  for (let i = 0; i < 3; i += 1) await turn(stack, 'ArrowRight');
  const sheets = await standing(stack);
  expect(sheets).toHaveLength(3);

  // A flip puts the page under the bottom of the stack, so the page turned most recently — the
  // highest --page-index — stands furthest out and paints behind everything else in the pile.
  expect(sheets.map((sheet) => sheet.index)).toEqual([4, 5, 6]);
  expect(sheets.map((sheet) => sheet.order)).toEqual([-4, -5, -6]);

  // The steps close up as the pile goes back, the way the fan below splays, instead of stepping
  // out by the same amount every time.
  const steps = [sheets[0].rise, sheets[1].rise - sheets[0].rise, sheets[2].rise - sheets[1].rise];
  expect(steps[0]).toBeGreaterThan(steps[1] + 1);
  expect(steps[1]).toBeGreaterThan(steps[2] + 0.5);

  // Coming back takes the page furthest out, not the one nearest the stack.
  const furthest = sheets[2].slot;
  await turn(stack, 'ArrowLeft');
  const promoted = await stack.evaluate(
    (el, slot) => (el.children[slot] as HTMLElement).style.getPropertyValue('--page-index').trim(),
    furthest,
  );
  expect(promoted).toBe('1');
  expect(await pile(stack)).toEqual({ turned: '2', standing: 2, showing: 2 });
});

test('marker editor: the folded corner covers the pile behind it', async ({ page }) => {
  const stack = page.locator('article.technical-drawing-stack').nth(1);
  await stack.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);

  for (let i = 0; i < 3; i += 1) await turn(stack, 'ArrowRight');

  const seen = await stack.evaluate((el) => {
    const pages = [...el.children] as HTMLElement[];
    const front = pages.find((page) => page.style.getPropertyValue('--page-index').trim() === '1')!;
    const style = getComputedStyle(front, '::before');
    const base = front.getBoundingClientRect();
    // Every page of a stack sits in the same grid cell, so the front page — which never leans —
    // gives the corner they all start from, and a page's own translate and rotate carry it from
    // there. A leaning sheet's bounding box would not: it reports the lifted right-hand corner.
    const corner = (page: HTMLElement) => {
      const own = getComputedStyle(page);
      const [ox, oy] = own.transformOrigin.split(' ').map(Number.parseFloat);
      const moved = own.translate === 'none' ? [0, 0] : own.translate.split(' ').map(Number.parseFloat);
      const turn = (own.rotate === 'none' ? 0 : Number.parseFloat(own.rotate)) * Math.PI / 180;
      const [cos, sin] = [Math.cos(turn), Math.sin(turn)];
      return {
        x: base.left + ox + (moved[0] ?? 0) - ox * cos + oy * sin,
        y: base.top + oy + (moved[1] ?? 0) - ox * sin - oy * cos,
      };
    };
    return {
      opacity: style.opacity,
      left: base.left + Number.parseFloat(style.left),
      top: base.top + Number.parseFloat(style.top),
      width: Number.parseFloat(style.width),
      height: Number.parseFloat(style.height),
      pile: pages
        .filter((page) => getComputedStyle(page, '::after').opacity === '1')
        .map(corner),
    };
  });
  expect(seen.opacity).toBe('1');
  expect(seen.pile).toHaveLength(3);

  // The fold is a triangle cut on the crease, so a corner is under it when it sits inside the
  // box and on the near side of the hypotenuse.
  for (const sheet of seen.pile) {
    const x = (sheet.x - seen.left) / seen.width;
    const y = (sheet.y - seen.top) / seen.height;
    expect(x).toBeGreaterThanOrEqual(0);
    expect(y).toBeGreaterThanOrEqual(0);
    expect(x + y).toBeLessThanOrEqual(1);
  }
});
