import { expect, test } from '@playwright/test';

import { frontPage, frontPageIndex, frontPageName, swipeStack, turnToPage, waitForIslandMounted } from './support/paperStack';

const PAGES = ['Library Tagging Tool', 'Shared Value', 'Simulated Caret', 'Completed Objects'];

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

function taggingToolStack(page: import('@playwright/test').Page) {
  // By title, not by position: the demos run gains stacks over time.
  return page.locator('article.technical-drawing-stack').filter({
    has: page.locator('h2.typewriter', { hasText: 'Library Tagging Tool' }),
  });
}

async function mountedTool(page: import('@playwright/test').Page) {
  const stack = taggingToolStack(page);
  await stack.scrollIntoViewIfNeeded();
  const front = frontPage(stack, await frontPageIndex(stack));

  const mount = front.locator('.tagging-grid-demo');
  await expect(mount).toHaveAttribute('data-mounted', 'true', { timeout: 15_000 });
  const tool = front.locator('.tagging-tool[data-live]');
  // Hovering the tool is how a real visitor takes it over from the walkthrough
  // (taggingTool.ts's pointerenter/focusin -> stop); without it the first row keeps
  // typing, switching property and replaying on its own.
  await tool.hover();
  await expect(tool).toHaveAttribute('data-autoplay', 'user');
  // The walkthrough may have switched property before the handover landed; every test
  // below starts from the property the page opens on.
  await tool.locator('.property-select').selectOption('chair');
  return { stack, front, tool };
}

test('tagging tool: forward swipes visit every page in order, then wrap', async ({ page }) => {
  const stack = taggingToolStack(page);
  await stack.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);

  expect(await stack.locator(':scope > div').count()).toBe(PAGES.length);
  expect(await frontPageName(stack)).toBe(PAGES[0]);

  for (let i = 1; i < PAGES.length; i += 1) {
    await swipeStack(page, stack, true);
    expect(await frontPageName(stack), `page ${i} after ${i} forward swipe(s)`).toBe(PAGES[i]);
  }

  await swipeStack(page, stack, true);
  expect(await frontPageName(stack)).toBe(PAGES[0]);
});

test('main page: the walkthrough types with a drawn cursor and hands over on hover', async ({ page }) => {
  const stack = taggingToolStack(page);
  await stack.scrollIntoViewIfNeeded();
  const front = frontPage(stack, await frontPageIndex(stack));
  await expect(front.locator('.tagging-grid-demo')).toHaveAttribute('data-mounted', 'true', { timeout: 15_000 });

  const tool = front.locator('.tagging-tool[data-live]');
  const cursor = front.locator('.tagging-cursor');
  await expect(tool).toHaveAttribute('data-autoplay', 'playing');
  await expect(cursor).toBeVisible({ timeout: 10_000 });

  // It fills the whole row from the one shared field, mirroring as it types: the base
  // card leaves its own Beige as soon as the first letter lands.
  const gold = tool.locator('.grouped-objects[data-group="gold"]');
  await expect(gold.locator('.object-value').first()).not.toHaveValue('Beige', { timeout: 15_000 });

  await tool.hover();
  await expect(tool).toHaveAttribute('data-autoplay', 'user');
  await expect(cursor).toBeHidden();

  // Handover means handover: nothing types itself after this.
  const settled = await gold.locator('.shared-value').inputValue();
  await page.waitForTimeout(1_500);
  expect(await gold.locator('.shared-value').inputValue()).toBe(settled);
});

test('main page: the walkthrough puts its pointer on the tick before the row saves', async ({ page }) => {
  const stack = taggingToolStack(page);
  await stack.scrollIntoViewIfNeeded();
  const front = frontPage(stack, await frontPageIndex(stack));
  await expect(front.locator('.tagging-grid-demo')).toHaveAttribute('data-mounted', 'true', { timeout: 15_000 });
  await expect(front.locator('.tagging-tool[data-live]')).toHaveAttribute('data-autoplay', 'playing');

  // Sample where the drawn cursor is until the row commits. A save the visitor cannot see
  // coming is the bug: the pointer has to reach the tick first.
  const seen = await front.evaluate(async (root: HTMLElement) => {
    const cursor = root.querySelector<HTMLElement>('.tagging-cursor')!;
    const group = root.querySelector<HTMLElement>('.grouped-objects[data-group="gold"]')!;
    const save = group.querySelector<HTMLElement>('.shared-form button')!;
    let onTick = false;

    for (let i = 0; i < 1_200; i += 1) {
      const box = cursor.getBoundingClientRect();
      const tick = save.getBoundingClientRect();
      // GridLayer.astro puts the arrow's tip 12% / 8% into the cursor's own box.
      const x = box.left + box.width * 0.12;
      const y = box.top + box.height * 0.08;
      if (!cursor.hidden && x >= tick.left && x <= tick.right && y >= tick.top && y <= tick.bottom) {
        onTick = true;
      }
      if (group.classList.contains('success')) return { onTick, committed: true };
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    return { onTick, committed: false };
  });

  expect(seen.committed).toBe(true);
  expect(seen.onTick).toBe(true);
});

test('main page: a narrow sheet scrolls the list rather than squashing the thumbnails', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.reload();
  const { tool } = await mountedTool(page);

  const heights = await tool
    .locator('.thumbnail-image-container img')
    .evaluateAll((images) => images.map((image) => image.getBoundingClientRect().height));
  expect(heights).toHaveLength(8);
  expect(Math.min(...heights)).toBeGreaterThan(24);

  // The rows no longer fit, so the list scrolls; nothing is hidden and nothing is squashed.
  const list = await tool.evaluate((root) => {
    const body = root.querySelector<HTMLElement>(':scope > .body')!;
    return { scroll: body.scrollHeight, client: body.clientHeight };
  });
  expect(list.scroll).toBeGreaterThan(list.client);
});

test('main page: the shared value mirrors onto the base and every variant, and Enter saves them all', async ({ page }) => {
  const { tool } = await mountedTool(page);

  const gold = tool.locator('.grouped-objects[data-group="gold"]');
  const shared = gold.locator('.shared-value');
  const objects = gold.locator('.object-value');

  await shared.click();
  await shared.fill('bright gold');
  await expect(objects.first()).toHaveValue('bright gold');

  // auto_submit_form: Enter blurs the field and the change submits with update_styles.
  await shared.press('Enter');

  const count = await objects.count();
  for (let i = 0; i < count; i += 1) {
    await expect(objects.nth(i)).toHaveValue('Bright Gold');
  }
  // Its last gap is filled, so the object leaves the list the way set.js.erb drops it.
  await expect(gold).toBeHidden();
  await expect(tool.locator('.demo-note')).toBeVisible();
});

// The save ring: src/scss/_statusBorder.scss on the row (a shared save) or the card (one
// object). Pending orbits for the mock round trip, success sweeps the ring closed, and only
// then do the values land; idle follows once the closed ring has rested.
test('main page: a shared save plays the ring on the whole group, pending then success', async ({ page }) => {
  const { tool } = await mountedTool(page);
  const gold = tool.locator('.grouped-objects[data-group="gold"]');
  const cards = gold.locator('.panel-preview-library-object');

  await gold.locator('.shared-value').fill('bright gold');
  const pressed = Date.now();
  await gold.locator('.shared-form button').click();
  await expect(gold).toHaveClass(/\bpending\b/);
  await expect(gold.locator('.panel-preview-library-object:is(.pending, .success)')).toHaveCount(0);
  // Mirrored as typed; the titleized value is what a save writes back.
  await expect(gold.locator('.object-value').nth(2)).toHaveValue('bright gold');

  await expect(gold).toHaveClass(/\bsuccess\b/, { timeout: 5_000 });
  expect(Date.now() - pressed, 'the ring orbits for the round trip first').toBeGreaterThanOrEqual(800);
  await expect(gold.locator('.object-value').nth(2)).toHaveValue('bright gold');

  await expect(gold.locator('.object-value').nth(2)).toHaveValue('Bright Gold', { timeout: 5_000 });
  await expect(cards.locator(':scope.pending, :scope.success')).toHaveCount(0);
  await expect(gold).toHaveClass(/\bidle\b/, { timeout: 5_000 });
});

test('main page: saving one object plays the ring on that card alone', async ({ page }) => {
  const { tool } = await mountedTool(page);
  const gold = tool.locator('.grouped-objects[data-group="gold"]');
  // 10638, the table without chairs, is the last card of the row.
  const thumb = gold.locator('.image-thumbnail').nth(3);
  const card = thumb.locator('.panel-preview-library-object');

  await thumb.locator('.object-value').fill('bright gold');
  const pressed = Date.now();
  await thumb.locator('.object-form button').click();
  await expect(card).toHaveClass(/\bpending\b/);
  await expect(gold.locator('.panel-preview-library-object.pending')).toHaveCount(1);
  await expect(gold).not.toHaveClass(/\b(pending|success|idle)\b/);

  await expect(card).toHaveClass(/\bsuccess\b/, { timeout: 5_000 });
  expect(Date.now() - pressed, 'the ring orbits for the round trip first').toBeGreaterThanOrEqual(800);
  await expect(thumb.locator('.object-value')).toHaveValue('bright gold');

  await expect(thumb.locator('.object-value')).toHaveValue('Bright Gold', { timeout: 5_000 });
  await expect(gold).not.toHaveClass(/\b(pending|success|idle)\b/);
  await expect(card).toHaveClass(/\bidle\b/, { timeout: 5_000 });
});

test('main page: typing mid-value keeps the shared caret put and scrolls each card to it, not to the end', async ({ page }) => {
  const { tool } = await mountedTool(page);

  const gold = tool.locator('.grouped-objects[data-group="gold"]');
  const shared = gold.locator('.shared-value');
  const forms = gold.locator('.object-form');

  // Longer than a variant card's input at any sheet width this suite runs at.
  const value = 'Champagne With Gold Trim And Piping';
  await shared.click();
  await shared.fill(value);
  await shared.press('Home');
  for (let i = 0; i < 6; i += 1) await shared.press('ArrowRight');
  await shared.type('X');

  expect(await shared.evaluate((el: HTMLInputElement) => [el.selectionStart, el.selectionEnd])).toEqual([7, 7]);

  // Where the scroll ought to sit for the caret the shared input reports: mirror() scrolls
  // just far enough to keep that caret and one character past it in view, and never to
  // the input's end the way the product does.
  const state = (form: import('@playwright/test').Locator) =>
    form.evaluate((el) => {
      const input = el.querySelector('input')!;
      const style = getComputedStyle(input);
      const ruler = document.createElement('canvas').getContext('2d')!;
      ruler.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const ch = ruler.measureText('0').width;
      const textWidth = input.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const caret = Number(el.style.getPropertyValue('--caret'));
      return {
        value: input.value,
        caret,
        scrollLeft: input.scrollLeft,
        scrollEnd: input.scrollWidth - input.clientWidth,
        expected: Math.max(0, (caret + 1) * ch - textWidth),
        scrollVar: el.style.getPropertyValue('--scroll'),
      };
    });

  const count = await forms.count();
  for (let i = 0; i < count; i += 1) {
    const card = await state(forms.nth(i));
    expect(card.value).toBe('ChampaXgne With Gold Trim And Piping');
    expect(card.caret).toBe(7);
    expect(card.scrollEnd).toBeGreaterThan(0);
    expect(card.scrollLeft).toBe(0);
  }

  // Caret near the end but not at it: the input scrolls to that caret and stops short of
  // its end, and the drawn caret is told how far.
  const at = value.length + 1 - 4;
  await shared.evaluate((el: HTMLInputElement, index) => el.setSelectionRange(index, index), at);
  await shared.press('Shift');
  for (let i = 0; i < count; i += 1) {
    const card = await state(forms.nth(i));
    expect(card.caret).toBe(at);
    expect(card.expected).toBeGreaterThan(0);
    expect(Math.abs(card.scrollLeft - card.expected)).toBeLessThanOrEqual(1);
    expect(card.scrollLeft).toBeLessThan(card.scrollEnd - 1);
    expect(parseFloat(card.scrollVar)).toBeCloseTo(card.scrollLeft, 0);
  }
});

test('main page: differing variant values keep the shared input open and flag the overrides', async ({ page }) => {
  const { tool } = await mountedTool(page);

  const gold = tool.locator('.grouped-objects[data-group="gold"]');
  await expect(gold.locator('.shared-form')).toHaveAttribute('data-shared', 'false');
  await expect(gold.locator('.shared-value')).toBeEnabled();
  await expect(gold.locator('.shared-value')).toHaveAttribute('placeholder', 'Overrides: Ivory, Beige, Champagne');

  // Hovering the warning sign has to say what it is warning about.
  const title = await gold.locator('.shared-form button').getAttribute('title');
  expect(title).toContain('do not all have the same value');
  expect(title).toContain('overwrites the variants with the base value');
});

test('main page: picking another property brings up the values already stored for it', async ({ page }) => {
  const { tool } = await mountedTool(page);

  const gold = tool.locator('.grouped-objects[data-group="gold"]');
  const wood = tool.locator('.grouped-objects[data-group="wood"]');
  await tool.locator('.property-select').selectOption('table color');

  // Stored as typed: the product titleizes on save, and this row's base was not saved
  // through this page, so its value differs from its variants' by case alone.
  await expect(wood.locator('.object-value').first()).toHaveValue('wood');
  await expect(wood.locator('.object-value').nth(1)).toHaveValue('Wood');
  await expect(wood.locator('.shared-value')).toHaveAttribute('placeholder', 'Overrides: wood, Wood');

  // The last variant has no table colour, which is why the object is still listed; the
  // other row has one on every object, so it is not.
  await expect(wood.locator('.object-value').last()).toHaveValue('');
  await expect(gold).toBeHidden();
});

test('main page: the walkthrough takes the gold row from wrong values to the ones the product holds', async ({ page }) => {
  const stack = taggingToolStack(page);
  await stack.scrollIntoViewIfNeeded();
  const front = frontPage(stack, await frontPageIndex(stack));
  await expect(front.locator('.tagging-grid-demo')).toHaveAttribute('data-mounted', 'true', { timeout: 15_000 });
  await expect(front.locator('.tagging-tool[data-live]')).toHaveAttribute('data-autoplay', 'playing');

  const gold = front.locator('.grouped-objects[data-group="gold"]');
  const wood = front.locator('.grouped-objects[data-group="wood"]');
  const objects = gold.locator('.object-value');
  const shared = gold.locator('.shared-value');
  const values = (row = objects) =>
    row.evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value));
  // The wood row is the product's data and has no step in the script.
  const woodValues = ['Cream', 'Cream', '', ''];

  // Before: Ivory, Beige, Ivory, Champagne over the four cards, the product's Ivory on
  // the base and 10631 and two wrong values beside them. The shared field is empty with
  // the overrides in its placeholder and its tick is a warning.
  await expect(gold.locator('.shared-form')).toHaveAttribute('data-shared', 'false');
  await expect(shared).toHaveAttribute('placeholder', 'Overrides: Ivory, Beige, Champagne');
  expect(await values()).toEqual(['Ivory', 'Beige', 'Ivory', 'Champagne']);
  expect(await values(wood.locator('.object-value'))).toEqual(woodValues);

  // After the shared save lands: Ivory on every object, and the field holds it. The row
  // stays put, only its ring marks the save.
  await expect(gold.locator('.shared-form')).toHaveAttribute('data-shared', 'true', { timeout: 20_000 });
  expect(await values()).toEqual(['Ivory', 'Ivory', 'Ivory', 'Ivory']);
  await expect(gold).not.toHaveClass(/\bcompleting\b/);
  await expect(shared).toHaveValue('Ivory');
  expect(await values(wood.locator('.object-value'))).toEqual(woodValues);

  // Then the bare table, 10638, has its chair value emptied on its own card: the
  // product's nil, which is what it holds. The placeholder lists the one value left.
  await expect(gold.locator('.image-thumbnail[data-object="10638"]')).toHaveAttribute('data-missing', 'true', {
    timeout: 20_000,
  });
  expect(await values()).toEqual(['Ivory', 'Ivory', 'Ivory', '']);
  await expect(gold.locator('.shared-form')).toHaveAttribute('data-shared', 'false');
  await expect(shared).toHaveAttribute('placeholder', 'Overrides: Ivory');
  expect(await values(wood.locator('.object-value'))).toEqual(woodValues);
});

test('shared value page: the mirroring blueprint diagram is shown', async ({ page }) => {
  const stack = taggingToolStack(page);
  await stack.scrollIntoViewIfNeeded();
  await turnToPage(stack, 'Shared Value');
  const front = frontPage(stack, await frontPageIndex(stack));
  await expect(front.locator('section.blueprint')).toBeVisible();
});

test('simulated caret page: the caret-math blueprint diagram is shown', async ({ page }) => {
  const stack = taggingToolStack(page);
  await stack.scrollIntoViewIfNeeded();
  await turnToPage(stack, 'Simulated Caret');
  const front = frontPage(stack, await frontPageIndex(stack));
  await expect(front.locator('section.blueprint')).toBeVisible();
});

test('completed objects page: the leaving-the-list blueprint diagram is shown', async ({ page }) => {
  const stack = taggingToolStack(page);
  await stack.scrollIntoViewIfNeeded();
  await turnToPage(stack, 'Completed Objects');
  const front = frontPage(stack, await frontPageIndex(stack));
  // This page also embeds a non-live Grid for illustration, which has its own
  // .grouped-objects blocks; scope to the page's own blueprint section.
  await expect(front.locator('section.blueprint')).toBeVisible();
  await expect(front.locator('.grouped-objects.completing')).toHaveCount(1);

  // The sheet says what it is about without its prose: a headline, and a callout on each
  // of the three things it shows, anchored to the element it names by the shared
  // Annotations overlay (annotations-position.spec.ts checks where the tips land).
  await expect(front.locator('.point')).toHaveText(/leaves the list/);
  await expect(front.locator('svg[data-annotations]')).toHaveAttribute('data-annotations', 'js');
  const callouts = await visibleCallouts(front);
  expect(callouts).toHaveLength(3);
  for (const callout of callouts) {
    await expect(front.locator('.figure').locator(callout.target), `"${callout.label}" points at one thing on the sheet`).toHaveCount(1);
  }
});

/** The callouts drawn for the sheet's orientation, with the selector each one points at. */
function visibleCallouts(front: import('@playwright/test').Locator) {
  return front.locator('svg[data-annotations] [data-tip]').evaluateAll((groups) =>
    groups
      .filter((group) => group.getClientRects().length)
      .map((group) => ({
        label: group.querySelector('text')?.textContent?.trim() ?? '',
        target: (group as SVGGElement).dataset.target ?? '',
      })),
  );
}

// Every sheet keeps clear sheet around its content: each layer's root pads by the one token in
// layers/_sheet.scss, in em of the sheet's own type, so whatever it paints stays off the
// frame line, the title block and the note's tab. The floor here is what the review asked for.
const SHEET_MARGIN_EM = 0.5;
const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 844, height: 390 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
];

// The least clear sheet, in px, between anything the front sheet paints and its frame line
// (`toFrame`) or its title block and note tab (`toPieces`), against the margin the sheet's
// type sets
function clearSheet(front: import('@playwright/test').Locator) {
  return front.evaluate((wrapper, marginEm) => {
    const section = wrapper.querySelector(':scope > section')!;
    const root = section.querySelector(':scope > .content > *') as HTMLElement;
    const margin = marginEm * parseFloat(getComputedStyle(root).fontSize);

    // The frame line is drawn one pixel wide on the inside of the mat
    const style = getComputedStyle(section);
    const mat = parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft) + 1;
    const sheet = section.getBoundingClientRect();
    const frame = { left: sheet.left + mat, top: sheet.top + mat, right: sheet.right - mat, bottom: sheet.bottom - mat };

    const pieces = ['table', '.note-fold']
      .map((s) => section.querySelector(`:scope > ${s}, :scope > .aside > ${s}`)?.getBoundingClientRect())
      .filter((r): r is DOMRect => !!r && r.width > 0 && r.height > 0);

    // What paints: text, form controls, a drawing, or a box with a fill or a border. Grid
    // and flex wrappers do not, and a wrapper spanning the sheet says nothing about where
    // the ink is. The walkthrough's cursor goes where it likes.
    const paints = (el: Element) => {
      if (el.closest('.tagging-cursor')) return false;
      // An Annotations overlay is twice its artwork's size by design; its ink is its callouts.
      if (el instanceof SVGElement) {
        if (el.closest('svg[data-annotations]')) return el.tagName === 'path' || el.tagName === 'text';
        return el.tagName === 'svg';
      }
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.display === 'contents' || cs.visibility === 'hidden') return false;
      if (['INPUT', 'SELECT', 'BUTTON', 'TEXTAREA', 'IMG'].includes(el.tagName)) return true;
      if (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' || parseFloat(cs.borderTopWidth) > 0 || parseFloat(cs.borderLeftWidth) > 0) return true;
      return [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim());
    };
    // Only what shows: the list scrolls inside the sheet, so a card scrolled out of its
    // scroller paints nothing where its box says it is.
    const visible = (el: Element) => {
      const b = el.getBoundingClientRect();
      const r = { left: b.left, top: b.top, right: b.right, bottom: b.bottom };
      for (let a = el.parentElement; a && a !== root.parentElement; a = a.parentElement) {
        const cs = getComputedStyle(a);
        if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
        const c = a.getBoundingClientRect();
        r.left = Math.max(r.left, c.left);
        r.top = Math.max(r.top, c.top);
        r.right = Math.min(r.right, c.right);
        r.bottom = Math.min(r.bottom, c.bottom);
      }
      return r;
    };
    const boxes = [...root.querySelectorAll('*')]
      .filter(paints)
      .map(visible)
      .filter((r) => r.right > r.left && r.bottom > r.top);

    const toFrame = Math.min(...boxes.map((r) => Math.min(
      r.left - frame.left, frame.right - r.right, r.top - frame.top, frame.bottom - r.bottom,
    )));
    const toPieces = Math.min(...boxes.flatMap((r) => pieces.map((p) => Math.max(
      p.left - r.right, r.left - p.right, p.top - r.bottom, r.top - p.bottom,
    ))));
    return { margin, boxes: boxes.length, toFrame, toPieces };
  }, SHEET_MARGIN_EM);
}

for (const viewport of VIEWPORTS) {
  test.describe(`at ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport });

    test('every sheet keeps the margin around its content', async ({ page }) => {
      test.setTimeout(120_000);
      const stack = taggingToolStack(page);
      await stack.scrollIntoViewIfNeeded();

      for (const name of PAGES) {
        await turnToPage(stack, name);
        const front = frontPage(stack, await frontPageIndex(stack));
        if (await front.locator('.tagging-grid-demo').count()) await waitForIslandMounted(front);
        await expect.poll(async () => (await clearSheet(front)).boxes).toBeGreaterThan(0);

        const gaps = await clearSheet(front);
        expect.soft(gaps.toFrame, `${name}: to the frame line`).toBeGreaterThanOrEqual(gaps.margin - 0.5);
        expect.soft(gaps.toPieces, `${name}: to the title block`).toBeGreaterThanOrEqual(gaps.margin - 0.5);
      }
    });

    test('the completed objects callouts keep off the headline, the footnote and the title block', async ({ page }) => {
      const stack = taggingToolStack(page);
      await stack.scrollIntoViewIfNeeded();
      await turnToPage(stack, 'Completed Objects');
      const front = frontPage(stack, await frontPageIndex(stack));
      await expect(front.locator('svg[data-annotations="js"]')).toBeAttached();

      const labels = await front.evaluate((wrapper) => {
        const section = wrapper.querySelector('section')!;
        const others = ['.point', '.footnote', ':scope > table'].map((s) => section.querySelector(s)!.getBoundingClientRect());
        const hits = (a: DOMRect, b: DOMRect) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
        return [...section.querySelectorAll<SVGGElement>('svg[data-annotations] [data-tip]')]
          .filter((group) => group.getClientRects().length)
          .map((group) => {
            const text = group.querySelector('text')!;
            const box = text.getBoundingClientRect();
            return { label: text.textContent!.trim(), clear: others.every((other) => !hits(box, other)) };
          });
      });
      expect(labels).toHaveLength(3);
      for (const { label, clear } of labels) {
        expect(clear, `"${label}" keeps off the headline, the footnote and the title block`).toBe(true);
      }
    });
  });
}
