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
  await page.waitForTimeout(500);

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
