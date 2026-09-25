import { readFileSync } from 'node:fs';

import { expect, test } from '@playwright/test';

type Edge = { date: string; label: string };
type Site = {
  experience: { id: string; org: string; from: Edge; to: Edge }[];
  education: { degree: string; school: string };
  languages: { name: string }[];
  refs: { label: string; href: string }[];
};

// Read rather than imported: Node's ESM loader wants an import attribute on a JSON module.
const site: Site = JSON.parse(readFileSync(new URL('../src/components/Career/site.json', import.meta.url), 'utf8'));

/**
 * The Career sheet is drawn from site.json, so what could break is the drawing itself: a row
 * that the data has and the sheet does not, or a sheet that no longer fits a phone.
 */

test('the revision table lists every role in the data, newest first', async ({ page }) => {
  await page.goto('/');

  const rows = page.locator('#career .row');
  await expect(rows).toHaveCount(site.experience.length);

  for (const [index, entry] of site.experience.entries()) {
    const row = rows.nth(index);
    await expect(row).toHaveId(`career-${entry.id}`);
    await expect(row.locator('h4')).toContainText(entry.org);
    await expect(row.locator('.period time').first()).toHaveAttribute('datetime', entry.from.date);
    await expect(row.locator('.period time').last()).toHaveAttribute('datetime', entry.to.date);
  }

  // The oldest job is revision 01 and the count runs down from the top.
  await expect(rows.first().locator('.rev')).toHaveText(String(site.experience.length).padStart(2, '0'));
  await expect(rows.last().locator('.rev')).toHaveText('01');
});

test('the title block cells carry the degree, the languages and the reference sheets', async ({ page }) => {
  await page.goto('/');

  const cells = page.locator('#career .cells');
  await expect(cells).toContainText(site.education.degree);
  await expect(cells).toContainText(site.education.school);
  for (const { name } of site.languages) {
    await expect(cells).toContainText(name);
  }

  for (const { label, href } of site.refs) {
    const link = cells.getByRole('link', { name: label });
    await expect(link).toHaveAttribute('href', href);
    await expect(page.locator(href)).toHaveCount(1);
  }
});

for (const width of [390, 768, 1440]) {
  test(`at ${width}px the sheet fits the window and writes nothing under 8px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');

    const sheet = page.locator('#career');
    await sheet.scrollIntoViewIfNeeded();

    const measured = await sheet.evaluate((el) => {
      const right = el.getBoundingClientRect().right;
      let widest = 0;
      let smallest = Infinity;
      for (const node of [el, ...el.querySelectorAll('*')]) {
        widest = Math.max(widest, node.getBoundingClientRect().right);
        const size = parseFloat(getComputedStyle(node).fontSize);
        if (node.textContent?.trim()) smallest = Math.min(smallest, size);
      }
      return {
        right,
        widest,
        smallest,
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      };
    });

    expect(measured.scrollWidth, 'the page scrolls sideways').toBeLessThanOrEqual(measured.clientWidth);
    expect(measured.widest, 'something on the sheet reaches past its edge').toBeLessThanOrEqual(measured.right + 1);
    expect(measured.smallest, 'a size below 8px').toBeGreaterThanOrEqual(8);
  });
}
