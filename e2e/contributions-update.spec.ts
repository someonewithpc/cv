import { expect, test } from '@playwright/test';

const GROUPS = [
  { id: 'merged', label: 'Merged' },
  { id: 'open', label: 'Open' },
  { id: 'closed', label: 'Closed' },
] as const;

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('the heading of each group counts the rows it actually has', async ({ page }) => {
  for (const { id, label } of GROUPS) {
    const rows = page.locator(`#open-source section[data-group="${id}"] .row`);
    const count = await rows.count();
    expect(count, `${label} has rows`).toBeGreaterThan(0);

    const heading = page.locator(`#open-source section[data-group="${id}"] h3 data`);
    await expect(heading).toHaveText(String(count));
  }
});

test('every row names at least one technology and draws its icon', async ({ page }) => {
  const rows = page.locator('#open-source .row');
  expect(await rows.count()).toBeGreaterThan(0);

  // A tag that no icon resolves is dropped silently by resolveTechByIconSuffix,
  // so a misspelt one shows up as a row with no icons rather than as an error.
  const icons = await rows.evaluateAll((els) =>
    els.map((el) => {
      const cite = el.querySelector('cite')?.textContent?.trim() ?? '';
      const drawn = [...el.querySelectorAll('ul .tech-icon')].map((span) => {
        const svg = span.querySelector('svg');
        const box = svg?.getBoundingClientRect();
        return {
          label: span.getAttribute('aria-label'),
          width: box?.width ?? 0,
          height: box?.height ?? 0,
        };
      });
      return { cite, drawn };
    }),
  );

  for (const { cite, drawn } of icons) {
    expect(drawn.length, `${cite} has a technology icon`).toBeGreaterThan(0);
    for (const icon of drawn) {
      expect(icon.label, `${cite} icon is named`).toBeTruthy();
      expect(icon.width, `${cite} icon has width`).toBeGreaterThan(0);
      expect(icon.height, `${cite} icon has height`).toBeGreaterThan(0);
    }
  }
});
