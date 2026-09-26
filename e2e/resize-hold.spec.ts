import { expect, test, type Locator, type Page } from '@playwright/test';

import { frontPage, frontPageIndex } from './support/paperStack';

/**
 * While the window is being resized the demos hold still (src/client/resizeHold.ts): the
 * walkthroughs stop between steps and the dog-ear pulse stops where it is, so every frame of
 * the resize goes to the layout. Once the size settles they carry on from where they were.
 *
 * A walkthrough's progress is read off the sheet itself: the classes, text and elements its
 * steps change. Style is left out, since a 3D scene restyles its labels every frame it draws
 * whether or not its walkthrough is moving.
 */
const PROGRESS = ['class', 'aria-pressed', 'aria-selected', 'aria-expanded', 'value', 'open', 'hidden', 'data-state'];

/** Rocks the window by a few pixels every 100 ms for `ms`. */
async function keepResizing(page: Page, ms: number): Promise<void> {
  const start = Date.now();
  let narrow = false;
  while (Date.now() - start < ms) {
    narrow = !narrow;
    await page.setViewportSize({ width: narrow ? 1396 : 1400, height: 900 });
    await page.waitForTimeout(100);
  }
}

async function playingDeck(stack: Locator): Promise<Locator | null> {
  await stack.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const deck = frontPage(stack, await frontPageIndex(stack)).locator('[data-demo-transport]');
  const playing = await expect(deck).toHaveAttribute('data-state', 'playing', { timeout: 15_000 })
    .then(() => true, () => false);
  return playing ? deck : null;
}

/** Starts counting the walkthrough's changes on the stack's front page, deck left out. */
function countProgress(stack: Locator): Promise<void> {
  return stack.evaluate((el, filter) => {
    const w = window as Window & { __progress?: number; __progressObserver?: MutationObserver };
    w.__progressObserver?.disconnect();
    w.__progress = 0;
    const onDeck = (node: Node) => (node instanceof Element ? node : node.parentElement)
      ?.closest('[data-demo-transport]') != null;
    w.__progressObserver = new MutationObserver((records) => {
      w.__progress! += records.filter((record) => !onDeck(record.target)).length;
    });
    w.__progressObserver.observe(el.querySelector('.paper-front')!, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: filter,
    });
  }, PROGRESS);
}

const progress = (page: Page) => page.evaluate(() => (window as Window & { __progress?: number }).__progress ?? 0);
const resetProgress = (page: Page) => page.evaluate(() => { (window as Window & { __progress?: number }).__progress = 0; });

function pulseState(stack: Locator): Promise<string | undefined> {
  return stack.evaluate((el) => el.querySelector('.paper-front')?.getAnimations()
    .find((animation) => (animation as CSSAnimation).animationName === 'fold-reveal-pulse')?.playState);
}

test('a resize holds every playing demo still, and each carries on once it settles', async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/');

  const stacks = page.locator('article.technical-drawing-stack');
  let checked = 0;
  for (let i = 0; i < await stacks.count(); i += 1) {
    const stack = stacks.nth(i);
    const deck = await playingDeck(stack);
    if (!deck) continue;
    const label = await stack.getAttribute('aria-label');
    await page.waitForTimeout(1500);
    await countProgress(stack);

    // A step already under way may finish; after that nothing moves.
    const holding = keepResizing(page, 3000);
    await page.waitForTimeout(1200);
    await expect(page.locator(':root')).toHaveAttribute('data-resizing', '');
    expect(await pulseState(stack), label!).toBe('paused');
    await resetProgress(page);
    await holding;
    expect(await progress(page), `${label} moved during the resize`).toBe(0);

    await expect(page.locator(':root')).not.toHaveAttribute('data-resizing', '');
    await expect.poll(() => progress(page), { message: `${label} carries on`, timeout: 10_000 }).toBeGreaterThan(0);
    await expect(deck).toHaveAttribute('data-state', 'playing');
    expect(await pulseState(stack), label!).toBe('running');
    checked += 1;
  }
  expect(checked).toBeGreaterThan(0);
});

test('a demo paused from the deck stays paused through a resize', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/');

  const stacks = page.locator('article.technical-drawing-stack');
  let deck: Locator | null = null;
  for (let i = 0; i < await stacks.count() && !deck; i += 1) deck = await playingDeck(stacks.nth(i));
  expect(deck).not.toBeNull();

  await deck!.locator('[data-demo-key="pause"]').click();
  await expect(deck!).toHaveAttribute('data-state', 'user');

  await keepResizing(page, 1500);
  await expect(page.locator(':root')).not.toHaveAttribute('data-resizing', '');
  await page.waitForTimeout(1500);
  await expect(deck!).toHaveAttribute('data-state', 'user');
});
