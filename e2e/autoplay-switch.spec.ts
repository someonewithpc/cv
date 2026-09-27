import { expect, test, type Locator, type Page } from '@playwright/test';

import { LANES, armDrawCounter, demoStack, forEachStackInLane, frontPage, frontPageIndex, pressTurn } from './support/paperStack';

/**
 * `?autoplay=off` is a review switch for measuring: every demo holds as though its page were
 * off screen. "Holds" is read as its page going quiet, no change to the page's DOM and no
 * WebGL draw anywhere for 3s. Booting an island changes the DOM too, so each page gets a few
 * seconds to mount and fall still, which a playing walkthrough never does.
 */

declare global {
  interface Window { switchChanges?: number; switchWatch?: MutationObserver }
}

async function open(page: Page, query = '/?autoplay=off') {
  await page.goto(query);
  await armDrawCounter(page);
}

function draws(page: Page) {
  return page.evaluate(() => [...document.querySelectorAll('canvas')]
    .reduce((sum, canvas) => sum + ((canvas as HTMLCanvasElement & { __draws?: number }).__draws ?? 0), 0));
}

/** Changes inside the front page's sheet, leaving out the sheet's own attributes and live regions. */
async function watch(section: Locator) {
  await section.evaluate((el) => {
    window.switchWatch?.disconnect();
    window.switchChanges = 0;
    window.switchWatch = new MutationObserver((records) => {
      window.switchChanges! += records.filter((record) => {
        const target = record.target instanceof Element ? record.target : record.target.parentElement;
        return record.target !== el && !target?.closest('[aria-live]');
      }).length;
    });
    window.switchWatch.observe(el, { subtree: true, childList: true, attributes: true, characterData: true });
  });
}

async function quietFor(page: Page, ms: number) {
  await page.evaluate(() => { window.switchChanges = 0; });
  const before = await draws(page);
  await page.waitForTimeout(ms);
  return (await page.evaluate(() => window.switchChanges ?? 0)) === 0 && (await draws(page)) === before;
}

async function expectQuiet(page: Page, stack: Locator, why: string) {
  await watch(frontPage(stack, await frontPageIndex(stack)).locator(':scope > section'));
  await expect.poll(() => quietFor(page, 3000), { message: why, intervals: [0], timeout: 20_000 }).toBe(true);
}

test('without the switch the Marker Editor keeps changing, so the check can see a demo play', async ({ page }) => {
  await open(page, '/');
  const stack = demoStack(page, 'Interactive Map Marker Editor');
  await stack.scrollIntoViewIfNeeded();
  await page.waitForTimeout(3000);
  await watch(frontPage(stack, await frontPageIndex(stack)).locator(':scope > section'));
  expect(await quietFor(page, 3000)).toBe(false);
});

for (let lane = 0; lane < LANES; lane += 1) {
  test(`?autoplay=off leaves every page of every stack still (lane ${lane + 1})`, async ({ page }) => {
    await forEachStackInLane(page, lane, (tab) => open(tab), async (tab, stack) => {
      await stack.scrollIntoViewIfNeeded();
      const pages = await stack.locator(':scope > div').count();
      for (let turn = 0; turn < pages; turn += 1) {
        if (turn > 0) await pressTurn(stack, 'ArrowRight');
        await expectQuiet(tab, stack, `page ${turn + 1} kept changing with autoplay off`);
      }
    });
  });
}
