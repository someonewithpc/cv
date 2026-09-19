import { expect, test } from '@playwright/test';

import { frontPage, frontPageIndex, frontPageName, swipeStack, swipeToPage } from './support/paperStack';

const PAGES = ['Library Tagging Tool', 'Shared Value', 'Simulated Caret', 'Completed Objects'];

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

function taggingToolStack(page: import('@playwright/test').Page) {
  return page.locator('article.technical-drawing-stack').nth(3);
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
  await tool.locator('.property-select').selectOption('table color');
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

  // It fills the whole row from the one shared field, mirroring as it types.
  const round = tool.locator('.grouped-objects[data-group="round"]');
  await expect(round.locator('.object-value').first()).not.toHaveValue('', { timeout: 15_000 });

  await tool.hover();
  await expect(tool).toHaveAttribute('data-autoplay', 'user');
  await expect(cursor).toBeHidden();

  // Handover means handover: nothing types itself after this.
  const settled = await round.locator('.shared-value').inputValue();
  await page.waitForTimeout(1_500);
  expect(await round.locator('.shared-value').inputValue()).toBe(settled);
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
    const group = root.querySelector<HTMLElement>('.grouped-objects[data-group="round"]')!;
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
      if (group.classList.contains('completing')) return { onTick, committed: true };
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
  await expect(gold.locator('.shared-value')).toHaveAttribute('placeholder', 'Overrides: White and Beige');

  // Hovering the warning sign has to say what it is warning about.
  const title = await gold.locator('.shared-form button').getAttribute('title');
  expect(title).toContain('do not all have the same value');
  expect(title).toContain('overwrites the variants with the base value');
});

test('main page: picking another property brings up the values already stored for it', async ({ page }) => {
  const { tool } = await mountedTool(page);

  const round = tool.locator('.grouped-objects[data-group="round"]');
  await tool.locator('.property-select').selectOption('linen');

  await expect(round.locator('.object-value').first()).toHaveValue('Ivory Satin');
  await expect(round.locator('.shared-value')).toHaveAttribute('placeholder', 'Overrides: Ivory Satin');

  // The last variant has no linen value, which is why the object is still listed.
  await expect(round.locator('.object-value').last()).toHaveValue('');
});

test('shared value page: the mirroring blueprint diagram is shown', async ({ page }) => {
  const stack = taggingToolStack(page);
  await stack.scrollIntoViewIfNeeded();
  await swipeToPage(page, stack, 'Shared Value');
  const front = frontPage(stack, await frontPageIndex(stack));
  await expect(front.locator('section.blueprint')).toBeVisible();
});

test('simulated caret page: the caret-math blueprint diagram is shown', async ({ page }) => {
  const stack = taggingToolStack(page);
  await stack.scrollIntoViewIfNeeded();
  await swipeToPage(page, stack, 'Simulated Caret');
  const front = frontPage(stack, await frontPageIndex(stack));
  await expect(front.locator('section.blueprint')).toBeVisible();
});

test('completed objects page: the leaving-the-list blueprint diagram is shown', async ({ page }) => {
  const stack = taggingToolStack(page);
  await stack.scrollIntoViewIfNeeded();
  await swipeToPage(page, stack, 'Completed Objects');
  const front = frontPage(stack, await frontPageIndex(stack));
  // This page also embeds a non-live Grid for illustration, which has its own
  // .grouped-objects blocks; scope to the page's own blueprint section.
  await expect(front.locator('section.blueprint')).toBeVisible();
  await expect(front.locator('.grouped-objects.completing')).toHaveCount(1);
});
