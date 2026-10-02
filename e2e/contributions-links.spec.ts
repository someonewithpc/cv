import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('every contribution row wears the external-link mark, and none nests a link in its summary', async ({ page }) => {
  const rows = page.locator('#open-source .row');
  const count = await rows.count();
  expect(count).toBeGreaterThan(0);

  // A link inside <summary> nests one control in another; the summary lies under
  // the row head instead, with the title link raised above it.
  expect(await page.locator('#open-source .row summary a').count()).toBe(0);
  expect(await page.locator('#open-source .row > .meta > a.title').count()).toBe(count);

  const marks = await rows.evaluateAll((els) =>
    els.map((el) => {
      const svg = el.querySelector('a.title svg.external-link');
      if (!svg) return null;
      const box = svg.getBoundingClientRect();
      return {
        width: box.width,
        height: box.height,
        hidden: svg.getAttribute('aria-hidden'),
        resolves: !!svg.querySelector('use, symbol'),
      };
    }),
  );
  expect(marks.filter((mark) => mark === null)).toEqual([]);
  for (const mark of marks) {
    expect(mark!.width).toBeGreaterThan(0);
    expect(mark!.height).toBeGreaterThan(0);
    expect(mark!.hidden).toBe('true');
    expect(mark!.resolves).toBe(true);
  }
});

test('the row title is underlined in its own ink and the mark is not', async ({ page }) => {
  const title = page.locator('#open-source .row a.title').first();
  const text = title.locator('.title-text');

  await expect(text).toHaveCSS('text-decoration-line', 'underline');

  const styles = await title.evaluate((el) => {
    const textSpan = el.querySelector('.title-text')!;
    const mark = el.querySelector('svg.external-link')!;
    const textStyle = getComputedStyle(textSpan);
    return {
      color: textStyle.color,
      decorationColor: textStyle.textDecorationColor,
      markDecoration: getComputedStyle(mark).textDecorationLine,
    };
  });
  // Its own ink, not a link colour.
  expect(styles.decorationColor).toBe(styles.color);
  expect(styles.markDecoration).toBe('none');
});

test('the title links to the contribution and the rest of the row toggles it open', async ({ page, context }) => {
  const row = page.locator('#open-source .row').first();
  const details = row.locator('details');
  const link = row.locator('a.title');

  await expect(link).toHaveAttribute('href', /^https:\/\//);
  await expect(link).toHaveAttribute('target', '_blank');

  await row.scrollIntoViewIfNeeded();
  const [opened] = await Promise.all([context.waitForEvent('page'), link.click()]);
  expect(opened.url()).toBe(await link.getAttribute('href'));
  await opened.close();
  // Following the link must not also work the disclosure.
  await expect(details).not.toHaveAttribute('open', /.*/);

  const cite = await row.locator('cite').boundingBox();
  await page.mouse.click(cite!.x + 4, cite!.y + cite!.height / 2);
  await expect(details).toHaveAttribute('open', /.*/);
});

test('the disclosure answers the keyboard and is named after the contribution', async ({ page }) => {
  const row = page.locator('#open-source .row').first();
  const details = row.locator('details');
  const summary = row.locator('summary');
  const link = row.locator('a.title');

  const repository = (await row.locator('cite').textContent())!.trim();
  const escaped = repository.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  await expect(summary).toHaveAttribute('aria-label', new RegExp(`^${escaped}: `));

  await summary.focus();
  await page.keyboard.press('Enter');
  await expect(details).toHaveAttribute('open', /.*/);
  await page.keyboard.press('Enter');
  await expect(details).not.toHaveAttribute('open', /.*/);

  // Right moves from the toggle to the title link and Left back again.
  await page.keyboard.press('ArrowRight');
  await expect(link).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(summary).toBeFocused();
});

test('each group of contributions is one Tab stop, and the arrows walk its rows', async ({ page }) => {
  const groups = page.locator('#open-source .lines');
  await expect(groups).toHaveCount(3);
  for (const group of await groups.all()) {
    await expect(group.locator('[tabindex="0"]')).toHaveCount(1);
  }

  const lines = groups.first();
  const rows = lines.locator('.row');
  const first = rows.first().locator('summary');
  await first.focus();
  await page.keyboard.press('ArrowDown');
  await expect(rows.nth(1).locator('summary')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(rows.nth(1).locator('a.title')).toBeFocused();
  await page.keyboard.press('End');
  await expect(rows.last().locator('a.title')).toBeFocused();
  await page.keyboard.press('Home');
  await expect(rows.first().locator('a.title')).toBeFocused();
});
