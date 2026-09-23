import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Each PaperStack page keeps its DOM position; a committed flip only renumbers which
 * wrapper's `--page-index` reads `1` (see PaperStack/fold-drag.ts). So "the front page" is
 * whichever direct child currently carries that custom property, not a fixed DOM index.
 */
export async function frontPageIndex(stack: Locator): Promise<number> {
  const index = await stack.locator(':scope > div').evaluateAll((wrappers) =>
    wrappers.findIndex((w) => getComputedStyle(w).getPropertyValue('--page-index').trim() === '1'),
  );
  if (index < 0) throw new Error('No PaperStack page reports --page-index: 1');
  return index;
}

export function frontPage(stack: Locator, index: number): Locator {
  return stack.locator(':scope > div').nth(index);
}

/** The `<h2>` TechnicalDrawing/Page.astro renders from `title ?? subtitle` — stable per layer. */
export async function frontPageName(stack: Locator): Promise<string> {
  const page = frontPage(stack, await frontPageIndex(stack));
  return (await page.locator('h2.typewriter').first().textContent())?.trim() ?? '';
}

/**
 * Turns the stack one page via a wheel swipe, the same gesture fold-drag.ts's own
 * `stack.addEventListener('wheel', ...)` drives real trackpad/mouse-wheel input through
 * (see BACK_COMMIT_REACH: a swipe has to cover a quarter of the page's diagonal to commit,
 * whichever way it runs). `fraction` is how much of that diagonal this swipe covers, kept to
 * what a trackpad flick actually hands over rather than a sweep no hand would make: a swipe
 * long enough to turn a page one way has to turn it the other way too. `forward` leaves the
 * front page and reveals the next; `!forward` brings the previous one back — clamped at the
 * first page, since there is nothing behind it to bring back.
 */
export async function swipeStack(page: Page, stack: Locator, forward: boolean, fraction = 0.4): Promise<void> {
  const box = await stack.boundingBox();
  if (!box) throw new Error('PaperStack has no layout box to swipe');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);

  // A back swipe with nothing turned has no page to bring back: fold-drag.ts's beginBack
  // declines it without starting a gesture, so no settle is coming.
  const starts = forward || (await stack.evaluate((el) => 'paperFlipped' in (el as HTMLElement).dataset));
  const diagonal = Math.hypot(box.width, box.height);
  const totalDeltaX = diagonal * fraction * (forward ? 1 : -1);
  const steps = 8;
  await settledAfter(stack, async () => {
    for (let i = 0; i < steps; i += 1) {
      await page.mouse.wheel(totalDeltaX / steps, 0);
      await page.waitForTimeout(40);
    }
  }, starts);
}

/** Presses an arrow key on the stack and waits for the turn it starts to land. */
export async function pressTurn(stack: Locator, key: 'ArrowRight' | 'ArrowLeft'): Promise<void> {
  await stack.focus();
  await settledAfter(stack, () => stack.page().keyboard.press(key));
}

declare global {
  interface Window { paperSettles?: WeakMap<Element, number> }
}

/**
 * Runs `act`, then waits for the gesture it started to end. fold-drag.ts sets
 * `data-paper-settled` on the stack when a turn lands or a fold eases back to rest, whichever
 * way the gesture went, and nothing else sets it, so the attribute going on after `act` is the
 * end of the gesture. That holds however long a starved renderer takes over the glide, which a
 * fixed wait had to guess, and it cannot mistake a turn that has not started yet for one that
 * is over, which polling `--page-index` did. After the settle, the stack's own transitions (the
 * pile's 250ms drift, the corner cut's 300ms) and the new front page's dog-ear reveal still have
 * to run out before anything is measured.
 */
export async function settledAfter(stack: Locator, act: () => Promise<void>, starts = true): Promise<void> {
  await stack.evaluate((el) => {
    const settles = (window.paperSettles ??= new WeakMap());
    settles.set(el, 0);
    const observer = new MutationObserver((records) => {
      if (!records.some((record) => record.oldValue === null) || !el.hasAttribute('data-paper-settled')) return;
      settles.set(el, 1);
      observer.disconnect();
    });
    observer.observe(el, { attributes: true, attributeFilter: ['data-paper-settled'], attributeOldValue: true });
  });
  await act();
  if (starts) {
    await expect
      .poll(() => stack.evaluate((el) => window.paperSettles?.get(el) ?? 0), {
        message: 'the stack never settled after the gesture',
        intervals: [100],
        timeout: 15_000,
      })
      .toBe(1);
  }
  await expect
    .poll(() => stack.evaluate((el) => {
      const own = new Set<Element>([el, ...el.children]);
      return el.getAnimations({ subtree: true }).filter((animation) => {
        const target = (animation.effect as KeyframeEffect | null)?.target;
        return !!target && own.has(target) && animation.playState === 'running'
          && Number.isFinite(Number(animation.effect!.getComputedTiming().endTime));
      }).length;
    }), { message: 'the stack\'s transitions never ran out', intervals: [100], timeout: 10_000 })
    .toBe(0);
}

/**
 * Turns forward until `name` is the front page, or fails after a full lap (wrap-around). It
 * turns by arrow key: a spec that calls this wants a page, not a swipe, and a key turn skips
 * the wheel gesture's scroll-idle wait. paper-stack-fold.spec.ts is where the swipe is tested.
 */
export async function turnToPage(stack: Locator, name: string, maxPages = 6): Promise<void> {
  for (let i = 0; i < maxPages; i += 1) {
    if ((await frontPageName(stack)) === name) return;
    await pressTurn(stack, 'ArrowRight');
  }
  throw new Error(`Never reached page "${name}" after ${maxPages} forward turns`);
}

/**
 * Waits for an island inside `page` to finish mounting: pageIsland.ts sets `data-mounted="true"`
 * before calling the component's `boot()`, so this alone doesn't guarantee the app rendered,
 * callers should also assert on the app's own content.
 */
export async function waitForIslandMounted(page: Locator, selector = '[data-mounted]'): Promise<Locator> {
  const island = page.locator(selector).first();
  await expect(island).toHaveAttribute('data-mounted', 'true', { timeout: 15_000 });
  return island;
}

type CountedCanvas = HTMLCanvasElement & { __draws?: number };

/**
 * Counts WebGL draw calls per canvas and reloads so the counter is in place before the
 * demos boot. A Space Builder page can be mounted, `data-ready` and still never draw a
 * frame — only one page of a stack owns the WebGL context at a time — so "the canvas is
 * visible" says nothing about whether the visitor sees a live scene.
 */
export async function armDrawCounter(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext as (
      this: HTMLCanvasElement,
      ...args: unknown[]
    ) => unknown;

    HTMLCanvasElement.prototype.getContext = function counted(this: HTMLCanvasElement, ...args: unknown[]) {
      const context = getContext.apply(this, args) as Record<string, unknown> | null;
      const type = args[0];
      if (!context || typeof type !== 'string' || !type.startsWith('webgl') || context.__counted) {
        return context;
      }
      context.__counted = true;
      const canvas = this as CountedCanvas;
      canvas.__draws = 0;
      ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced'].forEach((name) => {
        const draw = context[name];
        if (typeof draw !== 'function') return;
        context[name] = function drew(this: unknown, ...drawArgs: unknown[]) {
          canvas.__draws = (canvas.__draws ?? 0) + 1;
          return (draw as (...a: unknown[]) => unknown).apply(this, drawArgs);
        };
      });
      return context;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
  });
  await page.reload();
}

/** Draw calls the first canvas under `scope` has made since the page loaded. */
export function sceneDraws(scope: Locator): Promise<number> {
  return scope
    .locator('canvas')
    .first()
    .evaluate((canvas) => (canvas as CountedCanvas).__draws ?? 0);
}
