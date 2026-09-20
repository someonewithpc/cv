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

    // The polygon runs near-top, far-top, three bow points, far-left, near-left, three bow
    // points (see .paper-front::before), so the corners are the first, second, sixth and
    // seventh vertices, and the middle bow point of each long edge is the fourth and ninth.
    return {
      vertices,
      corners: [vertices[0], vertices[1], vertices[5], vertices[6]],
      bows: [vertices[3], vertices[8]],
      near: [{ x: base.left + foldX, y: base.top }, { x: base.left, y: base.top + foldY }],
      far: [carry(foldX + drift, 0), carry(drift, foldY)],
      background: back.backgroundColor,
      shading: back.backgroundImage,
      // The stack's one flap, wherever a gesture has it at the moment.
      flap: getComputedStyle(el.querySelector('.paper-fold')!).backgroundColor,
      flapShading: getComputedStyle(el.querySelector('.paper-fold')!).backgroundImage,
    };
  });
}

const apart = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** How far a point stands off the line through two others, signed: positive is to the right of a to b. */
const sideOf = (p: Point, [a, b]: Point[]) =>
  ((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / apart(a, b);

/** How far a point stands off the line through two others. */
const offLine = (p: Point, line: Point[]) => Math.abs(sideOf(p, line));

type Frame = {
  t: number,
  forward: boolean,
  near: Point[],
  vertices: Point[],
  // The crease ends of the page on its way to or from the pile, and of the page that stands
  // furthest out in the pile besides it (null when the pile is otherwise empty).
  moving: Point[],
  furthest: Point[] | null,
};

declare global {
  interface Window { turnWatch?: Promise<Frame[]> }
}

/**
 * Watches a turn from inside the page: from the moment the front page changes hands, one sample
 * per animation frame of the strip's vertices, the front crease, and the crease ends of the
 * page that is moving and of the pile's other furthest page, until the pile's clocks have run.
 * The crease ends are read the way `strip()` reads them, off markers the page carries. Set up
 * before the gesture and collected after it with `watchedTurn()`, so the sampler is in place
 * whatever order the driver's calls land in.
 */
async function watchTurn(stack: Locator, ms = 320): Promise<void> {
  await stack.evaluate((el, ms) => { window.turnWatch = new Promise<Frame[]>((resolve, reject) => {
    const pages = [...el.children] as HTMLElement[];
    const index = (page: HTMLElement) => Number(page.style.getPropertyValue('--page-index'));
    const frontPage = () => pages.find((page) => index(page) === 1)!;
    const started = frontPage();
    const startedTurned = Number(getComputedStyle(el).getPropertyValue('--pages-turned'));
    const carry = (page: HTMLElement, x: number, y: number) => {
      const dot = document.createElement('i');
      dot.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:0;height:0`;
      page.append(dot);
      const rect = dot.getBoundingClientRect();
      dot.remove();
      return { x: rect.left, y: rect.top };
    };
    // A page of the pile cuts its corner over by its drift; the front page cuts it at its edge.
    const creaseOf = (page: HTMLElement, foldX: number, foldY: number) => {
      const drift = page.classList.contains('paper-front')
        ? 0
        : Number.parseFloat(getComputedStyle(page, '::after').left) || 0;
      return [carry(page, foldX + drift, 0), carry(page, drift, foldY)];
    };
    const frames: Frame[] = [];
    let since: number | null = null;
    const deadline = performance.now() + 10_000;
    const tick = () => {
      const front = frontPage();
      const now = performance.now();
      if (since === null && front !== started) since = now;
      if (since !== null) {
        const own = getComputedStyle(el);
        const foldX = Number.parseFloat(own.getPropertyValue('--fold-back-x'));
        const foldY = Number.parseFloat(own.getPropertyValue('--fold-back-y'));
        const turned = Number(own.getPropertyValue('--pages-turned'));
        const base = front.getBoundingClientRect();
        const back = getComputedStyle(front, '::before');
        const origin = { x: base.left + Number.parseFloat(back.left), y: base.top + Number.parseFloat(back.top) };
        const vertices = back.clipPath
          .replace(/^polygon\(|\)$/g, '')
          .split(',')
          .map((pair) => {
            const [x, y] = pair.trim().split(/\s+/).map(Number.parseFloat);
            return { x: origin.x + x, y: origin.y + y };
          });
        // Forward, the page that was in front is on its way to the back of the pile and the
        // pile's other furthest page is the one before it; coming back, the promoted page is the
        // front page itself and the pile's furthest is whoever stands at the back now.
        const forward = turned > startedTurned;
        const moving = forward ? started : front;
        const rest = pages.filter((page) => page !== moving && index(page) > 1);
        const furthest = rest.reduce((a, b) => (index(b) > index(a) ? b : a));
        const inPile = forward ? turned > 1 : turned > 0;
        frames.push({
          t: now - since,
          forward,
          near: [{ x: base.left + foldX, y: base.top }, { x: base.left, y: base.top + foldY }],
          // The four corners of the bowed polygon (see strip()).
          vertices: [vertices[0], vertices[1], vertices[5], vertices[6]],
          moving: creaseOf(moving, foldX, foldY),
          furthest: inPile ? creaseOf(furthest, foldX, foldY) : null,
        });
        // The pile's clocks have run, and a starved renderer has still handed over enough
        // frames to say something about the turn.
        if (now - since > ms && frames.length >= 8) {
          resolve(frames);
          return;
        }
      } else if (now > deadline) {
        reject(new Error(`the stack never turned a page: pages ${pages.map(index).join(',')}, flaps ${[...el.querySelectorAll('.paper-fold')].map((flap) => flap.className).join(' | ')}, fold ${started.style.getPropertyValue('--fold-x')}`));
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }); }, ms);
}

const watchedTurn = (stack: Locator): Promise<Frame[]> => stack.evaluate(() => window.turnWatch!);

/**
 * Takes the front page's flap and pulls it most of the way to the far corner, ready to let go:
 * the flip then glides out and lands on its own clocks rather than a click's.
 */
async function pullFlap(stack: Locator) {
  const page = stack.page();
  // The dog-ear draws itself in after the page loads; a flap still on its way in is too small
  // to take hold of.
  await expect.poll(async () => (await stack.locator('.paper-fold').boundingBox())?.width ?? 0).toBeGreaterThan(20);
  const box = await stack.boundingBox();
  if (!box) throw new Error('no stack to drag on');
  // The idle flap is the upper-left triangle of its box, so its centre lies on the crease
  // itself, and the title block underneath reaches out from under the rest of it: take hold at
  // the first point along the flap's own diagonal that the browser hands to the flap.
  // The dog-ear also pulses, so the point is only good while the pointer resting on the flap
  // holds the pulse still (see index.astro); a point the pulse has moved away from is retaken.
  const onFlap = (x: number, y: number) => stack.evaluate(
    (el, at) => document.elementFromPoint(at.x, at.y) === el.querySelector('.paper-fold'),
    { x, y },
  );
  let from: Point | null = null;
  for (let attempt = 0; attempt < 8 && !from; attempt += 1) {
    const point = await stack.evaluate((el) => {
      const flap = el.querySelector<HTMLElement>('.paper-fold')!;
      const rect = flap.getBoundingClientRect();
      for (const k of [0.48, 0.45, 0.4, 0.35, 0.3, 0.25, 0.2, 0.15]) {
        const at = { x: rect.left + rect.width * k, y: rect.top + rect.height * k };
        if (document.elementFromPoint(at.x, at.y) === flap) return at;
      }
      return null;
    });
    if (!point) continue;
    await page.mouse.move(point.x, point.y);
    await page.waitForTimeout(150);
    if (await onFlap(point.x, point.y)) from = point;
  }
  if (!from) throw new Error('no point on the flap takes the pointer');
  const to = { x: box.x + box.width * 0.2, y: box.y + box.height * 0.2 };
  await page.mouse.down();
  for (let i = 1; i <= 12; i += 1) {
    await page.mouse.move(from.x + (to.x - from.x) * i / 12, from.y + (to.y - from.y) * i / 12);
    await page.waitForTimeout(30);
  }
  // The fold eases after the pointer, slowly on a starved renderer, and a release before it has
  // caught up is judged on where the fold stands, not where the hand is.
  let last = '';
  await expect.poll(async () => {
    const size = await stack.evaluate((el) => el.querySelector<HTMLElement>('.paper-fold')!.parentElement!.style.getPropertyValue('--fold-x'));
    const settled = size === last;
    last = size;
    return settled;
  }, { intervals: [120], timeout: 5000 }).toBe(true);
}

/**
 * The strip through a turn: its near vertices stay on the front crease, and its far vertices
 * sit on whichever crease stands further out, the moving page's or the pile's other furthest
 * page's, at every frame. Anything else leaves page background beside the strip.
 */
function expectStripToFollow(frames: Frame[], label: string) {
  expect(frames.length, `${label}: frames sampled`).toBeGreaterThanOrEqual(8);
  for (const frame of frames) {
    const at = `${label} at ${frame.t.toFixed(0)}ms`;
    expect(frame.vertices, at).toHaveLength(4);
    expect(offLine(frame.vertices[0], frame.near), at).toBeLessThan(1.5);
    expect(offLine(frame.vertices[3], frame.near), at).toBeLessThan(1.5);
    // A page coming back carries the strip on its own crease, and until it has dropped below
    // the pile's furthest page there is no pile above that crease for the strip to reach.
    if (!frame.forward && frame.furthest && frame.near[0].y < frame.furthest[0].y - 0.5) continue;
    for (const end of [0, 1]) {
      const candidates = frame.forward ? [frame.moving[end]] : [];
      if (frame.furthest) candidates.push(frame.furthest[end]);
      // Further out is up: the smaller y.
      const outer = candidates.reduce((a, b) => (b.y < a.y ? b : a));
      expect(apart(frame.vertices[1 + end], outer), at).toBeLessThan(1);
    }
  }
}

test.describe('the strip through a turn', () => {
  // One turn at a time: two of these side by side starve each other of the frames the sampler
  // needs, on a machine that draws the demos' scenes in software.
  test.describe.configure({ mode: 'serial' });

  for (const width of [390, 1440]) {
    test(`the strip stays on the moving page's crease through a turn at ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.reload();
      // Only the first stack is watched, and the other two demos' scenes, drawn in software
      // here, would take most of the frames the turn has to be sampled in.
      await page.evaluate(() => {
        document.querySelectorAll('article.technical-drawing-stack').forEach((stack, i) => {
          if (i > 0) (stack as HTMLElement).style.display = 'none';
        });
      });
      const stack = page.locator('article.technical-drawing-stack').first();
      await stack.scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);

      // Two pages turned by hand: the first climbs out of an empty pile, the second has to pass
      // the first on its way up, which is where the strip used to stand proud of the pile.
      for (const turn of [1, 2]) {
        await pullFlap(stack);
        await watchTurn(stack);
        await page.mouse.up();
        expectStripToFollow(await watchedTurn(stack), `${width} forward turn ${turn}`);
        // Wait for the flip to land: the stand-in flap gives way to the real one.
        await expect.poll(() => stack.locator('.paper-fold').count(), { timeout: 15_000 }).toBe(1);
        await page.waitForTimeout(500);
      }
      expect(await pile(stack)).toMatchObject({ turned: '2' });

      // The hindmost page pulled part of the way over the clip and held there: the paper it lays
      // down stops at the stack's left edge and its crease is where the strip ends.
      const grab = await stack.locator('.paper-back-grab').boundingBox();
      const box = await stack.boundingBox();
      if (!grab || !box) throw new Error('no folded corner to grab');
      const along = Math.hypot(box.width, box.height);
      const start = { x: grab.x + grab.width * 0.4, y: grab.y + grab.height * 0.4 };
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      for (const step of [2, 4, 6]) {
        await page.mouse.move(start.x + box.width * step / along, start.y + box.height * step / along);
        await page.waitForTimeout(40);
      }
      await page.waitForTimeout(400);
      const held = await strip(stack);
      expect(offLine(held.corners[0], held.near)).toBeLessThan(1.5);
      expect(offLine(held.corners[3], held.near)).toBeLessThan(1.5);
      expect(apart(held.corners[1], held.far[0])).toBeLessThan(1);
      expect(apart(held.corners[2], held.far[1])).toBeLessThan(1);
      await page.mouse.up();
      await page.waitForTimeout(1000);

      // And a page coming back down from the pile carries the strip with it, so the strip's far
      // edge has to stay on the page left standing furthest out.
      await watchTurn(stack);
      await stack.focus();
      await page.keyboard.press('ArrowLeft');
      expectStripToFollow(await watchedTurn(stack), `${width} back turn`);
    });
  }
});

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
      // A stack with fewer pages than the deepest pile cycles back to its front page before
      // the pile gets that deep, so only piles the stack can hold are checked.
      const pages = await stack.evaluate((el) => el.childElementCount);

      for (const depth of [1, 3, 5]) {
        if (depth >= pages) break;
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
        expect(back.vertices).toHaveLength(10);
        expect(offLine(back.corners[0], back.near)).toBeLessThan(1.5);
        expect(offLine(back.corners[3], back.near)).toBeLessThan(1.5);
        expect(apart(back.corners[1], back.far[0])).toBeLessThan(1);
        expect(apart(back.corners[2], back.far[1])).toBeLessThan(1);
        expect(back.background).toBe(back.flap);

        // The strip is a bend, not a flat trapezium: its long edges bow outward between the
        // corners, by a share of its width, and it is shaded across its width, as the flap is
        // along its own, so a flat fill cannot come back unnoticed.
        const width = offLine(back.corners[1], back.near);
        const farBow = sideOf(back.bows[0], [back.corners[1], back.corners[2]]);
        const nearBow = sideOf(back.bows[1], [back.corners[0], back.corners[3]]);
        expect(Math.sign(farBow)).toBe(-Math.sign(nearBow));
        expect(Math.abs(farBow)).toBeGreaterThan(width * 0.2);
        expect(Math.abs(farBow)).toBeLessThan(width * 0.5);
        expect(back.shading).toMatch(/^linear-gradient\(/);
        expect(back.flapShading).toMatch(/^linear-gradient\(/);

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
