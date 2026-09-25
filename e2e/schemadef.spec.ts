import { expect, test, type Page } from '@playwright/test';

import { frontPage, frontPageIndex, frontPageName, swipeStack } from './support/paperStack';

const PAGES = ['schemaDef → Doctrine Metadata', 'Type Vocabulary', 'Plugin Entities', 'Static Analysis'];

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

function schemaDefStack(page: Page) {
  // By title, not by position: the demos run gains stacks over time.
  return page.locator('article.technical-drawing-stack').filter({
    has: page.locator('h2.typewriter', { hasText: 'Doctrine Metadata' }),
  });
}

async function mountedPanes(page: Page) {
  const stack = schemaDefStack(page);
  await stack.scrollIntoViewIfNeeded();
  const front = frontPage(stack, await frontPageIndex(stack));
  await expect(front.locator('[data-schemadef-demo]')).toHaveAttribute('data-mounted', 'true', { timeout: 15_000 });
  const root = front.locator('[data-schemadef]');
  await expect(root).toHaveAttribute('data-enhanced', 'true');
  return {
    root,
    php: root.locator('[data-pane="php"]'),
    sql: root.locator('[data-pane="sql"]'),
  };
}

test('schemaDef: forward swipes visit every page in order', async ({ page }) => {
  const stack = schemaDefStack(page);
  await stack.scrollIntoViewIfNeeded();
  // fold-drag.ts labels the stack as it attaches the swipe handlers, so a swipe after this lands.
  await expect(stack).toHaveAttribute('aria-roledescription', 'paper stack');

  expect(await stack.locator(':scope > div').count()).toBe(PAGES.length);
  expect(await frontPageName(stack)).toBe(PAGES[0]);

  for (let i = 1; i < PAGES.length; i += 1) {
    await swipeStack(page, stack, true);
    expect(await frontPageName(stack), `page ${i} after ${i} forward swipe(s)`).toBe(PAGES[i]);
  }
});

test('schemaDef: the right pane is the left one run through the driver', async ({ page }) => {
  const { php, sql } = await mountedPanes(page);

  // The real Actor entity, and the specifics that make it read as one.
  await expect(php.locator('[data-key="field:lat"]')).toContainText("'precision' => 10, 'scale' => 7");
  await expect(sql.locator('[data-key="field:lat"]')).toContainText("lat NUMERIC(10, 7) DEFAULT NULL COMMENT 'latitude'");
  await expect(sql.locator('[data-key="field:id"]')).toContainText('id INT AUTO_INCREMENT NOT NULL');
  await expect(sql.locator('[data-key="field:nickname"]')).toContainText('VARCHAR(64) NOT NULL');
  await expect(sql.locator('[data-key="index:actor_nickname_idx"]')).toContainText('INDEX actor_nickname_idx (nickname)');

  // The fulltext index is in the array but the driver never reads it; the SQL says so.
  await expect(php.locator('[data-key="fulltext:actor_fulltext_idx"]').last())
    .toContainText("['nickname', 'fullname', 'location', 'bio', 'homepage']");
  await expect(sql.locator('[data-key="fulltext:actor_fulltext_idx"]')).toContainText('not read by SchemaDefDriver');
});

test('schemaDef: hovering a line lights its counterpart and its rule, and takes over', async ({ page }) => {
  const { root, php, sql } = await mountedPanes(page);

  const lat = php.locator('[data-key="field:lat"]');
  await lat.scrollIntoViewIfNeeded();
  await lat.hover();

  await expect(root).toHaveAttribute('data-autoplay-state', 'user');
  await expect(lat).toHaveClass(/\blit\b/);
  const counterpart = sql.locator('[data-key="field:lat"]');
  await expect(counterpart).toHaveClass(/\blit\b/);
  await expect(counterpart).toBeInViewport();
  await expect(root.locator('.line.lit')).toHaveCount(2);

  const rule = root.locator('[data-rule="field:lat"]');
  await expect(rule).toBeVisible();
  await expect(rule).toContainText("'numeric'");
  await expect(rule).toContainText("'decimal'");
  await expect(root.locator('[data-rule]:visible')).toHaveCount(1);

  // The other way round: a line on the SQL side lights the PHP one.
  const created = sql.locator('[data-key="field:created"]');
  await created.scrollIntoViewIfNeeded();
  await created.hover();
  await expect(php.locator('[data-key="field:created"]')).toHaveClass(/\blit\b/);
  await expect(lat).not.toHaveClass(/\blit\b/);
});

test('schemaDef: the keyboard walks the lines and jumps across', async ({ page }) => {
  const { root, php, sql } = await mountedPanes(page);

  // One tab stop per pane.
  await expect(php.locator('.line[tabindex="0"]')).toHaveCount(1);
  await expect(sql.locator('.line[tabindex="0"]')).toHaveCount(1);

  const first = php.locator('.line[tabindex="0"]');
  await first.focus();
  await expect(root).toHaveAttribute('data-autoplay-state', 'user');
  await expect(first).toHaveAttribute('data-key', 'table');

  // Down past the table comment and the 'fields' line to the first field.
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  const id = php.locator('[data-key="field:id"]');
  await expect(id).toBeFocused();
  await expect(sql.locator('[data-key="field:id"]')).toHaveClass(/\blit\b/);

  await page.keyboard.press('ArrowRight');
  const idColumn = sql.locator('[data-key="field:id"]');
  await expect(idColumn).toBeFocused();
  await expect(idColumn).toHaveAttribute('tabindex', '0');

  await page.keyboard.press('ArrowLeft');
  await expect(id).toBeFocused();
});

test('schemaDef: the sheet says what GNU social is, and the title fits at 390', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { root } = await mountedPanes(page);
  await expect(root.locator('.intro')).toContainText('GNU social is a federated social network server');

  const stack = schemaDefStack(page);
  const title = frontPage(stack, await frontPageIndex(stack)).locator('h2.typewriter').first();
  const [scroll, client] = await title.evaluate((el) => [el.scrollWidth, el.clientWidth]);
  expect(scroll, 'the title block cuts the title').toBeLessThanOrEqual(client);
});

for (const width of [1024, 1440]) {
  test(`schemaDef: at ${width} the cards reach the title block and the text sits beside it`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const { root } = await mountedPanes(page);

    const layout = () => root.evaluate((el) => {
      const box = (node: Element | null) => node?.getBoundingClientRect() ?? null;
      const block = box(el.closest('section')?.querySelector(':scope > table') ?? null);
      const gutter = parseFloat(getComputedStyle(el).rowGap);
      const cards = [...el.querySelectorAll('[data-pane]')].map((pane) => box(pane)!);
      const text = [el.querySelector('.intro'), el.querySelector('.rules')].map((node) => box(node)!);
      if (!block) return 'no title block';
      return {
        cardsShort: cards.map((card) => Math.round(block.top - card.bottom)),
        gutter,
        textRightOfBlockLeft: text.map((t) => Math.round(t.right - block.left)),
        textAboveBlockTop: text.map((t) => Math.round(block.top - t.top)),
        textBelowBlockBottom: text.map((t) => Math.round(t.bottom - block.bottom)),
      };
    });

    await expect.poll(async () => {
      const l = await layout();
      if (typeof l === 'string') return l;
      const reach = l.cardsShort.every((short) => short >= 0 && short <= l.gutter);
      const beside = l.textRightOfBlockLeft.every((d) => d <= 0)
        && l.textAboveBlockTop.every((d) => d <= 0)
        && l.textBelowBlockBottom.every((d) => d <= 0);
      return reach && beside ? 'fits' : JSON.stringify(l);
    }).toBe('fits');
  });
}
