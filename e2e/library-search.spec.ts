import { expect, test, type Locator, type Page } from '@playwright/test';

import { frontPage, frontPageIndex, frontPageName, swipeStack, waitForIslandMounted } from './support/paperStack';

const PAGES = ['Library Search & Relevance', 'Relevance Scoring', 'Filters', 'Generated SQL'];

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

function librarySearchStack(page: Page) {
  // By title, not by position: the demos run gains stacks over time.
  return page.locator('article.technical-drawing-stack').filter({
    has: page.locator('h2.typewriter', { hasText: 'Library Search & Relevance' }),
  });
}

async function mountedTool(page: Page) {
  const stack = librarySearchStack(page);
  await stack.scrollIntoViewIfNeeded();
  const front = frontPage(stack, await frontPageIndex(stack));
  await waitForIslandMounted(front, '[data-library-search="search"]');

  const tool = front.locator('.library-search[data-live]');
  // Hovering is how a visitor takes the tool over from the walkthrough; without it the
  // field keeps typing on its own under the test.
  await tool.hover();
  await expect(tool).toHaveAttribute('data-autoplay', 'user');
  return { stack, front, tool };
}

/** The scores of the rows on show, top to bottom. */
function shownScores(tool: Locator) {
  return tool.locator('.hit:not([hidden]) .value').evaluateAll((values) => values.map((value) => Number(value.textContent)));
}

/** Turns to `name` with the arrow key, which commits on the spot where a swipe has to be
    eased in (paper-turn-keyboard.spec.ts), so a loaded machine cannot leave it short. */
async function turnTo(page: Page, stack: Locator, name: string) {
  for (let i = 0; i < PAGES.length && (await frontPageName(stack)) !== name; i += 1) {
    const before = await frontPageName(stack);
    await stack.focus();
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => frontPageName(stack), { timeout: 10_000 }).not.toBe(before);
  }
  expect(await frontPageName(stack)).toBe(name);
}

async function search(tool: Locator, query: string) {
  const input = tool.locator('.query-input');
  await input.fill(query);
  await expect(tool.locator('.requests .key')).toHaveText(`?query=${encodeURIComponent(query).replace(/%20/g, '+')}`);
  await expect(tool).not.toHaveAttribute('data-loading', 'true');
}

test('library search: forward swipes visit every page in order, then wrap', async ({ page }) => {
  const stack = librarySearchStack(page);
  await stack.scrollIntoViewIfNeeded();
  // The front sheet's script has run once its island is up, and the stack sits in view.
  await waitForIslandMounted(frontPage(stack, await frontPageIndex(stack)), '[data-library-search="search"]');
  await expect(stack).toBeInViewport();

  expect(await stack.locator(':scope > div').count()).toBe(PAGES.length);
  expect(await frontPageName(stack)).toBe(PAGES[0]);

  for (let i = 1; i < PAGES.length; i += 1) {
    await swipeStack(page, stack, true);
    expect(await frontPageName(stack), `page ${i} after ${i} forward swipe(s)`).toBe(PAGES[i]);
  }

  await swipeStack(page, stack, true);
  expect(await frontPageName(stack)).toBe(PAGES[0]);
});

test('main page: the walkthrough types on its own and hands over on hover', async ({ page }) => {
  const stack = librarySearchStack(page);
  await stack.scrollIntoViewIfNeeded();
  const front = frontPage(stack, await frontPageIndex(stack));
  await waitForIslandMounted(front, '[data-library-search="search"]');

  const tool = front.locator('.library-search[data-live]');
  const input = tool.locator('.query-input');
  await expect(tool).toHaveAttribute('data-autoplay', 'playing');
  // It clears the opening query and starts typing its own.
  await expect(input).not.toHaveValue('rectangular 8 seats', { timeout: 10_000 });
  await expect(tool.locator('[data-tally="sent"]')).not.toHaveText('0', { timeout: 10_000 });

  await tool.hover();
  await expect(tool).toHaveAttribute('data-autoplay', 'user');
  // A query of the visitor's own goes out and comes back, and the script adds nothing to it
  // in the meantime.
  await search(tool, 'wood chair');
  await expect(input).toHaveValue('wood chair');
  await expect(tool.locator('.hit:not([hidden]) .name').first()).toHaveText('Chiavari Chair');
  await expect(tool).toHaveAttribute('data-autoplay', 'user');
});

test('main page: the sheet shows the transport deck, and its keys drive the walkthrough', async ({ page }) => {
  const stack = librarySearchStack(page);
  await stack.scrollIntoViewIfNeeded();
  const front = frontPage(stack, await frontPageIndex(stack));
  await waitForIslandMounted(front, '[data-library-search="search"]');

  const tool = front.locator('.library-search[data-live]');
  const input = tool.locator('.query-input');
  const sent = tool.locator('[data-tally="sent"]');
  const deck = front.locator('[data-demo-transport]');
  const play = deck.locator('[data-demo-key="play"]');
  const pause = deck.locator('[data-demo-key="pause"]');
  const reset = deck.locator('[data-demo-key="reset"]');

  await expect(tool).toHaveAttribute('data-autoplay', 'playing');
  await expect(deck).toBeVisible();
  await expect(deck).toHaveAttribute('data-state', 'playing');
  await expect(deck.locator('[data-demo-caption]')).toHaveText('AUTO PLAYING');
  await expect(play).toHaveAttribute('aria-pressed', 'true');

  // Moving over the tool takes over, and the deck says so.
  await tool.hover();
  await expect(tool).toHaveAttribute('data-autoplay', 'user');
  await expect(deck).toHaveAttribute('data-state', 'user');
  await expect(pause).toHaveAttribute('aria-pressed', 'true');

  // Play hands back: the script starts over from the opening query and sends again.
  const before = await sent.textContent();
  await play.click();
  await expect(tool).toHaveAttribute('data-autoplay', 'playing');
  await expect(deck).toHaveAttribute('data-state', 'playing');
  await expect(sent).not.toHaveText(before!, { timeout: 10_000 });

  // Pause holds: a query typed after it goes out and comes back as typed.
  await pause.click();
  await expect(tool).toHaveAttribute('data-autoplay', 'user');
  await expect(deck).toHaveAttribute('data-state', 'user');
  await search(tool, 'wood chair');
  await tool.locator('.filter-select[data-filter="category"]').selectOption('Banquet');
  await expect(input).toHaveValue('wood chair');
  await expect(tool).toHaveAttribute('data-autoplay', 'user');

  // Reset starts the walkthrough over from the query and filters the page opens on.
  await reset.click();
  await expect(deck).toHaveAttribute('data-state', 'playing');
  await expect(tool).toHaveAttribute('data-autoplay', 'playing');
  await expect(tool.locator('.filter-select[data-filter="category"]')).toHaveValue('');
  await expect(input).not.toHaveValue('wood chair');
});


test('main page: a bare number is quoted, and a seats after it folds into the phrase', async ({ page }) => {
  const { tool } = await mountedTool(page);
  const mangled = tool.locator('.mangled');

  await search(tool, 'rectangular 8');
  await expect(mangled).toHaveText('rectangular "8"');
  await expect(mangled.locator('.rule-quoted')).toHaveText('"8"');

  await search(tool, 'rectangular 8 seats');
  await expect(mangled).toHaveText('rectangular "8 seats"');
  await expect(mangled.locator('.rule-folded')).toHaveText('"8 seats"');

  // Quoted, 8 is the token 8 alone: the 8 pax tables and the 8ft ones, never the 182 wide.
  await search(tool, '8');
  await expect(tool.locator('.hit:not([hidden])')).toHaveCount(9);
  const names = await tool.locator('.hit:not([hidden]) .name').allTextContents();
  expect(names).not.toContain('Bar');
  expect(names.filter((name) => name === 'Banquet Table')).toHaveLength(3);
});

test('main page: the rows come back ranked, normalised to the top hit', async ({ page }) => {
  const { tool } = await mountedTool(page);

  await search(tool, 'rectangular 8 seats');
  await expect(tool.locator('.hit:not([hidden]) .name').first()).toHaveText('Banquet Table');
  const scores = await shownScores(tool);
  expect(scores[0]).toBe(1);
  expect(scores).toEqual([...scores].sort((a, b) => b - a));
  await expect(tool.locator('.count')).toHaveText(`${scores.length} of 19 objects`);

  // The category narrows the relation the maximum is taken over, so the best row it
  // leaves climbs to 1.00.
  await tool.locator('.filter-select[data-filter="category"]').selectOption('Catering');
  await expect(tool.locator('.hit:not([hidden])')).toHaveCount(1);
  await expect(tool.locator('.hit:not([hidden]) .name').first()).toHaveText('Buffet Table');
  await expect(tool.locator('.hit:not([hidden]) .value').first()).toHaveText('1.00');
});

test('main page: a property filter narrows the rows but keeps the maximum', async ({ page }) => {
  const { tool } = await mountedTool(page);

  // The rarer word weighs more, so the chairs rise over the tables that only list one.
  await search(tool, 'wood chair');
  await expect(tool.locator('.hit:not([hidden]) .name').first()).toHaveText('Chiavari Chair');

  // The 8 seat tables set the maximum, and the gold chair keeps its small share of it.
  await search(tool, 'chiavari 8 seats');
  await tool.locator('.filter-select[data-filter="color"]').selectOption('Gold');
  await expect(tool.locator('.hit:not([hidden])')).toHaveCount(1);
  await expect(tool.locator('.hit:not([hidden]) .name').first()).toHaveText('Chiavari Chair');
  expect((await shownScores(tool))[0]).toBeLessThan(1);
});

test('main page: a query already on screen is dropped rather than sent again', async ({ page }) => {
  const { tool } = await mountedTool(page);
  const sent = tool.locator('[data-tally="sent"]');
  const dropped = tool.locator('[data-tally="dropped"]');

  await search(tool, 'table');
  const before = { sent: Number(await sent.textContent()), dropped: Number(await dropped.textContent()) };

  // The same serialised form again: identical to what is showing, so it never goes out.
  await tool.locator('.query-input').dispatchEvent('input');
  await expect(dropped).toHaveText(String(before.dropped + 1));
  await expect(sent).toHaveText(String(before.sent));
});

test('generated SQL page: all three copies of the fragment follow the query and the filters', async ({ page }) => {
  const { stack, tool } = await mountedTool(page);
  await tool.locator('.filter-select[data-filter="category"]').selectOption('Banquet');

  await turnTo(page, stack, 'Generated SQL');
  const front = frontPage(stack, await frontPageIndex(stack));
  await expect(front.locator('section.blueprint')).toBeVisible();
  const sheet = front.locator('[data-library-search="sql"]');
  await expect(sheet).toHaveAttribute('data-ready', 'true', { timeout: 15_000 });

  const frags = sheet.locator('.frag:not([data-mark="max"])');
  await expect(frags).toHaveCount(3);
  await expect(sheet.locator('.sql')).toContainText("AND (`library_objects`.category = 'Banquet')");

  await sheet.locator('.sheet-query').fill('round 10 seats');
  for (const mark of ['where', 'select', 'order']) {
    await expect(sheet.locator(`.frag[data-mark="${mark}"]`)).toContainText(`AGAINST('round "10 seats"' IN BOOLEAN MODE)`);
  }

  // The main page's field follows, so turning back finds the same query there.
  await expect(tool.locator('.query-input')).toHaveValue('round 10 seats');
});

test('relevance page: the scoring table follows the query typed on it', async ({ page }) => {
  const stack = librarySearchStack(page);
  await stack.scrollIntoViewIfNeeded();
  await turnTo(page, stack, 'Relevance Scoring');
  const front = frontPage(stack, await frontPageIndex(stack));
  const sheet = front.locator('[data-library-search="relevance"]');
  await expect(sheet).toHaveAttribute('data-ready', 'true', { timeout: 15_000 });

  await sheet.locator('.sheet-query').fill('gold chair');
  await expect(sheet.locator('.mangled')).toHaveText('gold chair');
  await expect(sheet.locator('table.terms tbody tr')).toHaveCount(2);
  await expect(sheet.locator('table.hits tbody tr').first().locator('.value')).toHaveText('1.00');
});

test('property filters page: the filtered column renormalises to its own best row', async ({ page }) => {
  const stack = librarySearchStack(page);
  await stack.scrollIntoViewIfNeeded();
  await turnTo(page, stack, 'Filters');
  const front = frontPage(stack, await frontPageIndex(stack));
  await expect(front.locator('section.blueprint')).toBeVisible();

  const leads = front.locator('.column li.lead .value');
  await expect(leads).toHaveCount(2);
  expect(Number(await leads.nth(0).textContent())).toBeLessThan(1);
  await expect(leads.nth(1)).toHaveText('1.00');
});
