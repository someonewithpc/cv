import { expect, test, type Locator, type Page } from '@playwright/test';

import { LANES, forEachStackInLane, frontPage, frontPageIndex, pressTurn } from './support/paperStack';

/**
 * A demo only works while a visitor can see it: its stack on screen, its page the front one,
 * and the tab showing. Anywhere else its walkthrough holds where it stands, and carries on
 * from there when it is back. "Works" is read as the demo changing its own DOM, which every
 * walkthrough does on every step, so the checks hold for any demo that reports one.
 */

declare global {
  interface Window {
    demoChanges?: WeakMap<Element, number>;
    setTabHidden?: (hidden: boolean) => void;
  }
}

async function open(page: Page) {
  // A headless tab is never hidden, so the tab's visibility is faked for the page's scripts.
  await page.addInitScript(() => {
    let hidden = false;
    Object.defineProperty(Document.prototype, 'visibilityState', { configurable: true, get: () => (hidden ? 'hidden' : 'visible') });
    Object.defineProperty(Document.prototype, 'hidden', { configurable: true, get: () => hidden });
    window.setTabHidden = (next) => {
      hidden = next;
      document.dispatchEvent(new Event('visibilitychange'));
    };
  });
  await page.goto('/');
}

function pageSection(stack: Locator, index: number): Locator {
  return frontPage(stack, index).locator(':scope > section');
}

/**
 * Counts changes the demo makes inside `section`, leaving out the section's own attributes and
 * the live regions: a toast shown as the page came back leaves on its own timer, once. The
 * Marker Editor mounts its toast region with the toast and drops it after, so a record that
 * only adds or removes a live region is left out too.
 */
async function countChanges(section: Locator) {
  await section.evaluate((el) => {
    const changes = (window.demoChanges ??= new WeakMap());
    changes.set(el, 0);
    new MutationObserver((records) => {
      const own = records.filter((record) => {
        const target = record.target instanceof Element ? record.target : record.target.parentElement;
        const nodes = [...record.addedNodes, ...record.removedNodes];
        const liveRegionOnly = nodes.length > 0
          && nodes.every((node) => node instanceof Element && node.matches('[aria-live]'));
        return record.target !== el && !liveRegionOnly && !target?.closest('[aria-live]');
      }).length;
      changes.set(el, (changes.get(el) ?? 0) + own);
    }).observe(el, { subtree: true, childList: true, attributes: true, characterData: true });
  });
}

const changes = (section: Locator) => section.evaluate((el) => window.demoChanges?.get(el) ?? 0);
const resetChanges = (section: Locator) => section.evaluate((el) => window.demoChanges?.set(el, 0));

/** The walkthrough on this page, once it reports that it is playing; null for a page without one. */
async function playingWalkthrough(section: Locator): Promise<Locator | null> {
  const root = section.locator('[data-autoplay-state]').first();
  try {
    await expect(root).toHaveAttribute('data-autoplay-state', 'playing', { timeout: 15_000 });
  } catch {
    return null;
  }
  return root;
}

async function expectBusy(section: Locator, why: string) {
  await resetChanges(section);
  await expect.poll(() => changes(section), { message: why, timeout: 15_000 }).toBeGreaterThan(0);
}

/** A step already under way may land after the demo is told to hold; the next one may not. */
async function expectStill(page: Page, section: Locator, why: string) {
  await page.waitForTimeout(2000);
  await resetChanges(section);
  await page.waitForTimeout(3000);
  expect(await changes(section), why).toBe(0);
}

/** Whichever end of the document is farther from the stack. */
async function scrollAway(page: Page, stack: Locator) {
  await stack.evaluate((el) => {
    const top = el.getBoundingClientRect().top + window.scrollY;
    const end = document.documentElement.scrollHeight;
    window.scrollTo({ top: top > end / 2 ? 0 : end, behavior: 'instant' });
  });
}

for (let lane = 0; lane < LANES; lane += 1) {
  test(`a walkthrough holds off screen and in a hidden tab, and carries on when back (lane ${lane + 1})`, async ({ page }) => {
    await forEachStackInLane(page, lane, open, async (tab, stack) => {
      await stack.scrollIntoViewIfNeeded();
      const section = pageSection(stack, await frontPageIndex(stack));
      const walkthrough = await playingWalkthrough(section);
      if (!walkthrough) return;

      await countChanges(section);
      await expectBusy(section, 'the walkthrough does nothing on screen');

      await scrollAway(tab, stack);
      await expectStill(tab, section, 'the walkthrough kept going off screen');

      await stack.scrollIntoViewIfNeeded();
      await expectBusy(section, 'the walkthrough never came back on screen');
      await expect(walkthrough).toHaveAttribute('data-autoplay-state', 'playing');

      await tab.evaluate(() => window.setTabHidden?.(true));
      await expectStill(tab, section, 'the walkthrough kept going in a hidden tab');
      await tab.evaluate(() => window.setTabHidden?.(false));
      await expectBusy(section, 'the walkthrough never came back with the tab');
    });
  });

  test(`a walkthrough on a page turned away from holds still (lane ${lane + 1})`, async ({ page }) => {
    await forEachStackInLane(page, lane, open, async (tab, stack) => {
      await stack.scrollIntoViewIfNeeded();
      const pages = await stack.locator(':scope > div').count();
      if (pages < 2) return;

      // The second page boots once it is turned to; then the first comes back over it.
      await pressTurn(stack, 'ArrowRight');
      const index = await frontPageIndex(stack);
      const section = pageSection(stack, index);
      if (!(await playingWalkthrough(section))) return;

      await countChanges(section);
      await expectBusy(section, 'the walkthrough does nothing on the front page');

      await pressTurn(stack, 'ArrowLeft');
      expect(await frontPageIndex(stack)).not.toBe(index);
      await expectStill(tab, section, 'the walkthrough kept going under the front page');
    });
  });
}
