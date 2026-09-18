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

  const diagonal = Math.hypot(box.width, box.height);
  const totalDeltaX = diagonal * fraction * (forward ? 1 : -1);
  const steps = 8;
  for (let i = 0; i < steps; i += 1) {
    await page.mouse.wheel(totalDeltaX / steps, 0);
    await page.waitForTimeout(40);
  }
  // The gesture only releases once scrolling has fallen quiet (SCROLL_IDLE_MAX = 800ms) and
  // the fold's own rAF-driven easing has caught up with it — under a loaded CPU (several
  // Three.js scenes booting in another worker) that easing gets fewer frames and takes
  // longer to finish, hence the generous margin. (A "wait until --page-index stops
  // changing" polling loop looks more principled but isn't: it can't tell "clamped, never
  // going to change" apart from "hasn't started changing yet", and exits on the wrong one.)
  await page.waitForTimeout(2200);
}

/** Swipes forward until `name` is the front page, or fails after a full lap (wrap-around). */
export async function swipeToPage(page: Page, stack: Locator, name: string, maxPages = 6): Promise<void> {
  for (let i = 0; i < maxPages; i += 1) {
    if ((await frontPageName(stack)) === name) return;
    await swipeStack(page, stack, true);
  }
  throw new Error(`Never reached page "${name}" after ${maxPages} forward swipes`);
}

/**
 * Waits for a `[data-boot-module]` island inside `page` to finish mounting: bootIsland.ts
 * sets `data-mounted="true"` before calling the module's `boot()`, so this alone doesn't
 * guarantee the app rendered — callers should also assert on the app's own content.
 */
export async function waitForIslandMounted(page: Locator, selector = '[data-boot-module]'): Promise<Locator> {
  const island = page.locator(selector).first();
  await expect(island).toHaveAttribute('data-mounted', 'true', { timeout: 15_000 });
  return island;
}
