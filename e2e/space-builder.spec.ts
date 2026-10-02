import { expect, test } from '@playwright/test';

import {
  armDrawCounter,
  demoStack,
  frontPage,
  frontDeck,
  frontPageIndex,
  sceneDraws,
  swipeStack,
  turnToPage,
  waitForIslandMounted,
} from './support/paperStack';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

function spaceBuilderStack(page: import('@playwright/test').Page) {
  return demoStack(page, 'Space Builder · Add Tool');
}

/** Every scene app marks its own root `data-ready="true"` once Three.js has finished loading. */
async function waitForSceneReady(front: import('@playwright/test').Locator) {
  const island = await waitForIslandMounted(front);
  const app = island.locator('[data-ready]');
  await expect(app).toHaveAttribute('data-ready', 'true', { timeout: 20_000 });
  return app;
}

test('main page: scene loads and the add-object tool opens the catalog', async ({ page }) => {
  const stack = spaceBuilderStack(page);
  await stack.scrollIntoViewIfNeeded();
  const front = frontPage(stack, await frontPageIndex(stack));

  const app = await waitForSceneReady(front);
  await expect(app.locator('canvas[data-scene-canvas]')).toBeVisible();

  // Focusing the root is how a real visitor takes the demo over from its auto-play loop
  // (MockSceneApp.vue's `@focus="yieldToUser"`) — the "Add object" button itself just
  // toggles the catalog panel, so normalize to closed first rather than assume autoplay
  // left it there.
  await app.focus();
  const addObject = app.getByRole('button', { name: 'Add object' });
  if ((await app.getAttribute('data-panel')) !== 'closed') {
    await addObject.click();
    await expect(app).toHaveAttribute('data-panel', 'closed');
  }

  await addObject.click();
  await expect(app).toHaveAttribute('data-panel', 'catalog');
});

test('main page: A and Escape work from the focused root without an application role', async ({ page }) => {
  const stack = spaceBuilderStack(page);
  await stack.scrollIntoViewIfNeeded();
  const front = frontPage(stack, await frontPageIndex(stack));

  const app = await waitForSceneReady(front);
  await expect(app).toHaveAttribute('role', 'group');
  await app.focus();
  if ((await app.getAttribute('data-panel')) !== 'closed') {
    await page.keyboard.press('Escape');
    await expect(app).toHaveAttribute('data-panel', 'closed');
  }

  await page.keyboard.press('a');
  await expect(app).toHaveAttribute('data-panel', 'catalog');
  await app.focus();
  await page.keyboard.press('Escape');
  await expect(app).toHaveAttribute('data-panel', 'closed');
});

test('main page: typing A or Ctrl+A in an Options field does not close the sidebar', async ({ page }) => {
  const stack = spaceBuilderStack(page);
  await stack.scrollIntoViewIfNeeded();
  const front = frontPage(stack, await frontPageIndex(stack));

  const app = await waitForSceneReady(front);
  await app.focus();
  if ((await app.getAttribute('data-panel')) !== 'closed') {
    await page.keyboard.press('Escape');
    await expect(app).toHaveAttribute('data-panel', 'closed');
  }

  // Reach the options sidebar: open the catalog, then confirm a real, layoutable item.
  await page.keyboard.press('a');
  await expect(app).toHaveAttribute('data-panel', 'catalog');
  await app.locator('[data-demo-target="catalog:chair"]').first().dblclick();
  await expect(app).toHaveAttribute('data-panel', 'options');

  const rows = app.locator('.blocks-of input[placeholder="Rows"]');
  await rows.click();
  await rows.press('a');
  await expect(app).toHaveAttribute('data-panel', 'options');
  await rows.press('Control+a');
  await expect(app).toHaveAttribute('data-panel', 'options');

  // The shortcut still works once focus leaves the field.
  await app.focus();
  await page.keyboard.press('a');
  await expect(app).toHaveAttribute('data-panel', 'closed');
});

test('place page: select-area scene loads', async ({ page }) => {
  const stack = spaceBuilderStack(page);
  await stack.scrollIntoViewIfNeeded();
  await turnToPage(stack, 'Place Area');
  const front = frontPage(stack, await frontPageIndex(stack));

  const app = await waitForSceneReady(front);
  await expect(app.locator('canvas[data-scene-canvas]')).toBeVisible();
});

test('parameters page: editing seat count updates the field', async ({ page }) => {
  const stack = spaceBuilderStack(page);
  await stack.scrollIntoViewIfNeeded();
  await turnToPage(stack, 'Edit Parameters');
  const front = frontPage(stack, await frontPageIndex(stack));

  const app = await waitForSceneReady(front);
  const seats = app.locator('[data-demo-target="param:seats"]');

  // Focusing the sidebar is how a real visitor takes the demo over from its auto-play loop
  // (see ParametersSceneApp.vue's yieldToUser) — without it, autoplay keeps rewriting the field.
  await seats.click();
  await seats.fill('24');
  await seats.blur();

  await expect(seats).toHaveValue('24');
  await expect(app.locator('.invalid-feedback')).toHaveCount(0);
});

test('layouts page: picking a different layout style selects it', async ({ page }) => {
  const stack = spaceBuilderStack(page);
  await stack.scrollIntoViewIfNeeded();
  await turnToPage(stack, 'Layout Styles');
  const front = frontPage(stack, await frontPageIndex(stack));

  const app = await waitForSceneReady(front);
  // LayoutsSceneApp.vue has its own inline sidebar (.style-chip buttons), distinct from
  // the data-demo-target-tagged OptionsPanel.vue the other scene pages share.
  const circle = app.getByRole('button', { name: 'Circle', exact: true });
  await circle.click();
  await expect(circle).toHaveClass(/active/);
});

test('layouts page: the scene draws and autoplay cycles the styles after the page turn', async ({ page }) => {
  await armDrawCounter(page);
  const stack = spaceBuilderStack(page);
  await stack.scrollIntoViewIfNeeded();
  await turnToPage(stack, 'Layout Styles');
  const front = frontPage(stack, await frontPageIndex(stack));

  const app = await waitForSceneReady(front);

  // A mounted, ready scene on a page that never became the front one draws nothing: the
  // pages of a stack share one grid cell, and only one of them owns the WebGL context.
  const drawnOnArrival = await sceneDraws(app);
  await expect.poll(() => sceneDraws(app), { timeout: 20_000 }).toBeGreaterThan(drawnOnArrival);

  const activeStyle = () => app.locator('.style-chip.active .style-label').textContent();
  const styleOnArrival = await activeStyle();
  await expect.poll(activeStyle, { timeout: 20_000 }).not.toBe(styleOnArrival);
});

test('layouts page: a wheel over a sidebar gap scrolls the page instead of zooming the scene', async ({ page }) => {
  const stack = spaceBuilderStack(page);
  await stack.scrollIntoViewIfNeeded();
  await turnToPage(stack, 'Layout Styles');
  const front = frontPage(stack, await frontPageIndex(stack));

  const app = await waitForSceneReady(front);
  // The sidebar header sits in `.sidebar` but is not a `.style-chip` button — the gap this
  // bug zoomed/orbited through instead of letting the page scroll.
  const header = app.locator('.sidebar-header');
  const prevented = await header.evaluate((el) => {
    const wheelEvent = new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true });
    el.dispatchEvent(wheelEvent);
    return wheelEvent.defaultPrevented;
  });
  expect(prevented).toBe(false);
});

test('badge page: capacity-badge scene loads', async ({ page }) => {
  const stack = spaceBuilderStack(page);
  await stack.scrollIntoViewIfNeeded();
  await turnToPage(stack, 'Capacity Badge');
  const front = frontPage(stack, await frontPageIndex(stack));

  const app = await waitForSceneReady(front);
  await expect(app.locator('canvas[data-scene-canvas]')).toBeVisible();
});

test('main page: no WebGL unpack warnings across a GPU release and re-attach', async ({ page }) => {
  const warnings: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') warnings.push(message.text());
  });

  const stack = spaceBuilderStack(page);
  await stack.scrollIntoViewIfNeeded();
  const front = frontPage(stack, await frontPageIndex(stack));
  await waitForSceneReady(front);

  // Swiping away releases the front page's WebGL context (releaseGpu); swiping back
  // re-attaches a new renderer to the same canvas (attachGpu) — see spaceBuilderGpu.ts.
  await swipeStack(page, stack, true);
  await swipeStack(page, stack, false);
  await waitForSceneReady(frontPage(stack, await frontPageIndex(stack)));

  expect(warnings.some((text) => /texImage3D/.test(text))).toBe(false);
  expect(warnings.some((text) => /WebGL.*INVALID_/.test(text))).toBe(false);
});

for (const { name, viewport } of [
  { name: 'desktop', viewport: { width: 1440, height: 900 } },
  { name: 'phone', viewport: { width: 390, height: 844 } },
]) {
  test.describe(`transport deck at ${name} width`, () => {
    test.use({ viewport });

    test('is stamped in the border band, clear of the drawing', async ({ page }) => {
      const stack = spaceBuilderStack(page);
      await stack.evaluate((el) => el.scrollIntoView({ block: 'center' }));
      const front = frontPage(stack, await frontPageIndex(stack));
      await waitForSceneReady(front);

      const deck = frontDeck(stack, front);
      await expect(deck).toHaveAttribute('data-state', 'playing', { timeout: 20_000 });

      const placement = await deck.evaluate((el) => {
        // In the card, the deck is measured against the sheet it came off.
        const inCard = el.parentElement!.matches('.callout-card');
        const section = inCard
          ? el.closest('section.callout')!.querySelector('article.technical-drawing-stack > * > section')!
          : el.closest('section')!;
        const sheet = section.getBoundingClientRect();
        const box = el.getBoundingClientRect();
        const band = parseFloat(getComputedStyle(section).paddingBottom);
        const clearOf = (other: Element | null) => {
          if (!other) return false;
          const b = other.getBoundingClientRect();
          return box.right <= b.left + 1 || box.left >= b.right - 1
            || box.bottom <= b.top + 1 || box.top >= b.bottom - 1;
        };
        return {
          inCard,
          insideBand: box.top >= sheet.bottom - band - 1 && box.bottom <= sheet.bottom + 1,
          clearOfDrawing: clearOf(section.querySelector('.content')),
          clearOfTitleBlock: clearOf(section.querySelector('table')),
        };
      });
      // A phone sheet's band cannot hold the deck, so it moves under the page into the
      // callout's card instead.
      expect(placement).toEqual({
        inCard: name === 'phone',
        insideBand: name === 'desktop',
        clearOfDrawing: true,
        clearOfTitleBlock: true,
      });
    });
  });
}

// The readout's numbers are those of main at a9774c0f: the scene's home angle, then a 120 px
// drag at 0.005 rad per px. Reduced motion holds the orbit so the first reading is fixed.
test('badge page: the readout shows the home angle and follows a drag', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const stack = spaceBuilderStack(page);
  await stack.scrollIntoViewIfNeeded();
  await turnToPage(stack, 'Capacity Badge');
  const app = await waitForSceneReady(frontPage(stack, await frontPageIndex(stack)));

  const readout = app.locator('.math-card dd');
  await expect(readout).toHaveText(['50°', '4.44m', '5.39m']);

  const box = await app.locator('canvas[data-scene-canvas]').boundingBox();
  if (!box) throw new Error('the badge scene has no canvas box');
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 120, cy, { steps: 6 });
  await page.mouse.up();
  await expect(readout).toHaveText(['16°', '3.42m', '4.37m']);
});

// The sheet's grid row once grew to the note column's height, and the scene went out over the
// deck with it; the r row of the tag-offset card ran past the card's right edge. 1040 is one of
// the windows whose sheet once had too little room beside the scene for the note and the card.
for (const viewport of [{ width: 1440, height: 900 }, { width: 1040, height: 768 }]) {
  test.describe(`badge page at ${viewport.width}px`, () => {
    test.use({ viewport });

    test('the scene stays inside the frame line and the formula inside its card', async ({ page }) => {
      const stack = spaceBuilderStack(page);
      await stack.scrollIntoViewIfNeeded();
      await turnToPage(stack, 'Capacity Badge');
      const front = frontPage(stack, await frontPageIndex(stack));
      await waitForSceneReady(front);

      const { scene, frame, rows } = await front.locator('section').evaluate((section) => {
        const box = section.getBoundingClientRect();
        const inset = parseFloat(getComputedStyle(section).paddingTop) + 1;
        const card = section.querySelector<HTMLElement>('.content > .badge-formula')!;
        const cardRight = card.getBoundingClientRect().right - parseFloat(getComputedStyle(card).paddingRight);
        return {
          scene: section.querySelector('.badge-scene-demo')!.getBoundingClientRect().toJSON(),
          frame: { left: box.left + inset, top: box.top + inset, right: box.right - inset, bottom: box.bottom - inset },
          rows: [...card.querySelectorAll('math')].map((row) =>
            Math.max(...[...row.querySelectorAll('mi, mo, mn, mtext')].map((token) => token.getBoundingClientRect().right)) - cardRight),
        };
      });
      expect(scene.left).toBeGreaterThanOrEqual(frame.left);
      expect(scene.top).toBeGreaterThanOrEqual(frame.top);
      expect(scene.right).toBeLessThanOrEqual(frame.right);
      expect(scene.bottom).toBeLessThanOrEqual(frame.bottom);
      for (const past of rows) expect(past).toBeLessThanOrEqual(0.5);
    });
  });
}

// The title block is wider than the note column, and the scene's bottom-right corner ran under
// it at every landscape width; the note and the tag-offset card beside the scene ran under it
// between about 990 and 1110 px. The note is a plain note, shown in place wherever the sheet is
// wider than 56em, and the card is a strip under the scene that ends at the block's left edge,
// or sits in the note's column above the block where the note is tucked under the corner.
// Layout boxes, not client rects: the block's tilt would widen its rect.
for (const viewport of [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 963, height: 768 },
  { width: 1000, height: 768 },
  { width: 1100, height: 768 },
  { width: 1440, height: 900 },
]) {
  test.describe(`badge page at ${viewport.width}px`, () => {
    test.use({ viewport });

    test('the scene, the card and the note stay clear of the title block', async ({ page }) => {
      const stack = spaceBuilderStack(page);
      await stack.scrollIntoViewIfNeeded();
      await turnToPage(stack, 'Capacity Badge');
      const section = frontPage(stack, await frontPageIndex(stack)).locator('section');

      await expect(section.locator('.note-card > aside')).toHaveCount(1);
      if (viewport.width >= 1000) {
        await expect(section.locator('.note-card > aside')).toBeVisible();
        await expect(section.locator('.content > .badge-formula')).toBeVisible();
        await expect(section.locator('.note-fold')).toBeHidden();
      }

      const overlaps = await section.evaluate((sheet) => {
        const box = (el: HTMLElement) => {
          let left = 0;
          let top = 0;
          for (let e: HTMLElement | null = el; e && e !== sheet; e = e.offsetParent as HTMLElement | null) {
            left += e.offsetLeft;
            top += e.offsetTop;
          }
          return { left, top, right: left + el.offsetWidth, bottom: top + el.offsetHeight };
        };
        const block = box(sheet.querySelector<HTMLElement>(':scope > table')!);
        return [...sheet.querySelectorAll<HTMLElement>('.badge-scene-demo, .content > .badge-formula, .note-card > aside')]
          .filter((el) => el.offsetParent)
          .map((el) => box(el))
          .map((b) => Math.min(b.right - block.left, b.bottom - block.top));
      });
      for (const overlap of overlaps) expect(overlap).toBeLessThanOrEqual(0);
    });
  });
}

// A landscape sheet 56em wide or narrower tucks the note under the corner, and the card once
// went with it, out of sight, while the note's column stood empty. The card takes that column
// now, beside the scene and above the title block.
for (const viewport of [{ width: 700, height: 768 }, { width: 963, height: 768 }]) {
  test.describe(`badge page at ${viewport.width}px`, () => {
    test.use({ viewport });

    test('the tag-offset card sits beside the scene, above the title block', async ({ page }) => {
      const stack = spaceBuilderStack(page);
      await stack.scrollIntoViewIfNeeded();
      await turnToPage(stack, 'Capacity Badge');
      const section = frontPage(stack, await frontPageIndex(stack)).locator('section');

      await expect(section.locator('.note-fold')).toBeVisible();
      await expect(section.locator('.content > .badge-formula')).toBeVisible();
      const gaps = await section.evaluate((sheet) => {
        const box = (el: HTMLElement) => {
          let left = 0;
          let top = 0;
          for (let node: HTMLElement | null = el; node && node !== sheet; node = node.offsetParent as HTMLElement | null) {
            left += node.offsetLeft;
            top += node.offsetTop;
          }
          return { left, top, right: left + el.offsetWidth, bottom: top + el.offsetHeight };
        };
        const block = box(sheet.querySelector<HTMLElement>(':scope > table')!);
        const scene = box(sheet.querySelector<HTMLElement>('.badge-scene-demo')!);
        const card = sheet.querySelector<HTMLElement>('.content > .badge-formula')!;
        const c = box(card);
        return { beside: c.left - scene.right, above: block.top - c.bottom, inside: block.right - c.right, spill: card.scrollWidth - card.clientWidth };
      });
      expect(gaps.beside).toBeGreaterThan(0);
      expect(gaps.above).toBeGreaterThan(0);
      expect(gaps.inside).toBeGreaterThanOrEqual(0);
      expect(gaps.spill).toBeLessThanOrEqual(0);
    });
  });
}

// A portrait sheet has no room for the card beside or under the scene, and the card was shown
// nowhere there. It is in the note now, after the note's own text, and the corner tab opens it.
for (const viewport of [{ width: 554, height: 891 }, { width: 390, height: 768 }]) {
  test.describe(`badge page at ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport });

    test('the tag-offset card is in the note the corner tab opens', async ({ page }) => {
      const stack = spaceBuilderStack(page);
      await stack.scrollIntoViewIfNeeded();
      await turnToPage(stack, 'Capacity Badge');
      const section = frontPage(stack, await frontPageIndex(stack)).locator('section');

      await expect(section.locator('.content > .badge-formula')).toBeHidden();
      await section.locator('.note-fold').evaluate((tab: HTMLElement) => tab.click());
      const card = section.locator('.drawing-note .note-card > .badge-formula');
      await expect(card).toBeVisible();
      const fit = await card.evaluate((el) => {
        const note = el.closest('dialog')!.getBoundingClientRect();
        const box = el.getBoundingClientRect();
        const text = el.parentElement!.querySelector('aside')!.getBoundingClientRect();
        return { spill: el.scrollWidth - el.clientWidth, left: box.left - note.left, right: note.right - box.right, after: box.top - text.top };
      });
      expect(fit.spill).toBeLessThanOrEqual(0);
      expect(fit.left).toBeGreaterThanOrEqual(0);
      expect(fit.right).toBeGreaterThanOrEqual(0);
      expect(fit.after).toBeGreaterThan(0);
    });
  });
}
