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
  // The deck's pause holds the tool for the test; a moving pointer would take it too, but
  // hands it back after a quiet spell, and the script would start over under the test.
  await front.locator('[data-demo-transport] [data-demo-key="pause"]').click();
  await expect(tool).toHaveAttribute('data-autoplay', 'user');
  return { stack, front, tool };
}

/** The form a query is sent as, the way search.ts serialises it with no filters. */
const form = (query: string) => `query=${encodeURIComponent(query).replace(/%20/g, '+')}`;

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
  await expect(tool).toHaveAttribute('data-answered', form(query));
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

test('main page: the walkthrough types on its own and hands over to a moving pointer', async ({ page }) => {
  const stack = librarySearchStack(page);
  await stack.scrollIntoViewIfNeeded();
  const front = frontPage(stack, await frontPageIndex(stack));
  await waitForIslandMounted(front, '[data-library-search="search"]');

  const tool = front.locator('.library-search[data-live]');
  const input = tool.locator('.query-input');
  await expect(tool).toHaveAttribute('data-autoplay', 'playing');
  // It clears the opening query and starts typing its own.
  await expect(input).not.toHaveValue('rectangular 8 seats', { timeout: 10_000 });
  await expect(tool).toHaveAttribute('data-answered', /./, { timeout: 10_000 });

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

  // Play hands back: the script starts over from the opening query and types again.
  await play.click();
  await expect(tool).toHaveAttribute('data-autoplay', 'playing');
  await expect(deck).toHaveAttribute('data-state', 'playing');
  await expect(input).toHaveValue('rectangular 8 seats');
  await expect(input).not.toHaveValue('rectangular 8 seats', { timeout: 10_000 });

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


test('generated SQL page: a bare number is quoted, and a seats after it folds into the phrase', async ({ page }) => {
  const { stack } = await mountedTool(page);
  // The bound query is printed on the Generated SQL sheet, not beside the tool.
  await turnTo(page, stack, 'Generated SQL');
  const sheet = frontPage(stack, await frontPageIndex(stack)).locator('[data-library-search="sql"]');
  await expect(sheet).toHaveAttribute('data-ready', 'true', { timeout: 15_000 });
  const mangled = sheet.locator('.sent .mangled');
  const type = async (query: string) => {
    await sheet.locator('.sheet-query').fill(query);
    await expect(sheet).toHaveAttribute('data-answered', form(query));
  };

  await type('rectangular 8');
  await expect(mangled).toHaveText('rectangular "8"');
  await expect(mangled.locator('.rule-quoted')).toHaveText('"8"');

  await type('rectangular 8 seats');
  await expect(mangled).toHaveText('rectangular "8 seats"');
  await expect(mangled.locator('.rule-folded')).toHaveText('"8 seats"');
});

test('main page: a quoted 8 is the token 8 alone', async ({ page }) => {
  const { tool } = await mountedTool(page);
  // The 8 pax tables and the 8ft ones, never the 182 wide.
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

test('generated SQL page: the request line shows the form sent, and a repeat is dropped', async ({ page }) => {
  const { stack } = await mountedTool(page);
  await turnTo(page, stack, 'Generated SQL');
  const sheet = frontPage(stack, await frontPageIndex(stack)).locator('[data-library-search="sql"]');
  await expect(sheet).toHaveAttribute('data-ready', 'true', { timeout: 15_000 });
  const field = sheet.locator('.sheet-query');
  const sent = sheet.locator('[data-tally="sent"]');
  const dropped = sheet.locator('[data-tally="dropped"]');

  await field.fill('table');
  await expect(sheet.locator('.requests .key')).toHaveText(`?${form('table')}`);
  await expect(sheet).toHaveAttribute('data-answered', form('table'));
  const before = { sent: Number(await sent.textContent()), dropped: Number(await dropped.textContent()) };
  expect(before.sent).toBeGreaterThan(0);

  // The same serialised form again: identical to what is showing, so it never goes out.
  await field.dispatchEvent('input');
  await expect(dropped).toHaveText(String(before.dropped + 1));
  await expect(sent).toHaveText(String(before.sent));
});

test('main page: the first sheet carries neither the bound query nor the request line', async ({ page }) => {
  const { front, tool } = await mountedTool(page);
  await expect(tool.locator('.mangled, .requests, [data-tally]')).toHaveCount(0);
  await expect(front.locator(':scope > section .content')).not.toContainText(/sent as|bound as|\?query=/i);
});

test('main page: a visitor typing with the keyboard searches for real', async ({ page }) => {
  const stack = librarySearchStack(page);
  await stack.scrollIntoViewIfNeeded();
  const front = frontPage(stack, await frontPageIndex(stack));
  await waitForIslandMounted(front, '[data-library-search="search"]');
  const tool = front.locator('.library-search[data-live]');
  const input = tool.locator('.query-input');
  await expect(tool).toHaveAttribute('data-autoplay', 'playing');

  // A click in the field takes it, and real keystrokes go through the same pipeline.
  await input.click();
  await expect(tool).toHaveAttribute('data-autoplay', 'user');
  await expect(front.locator('[data-demo-cursor]')).toBeHidden();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('Backspace');
  await page.keyboard.type('gold chair', { delay: 40 });
  await expect(input).toHaveValue('gold chair');
  await expect(tool).toHaveAttribute('data-answered', form('gold chair'));
  await expect(tool.locator('.hit:not([hidden]) .details').first()).toContainText('Gold');
  await expect(tool.locator('.count')).toHaveAttribute('role', 'status');
  // Focus stays in the field, so the quiet spell never hands it back to the script.
  await page.waitForTimeout(7_000);
  await expect(tool).toHaveAttribute('data-autoplay', 'user');
  await expect(input).toHaveValue('gold chair');
});

test('main page: every change the walkthrough makes shows the drawn cursor on its control', async ({ page }) => {
  test.setTimeout(90_000);
  const stack = librarySearchStack(page);
  await stack.scrollIntoViewIfNeeded();
  const front = frontPage(stack, await frontPageIndex(stack));
  await waitForIslandMounted(front, '[data-library-search="search"]');
  const host = front.locator('[data-library-search="search"]');
  await expect(host.locator('.library-search')).toHaveAttribute('data-autoplay', 'playing');

  // Every write to the field or a filter is logged with where the cursor's tip was, and so is
  // every redraw of the rows; a redraw with no write shortly before it would be a change the
  // visitor could not trace to anything on screen. A filter is written while its drawn list
  // is open, with the tip on the lit option that carries the new value.
  await host.evaluate((el) => {
    const log: { what: string; value: string; shown: boolean; inside: boolean; ring: boolean; listed: boolean; at: number }[] = [];
    const redraws: number[] = [];
    const cursor = el.querySelector<HTMLElement>('[data-demo-cursor]')!;
    const watch = (control: HTMLInputElement | HTMLSelectElement, what: string) => {
      const proto = Object.getPrototypeOf(control);
      const desc = Object.getOwnPropertyDescriptor(proto, 'value')!;
      Object.defineProperty(control, 'value', {
        configurable: true,
        get() { return desc.get!.call(this); },
        set(value: string) {
          const list = el.querySelector<HTMLElement>('[data-demo-options]')!;
          const lit = list.querySelector<HTMLElement>('li[data-hover]');
          const listed = what === 'query' || (!list.hidden && lit?.dataset.value === value);
          const box = (what === 'query' ? control : lit ?? control).getBoundingClientRect();
          const tip = cursor.getBoundingClientRect();
          const x = tip.left + tip.width * 0.12;
          const y = tip.top + tip.height * 0.08;
          log.push({
            what,
            value,
            shown: !cursor.hidden && tip.width > 0,
            inside: x >= box.left - 2 && x <= box.right + 2 && y >= box.top - 2 && y <= box.bottom + 2,
            ring: control.hasAttribute('data-demo-focus'),
            listed,
            at: performance.now(),
          });
          desc.set!.call(this, value);
        },
      });
    };
    watch(el.querySelector('.query-input')!, 'query');
    el.querySelectorAll<HTMLSelectElement>('.filter-select').forEach((select) => watch(select, select.dataset.filter!));
    new MutationObserver(() => redraws.push(performance.now()))
      .observe(el.querySelector('.results')!, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
    Object.assign(window, { __searchLog: log, __searchRedraws: redraws });
  });

  // One whole pass: through the gold filter and back, and on to the seat count.
  await expect.poll(() => page.evaluate(() => {
    const log = (window as unknown as { __searchLog: { what: string; value: string }[] }).__searchLog;
    const cleared = log.findIndex((entry) => entry.what === 'color' && entry.value === '');
    return cleared >= 0 && log.slice(cleared).some((entry) => entry.value === 'rectangular 8 seats');
  }), { timeout: 60_000, intervals: [500] }).toBe(true);

  const { log, redraws } = await page.evaluate(() => {
    const w = window as unknown as { __searchLog: { what: string; value: string; shown: boolean; inside: boolean; ring: boolean; listed: boolean; at: number }[]; __searchRedraws: number[] };
    return { log: w.__searchLog, redraws: w.__searchRedraws };
  });
  const colors = log.filter((entry) => entry.what === 'color').map((entry) => entry.value);
  expect(colors).toEqual(expect.arrayContaining(['Gold', '']));
  for (const entry of log) {
    expect(entry, `${entry.what} set to "${entry.value}"`).toMatchObject({ shown: true, inside: true, ring: true, listed: true });
  }
  // The mock server answers within 260 ms of the last write, behind a 50 ms throttle, and the
  // rows slide for 350 ms after it.
  const writes = log.map((entry) => entry.at);
  const unexplained = redraws.filter((at) => !writes.some((write) => write <= at && at - write < 800));
  expect(unexplained).toEqual([]);
});

test('main page: the walkthrough opens the Color list, lights Gold and closes on it', async ({ page }) => {
  test.setTimeout(60_000);
  const stack = librarySearchStack(page);
  await stack.scrollIntoViewIfNeeded();
  const front = frontPage(stack, await frontPageIndex(stack));
  await waitForIslandMounted(front, '[data-library-search="search"]');
  const tool = front.locator('.library-search[data-live]');
  const list = tool.locator('[data-demo-options]');

  // Drawn for the eye only: the visitor and a screen reader get the native select.
  await expect(list).toHaveAttribute('aria-hidden', 'true');

  // Each change to the drawn list is logged in the page, since the lit option only shows for
  // a few hundred ms: whether it is open, what it lists, which option is lit and which is
  // current, the select's value, and whether the list fits inside the tool, under the select.
  await tool.evaluate((root) => {
    type Frame = { open: boolean; options: string[]; lit?: string; current?: string; value: string; fits: boolean };
    const el = root.querySelector<HTMLElement>('[data-demo-options]')!;
    const select = root.querySelector<HTMLSelectElement>('.filter-select[data-filter="color"]')!;
    const frames: Frame[] = [];
    const record = () => {
      const box = el.getBoundingClientRect();
      const outer = root.getBoundingClientRect();
      const under = select.getBoundingClientRect();
      const frame: Frame = {
        open: !el.hidden,
        options: [...el.children].map((li) => li.textContent!),
        lit: el.querySelector('[data-hover]')?.textContent ?? undefined,
        current: el.querySelector('[data-selected]')?.textContent ?? undefined,
        value: select.value,
        fits: !!el.hidden || (box.top >= under.bottom && box.left >= outer.left && box.right <= outer.right
          && box.bottom <= outer.bottom && el.scrollHeight <= el.clientHeight),
      };
      if (JSON.stringify(frames.at(-1)) !== JSON.stringify(frame)) frames.push(frame);
    };
    new MutationObserver(record).observe(el, { subtree: true, childList: true, attributes: true });
    Object.assign(window, { __listFrames: frames });
  });

  const frames = () => page.evaluate(() => (window as unknown as { __listFrames: { open: boolean; options: string[]; lit?: string; current?: string; value: string; fits: boolean }[] }).__listFrames);
  // Two openings: Any to Gold, then Gold back to Any.
  await expect.poll(async () => (await frames()).filter((f, i, all) => !f.open && all[i - 1]?.open).length, { timeout: 45_000, intervals: [500] }).toBeGreaterThanOrEqual(2);

  const all = await frames();
  const options = await tool.locator('.filter-select[data-filter="color"] option').allTextContents();
  const openings: typeof all[] = [];
  for (const frame of all) {
    if (!frame.open) continue;
    if (!openings.length || !all[all.indexOf(frame) - 1]?.open) openings.push([]);
    openings.at(-1)!.push(frame);
  }
  const closes = all.filter((f, i) => !f.open && all[i - 1]?.open);
  for (const [n, [from, to]] of [['Any', 'Gold'], ['Gold', 'Any']].entries()) {
    const shown = openings[n].filter((f) => f.options.length);
    // It opens with every option the select has, the current one lit.
    expect(shown[0], `opening ${n + 1}`).toMatchObject({ options, lit: from, current: from, fits: true });
    // The hand lights its pick before it clicks.
    expect(shown.some((f) => f.lit === to), `opening ${n + 1}`).toBe(true);
    expect(shown.every((f) => f.fits), `opening ${n + 1}`).toBe(true);
    // Then the list closes on the new value.
    expect(closes[n].value, `closing ${n + 1}`).toBe(to === 'Any' ? '' : to);
  }
});

for (const viewport of [{ width: 390, height: 844 }, { width: 1024, height: 900 }, { width: 1440, height: 900 }]) {
  test(`main page: the tool fills the sheet and its last row scrolls clear of the title block at ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const { front, tool } = await mountedTool(page);
    // Every object on show, so the list is long enough to scroll.
    await tool.locator('.query-input').fill('');
    await expect(tool).toHaveAttribute('data-answered', form(''));

    const numbers = await front.locator(':scope > section').evaluate((section) => {
      const content = section.querySelector<HTMLElement>(':scope > .content')!.getBoundingClientRect();
      const block = section.querySelector<HTMLElement>(':scope > table')!.getBoundingClientRect();
      const tool = section.querySelector<HTMLElement>('.library-search')!;
      const list = tool.querySelector<HTMLElement>('.results')!;
      list.scrollTop = list.scrollHeight;
      const rows = [...list.querySelectorAll<HTMLElement>('.hit:not([hidden])')];
      const last = rows.at(-1)!.getBoundingClientRect();
      const box = tool.getBoundingClientRect();
      const overlaps = last.right > block.left && last.left < block.right && last.bottom > block.top && last.top < block.bottom;
      return {
        fill: { w: box.width / content.width, h: box.height / content.height },
        scrolls: list.scrollHeight > list.clientHeight,
        overlaps,
        lastBottom: last.bottom,
        blockTop: block.top,
        listBottom: list.getBoundingClientRect().bottom,
      };
    });
    console.log('layout', viewport.width, JSON.stringify(numbers));
    // Wall to wall inside the inset: nothing but the padding between the tool and the cell.
    expect(numbers.fill.w).toBeGreaterThan(0.9);
    expect(numbers.fill.h).toBeGreaterThan(0.85);
    expect(numbers.scrolls).toBe(true);
    expect(numbers.overlaps, JSON.stringify(numbers)).toBe(false);
  });
}

for (const viewport of [{ width: 1440, height: 900 }, { width: 1680, height: 1050 }]) {
  test(`blueprint pages: each card fits whole beside the title block at ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const stack = librarySearchStack(page);
    await stack.scrollIntoViewIfNeeded();

    for (const name of PAGES.slice(1)) {
      await turnTo(page, stack, name);
      const front = frontPage(stack, await frontPageIndex(stack));
      const fit = await front.locator(':scope > section').evaluate((section) => {
        const panel = section.querySelector<HTMLElement>('.panel')!;
        const box = panel.getBoundingClientRect();
        const block = section.querySelector<HTMLElement>(':scope > table')!.getBoundingClientRect();
        return {
          hidden: panel.scrollHeight - panel.clientHeight,
          clear: box.right <= block.left || box.bottom <= block.top,
        };
      });
      expect(fit, name).toEqual({ hidden: 0, clear: true });
    }
  });
}

test('generated SQL page: all three copies of the fragment follow the query typed on it', async ({ page }) => {
  const stack = librarySearchStack(page);
  await stack.scrollIntoViewIfNeeded();
  await turnTo(page, stack, 'Generated SQL');
  const sheet = frontPage(stack, await frontPageIndex(stack)).locator('[data-library-search="sql"]');
  await expect(sheet).toHaveAttribute('data-ready', 'true', { timeout: 15_000 });

  await expect(sheet.locator('.frag:not([data-mark="max"])')).toHaveCount(3);
  await sheet.locator('.sheet-query').fill('round 10 seats');
  for (const mark of ['where', 'select', 'order']) {
    await expect(sheet.locator(`.frag[data-mark="${mark}"]`)).toContainText(`AGAINST('round "10 seats"' IN BOOLEAN MODE)`);
  }
});

test('every sheet keeps its own query: typing or filtering on one never moves another', async ({ page }) => {
  const { stack, tool } = await mountedTool(page);
  const opening = await tool.locator('.query-input').inputValue();
  await search(tool, 'gold chair');
  await tool.locator('.filter-select[data-filter="category"]').selectOption('Banquet');

  const sheets = { 'Relevance Scoring': 'relevance', 'Generated SQL': 'sql' } as const;
  for (const [name, kind] of Object.entries(sheets)) {
    await turnTo(page, stack, name);
    const sheet = frontPage(stack, await frontPageIndex(stack)).locator(`[data-library-search="${kind}"]`);
    await expect(sheet).toHaveAttribute('data-ready', 'true', { timeout: 15_000 });
    await expect(sheet.locator('.sheet-query'), name).toHaveValue(opening);
    await expect(sheet.locator('.filters-note'), name).toHaveText('');
    if (kind === 'sql') await expect(sheet.locator('.sql')).not.toContainText("category = 'Banquet'");
  }

  // And back the other way: the SQL sheet's query stays on it.
  const sql = frontPage(stack, await frontPageIndex(stack)).locator('[data-library-search="sql"]');
  await sql.locator('.sheet-query').fill('round 10 seats');
  await expect(sql).toHaveAttribute('data-answered', form('round 10 seats'));
  await expect(tool.locator('.query-input')).toHaveValue('gold chair');
  await expect(tool.locator('.filter-select[data-filter="category"]')).toHaveValue('Banquet');
  await expect(stack.locator('[data-library-search="relevance"] .sheet-query')).toHaveValue(opening);
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

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`every sheet's type is at least 8px at ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const stack = librarySearchStack(page);
    await stack.scrollIntoViewIfNeeded();

    for (const name of PAGES) {
      await turnTo(page, stack, name);
      const front = frontPage(stack, await frontPageIndex(stack));
      const small = await front.locator(':scope > section .content').evaluate((content: HTMLElement) => {
        // Rendered size is the computed size times whatever scale the sheet is drawn at, read
        // off the whole sheet: offsetWidth rounds, which skews a small box's ratio.
        const scale = content.getBoundingClientRect().width / content.offsetWidth;
        const found = new Set<string>();
        for (const el of content.querySelectorAll<HTMLElement>('*')) {
          const own = [...el.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent!.trim());
          if (!own || !el.checkVisibility() || el.offsetWidth === 0) continue;
          const size = parseFloat(getComputedStyle(el).fontSize) * scale;
          if (size < 8) found.add(`${el.className || el.tagName} ${size.toFixed(2)}px`);
        }
        return [...found];
      });
      expect.soft(small, name).toEqual([]);
    }
  });
}
