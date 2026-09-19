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

/**
 * The folded-back corner and the pile under it, measured off the front page. Every page of a
 * stack sits in the same grid cell, so the front page — which never leans or moves — gives the
 * box they all start from, and a page's own translate and rotate carry it from there. A leaning
 * sheet's own bounding box would not: it reports the lifted right-hand corner.
 */
async function foldAndPile(stack: Locator) {
  return stack.evaluate((el) => {
    const pages = [...el.children] as HTMLElement[];
    const front = pages.find((page) => page.style.getPropertyValue('--page-index').trim() === '1')!;
    const fold = getComputedStyle(front, '::before');
    const base = front.getBoundingClientRect();
    // The invisible grab handle over the folded corner is the cut plus 1em on each side (see
    // .paper-back-grab), which is how the cut's own size is read here without resolving an em.
    const grab = getComputedStyle(front.querySelector('.paper-back-grab')!);
    const em = Number.parseFloat(getComputedStyle(front).fontSize);

    const place = (page: HTMLElement, x: number, y: number) => {
      const own = getComputedStyle(page);
      const [ox, oy] = own.transformOrigin.split(' ').map(Number.parseFloat);
      const moved = own.translate === 'none' ? [0, 0] : own.translate.split(' ').map(Number.parseFloat);
      const turn = (own.rotate === 'none' ? 0 : Number.parseFloat(own.rotate)) * Math.PI / 180;
      const [cos, sin] = [Math.cos(turn), Math.sin(turn)];
      return base.left + ox + (moved[0] ?? 0) + (x - ox) * cos - (y - oy) * sin;
    };

    return {
      opacity: fold.opacity,
      cutWidth: Number.parseFloat(grab.width) - em,
      cutHeight: Number.parseFloat(grab.height) - em,
      // The sheet's own long side, to read the fold's reach against.
      sheet: Math.max(base.width, base.height),
      // Where each turned page's band of sheet back ends at its bottom edge, and how far down
      // the page the band reaches. A band taller than the fold runs past the point where the
      // crease leaves the page, so by then its edge belongs at or past the page's own left
      // edge; anything short of that leaves a wedge of bare sheet showing between the pages.
      bands: pages
        .filter((page) => getComputedStyle(page, '::after').opacity === '1')
        .map((page) => {
          const band = getComputedStyle(page, '::after');
          // The second vertex of the band's clip polygon is where its crease meets the band's
          // bottom edge; the browser resolves it to a pixel length in the computed value.
          const crease = band.clipPath.replace(/^polygon\(/, '').split(',')[1];
          return {
            height: Number.parseFloat(band.height),
            crease: Number.parseFloat(crease),
          };
        }),
      // How far each turned page's drawn left edge falls short of the stack's own, at the two
      // ends of that edge: the bottom of the crease that cuts its corner, and the foot of the
      // page. The sheet and the band above it are both cut back by the page's drift, which the
      // band's left inset reports in pixels.
      spill: pages
        .filter((page) => getComputedStyle(page, '::after').opacity === '1')
        .map((page) => {
          const drift = Number.parseFloat(getComputedStyle(page, '::after').left);
          const creaseBottom = place(page, drift, Number.parseFloat(grab.height) - em);
          const foot = place(page, drift, base.height);
          return Math.round((base.left - Math.min(creaseBottom, foot)) * 100) / 100;
        }),
    };
  });
}

type Point = { x: number, y: number };

/**
 * The strip of sheet back the front page paints behind its folded-back corner, and the two
 * creases it should join: the front page's own (`near`), and the same crease on the page
 * furthest out in the pile (`far`). The far crease is read off that page by planting a point at
 * each end of its cut and letting the browser carry it through the page's own translate and
 * rotate, so the strip is checked against where the page really stands, not against the
 * arithmetic the strip itself uses. Everything is in viewport pixels.
 */
async function strip(stack: Locator) {
  return stack.evaluate((el) => {
    const pages = [...el.children] as HTMLElement[];
    const index = (page: HTMLElement) => Number(page.style.getPropertyValue('--page-index'));
    const front = pages.find((page) => index(page) === 1)!;
    const furthest = pages.reduce((a, b) => (index(b) > index(a) ? b : a));
    const own = getComputedStyle(el);
    const foldX = Number.parseFloat(own.getPropertyValue('--fold-back-x'));
    const foldY = Number.parseFloat(own.getPropertyValue('--fold-back-y'));
    const base = front.getBoundingClientRect();

    // The polygon is in the pseudo-element's own box, which the front page places by left/top.
    const back = getComputedStyle(front, '::before');
    const origin = { x: base.left + Number.parseFloat(back.left), y: base.top + Number.parseFloat(back.top) };
    const vertices = back.clipPath
      .replace(/^polygon\(|\)$/g, '')
      .split(',')
      .map((pair) => {
        const [x, y] = pair.trim().split(/\s+/).map(Number.parseFloat);
        return { x: origin.x + x, y: origin.y + y };
      });

    // A turned page's cut stands over by its drift, which its band's left inset reports.
    const drift = Number.parseFloat(getComputedStyle(furthest, '::after').left);
    const carry = (x: number, y: number) => {
      const dot = document.createElement('i');
      dot.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:0;height:0`;
      furthest.append(dot);
      const rect = dot.getBoundingClientRect();
      dot.remove();
      return { x: rect.left, y: rect.top };
    };

    return {
      vertices,
      near: [{ x: base.left + foldX, y: base.top }, { x: base.left, y: base.top + foldY }],
      far: [carry(foldX + drift, 0), carry(drift, foldY)],
      background: back.backgroundColor,
      flap: getComputedStyle(front.querySelector('.paper-fold')!).backgroundColor,
    };
  });
}

const apart = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** How far a point stands off the line through two others. */
const offLine = (p: Point, [a, b]: Point[]) =>
  Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / apart(a, b);

// A phone puts the stack in portrait, which transposes the crease, and a desktop leaves it
// landscape; the fold used to be a fixed em, so the same corner was a twentieth of a desktop
// sheet and a fifth of a phone one. Both widths, and every stack on the page, not just the one
// the screenshots came from.
for (const width of [390, 1440]) {
  test(`every stack keeps the fold a dog-ear and the pile inside its left edge at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.reload();

    const stacks = page.locator('article.technical-drawing-stack');
    const count = await stacks.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i += 1) {
      const stack = stacks.nth(i);
      await stack.scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);

      let turned = 0;
      let first: Awaited<ReturnType<typeof foldAndPile>> | null = null;

      for (const depth of [1, 3, 5]) {
        while (turned < depth) {
          await turn(stack, 'ArrowRight');
          turned += 1;
        }
        const seen = await foldAndPile(stack);
        expect(seen.opacity).toBe('1');
        expect(seen.spill).toHaveLength(depth);

        // The corner cut keeps the size a folded corner has instead of growing with the pile.
        first ??= seen;
        expect(seen.cutWidth).toBeCloseTo(first.cutWidth, 1);
        expect(seen.cutHeight).toBeCloseTo(first.cutHeight, 1);

        // The strip of sheet back behind the cut is a quadrilateral: its near edge lies on the
        // front page's crease (with the hairline of slack that closes the seam), and its far
        // edge sits on the same crease of the page furthest out in the pile, where that page
        // actually stands after its rise, drift and lean. Painted in the paper's own colour,
        // as the fold flap paints the back of the same sheet.
        const back = await strip(stack);
        expect(back.vertices).toHaveLength(4);
        expect(offLine(back.vertices[0], back.near)).toBeLessThan(1.5);
        expect(offLine(back.vertices[3], back.near)).toBeLessThan(1.5);
        expect(apart(back.vertices[1], back.far[0])).toBeLessThan(1);
        expect(apart(back.vertices[2], back.far[1])).toBeLessThan(1);
        expect(back.background).toBe(back.flap);

        // And the cut reaches the same small way along the sheet whatever size the sheet is, so
        // it reads as a dog-ear on a phone as well as on a desktop.
        const reach = Math.max(seen.cutWidth, seen.cutHeight) / seen.sheet;
        expect(reach).toBeGreaterThan(0.05);
        expect(reach).toBeLessThan(0.1);

        // No turned page stands out past the stack's left edge, so below the fold that edge
        // stays a single line instead of fanning into stripes of the pile.
        for (const spill of seen.spill) expect(spill).toBeLessThanOrEqual(0.5);

        // Every band of sheet back runs the crease all the way to the page's left edge, so the
        // pile's corners meet the fold with no bare sheet showing between them.
        for (const band of seen.bands) {
          if (band.height > seen.cutHeight) expect(band.crease).toBeLessThanOrEqual(0);
        }
      }
    }
  });
}
