import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const THEMES = ['light', 'dark', 'arctic', 'dark-forest'];

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

const VIEWPORTS = [
  { name: '1440x900', width: 1440, height: 900 },
  { name: '390x844', width: 390, height: 844 },
];

// Colour contrast and structure read the same either way, and a still page is the one
// axe can measure: the demos' autoplay otherwise repaints the canvases underneath it.
test.use({ reducedMotion: 'reduce' });

for (const viewport of VIEWPORTS) {
  test.describe(viewport.name, () => {
    // The narrow viewport stands in for a phone: the stage buttons' target size is gated
    // behind @media (pointer: coarse), so this check needs a touch context to see the row
    // a touch visitor gets. A mouse that can point accurately is not held to the same
    // rule (Hugo's call, #228 round 2).
    if (viewport.width === 390) {
      test.use({ hasTouch: true });
    }

    for (const theme of THEMES) {
      test(`${viewport.name} in the ${theme} theme has no axe violations`, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.addInitScript((value) => localStorage.setItem('cv-theme', value), theme);

        await page.goto('/');
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);

        // Scan the page a reader would have in front of them: every stack booted, every
        // island mounted. Same settle as e2e/home.spec.ts.
        const stacks = page.locator('article.technical-drawing-stack');
        expect(await stacks.count(), 'the page shows no demo stack').toBeGreaterThan(0);
        for (const stack of await stacks.all()) {
          await stack.scrollIntoViewIfNeeded();
        }
        await page.waitForTimeout(2000);

        // axe's defaults leave WCAG 2.2 out, and with it target-size (2.5.8).
        const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();

        expect(
          violations.map((violation) => ({
            id: violation.id,
            impact: violation.impact,
            nodes: violation.nodes.map((node) => node.target.join(' ')),
          })),
        ).toEqual([]);
      });
    }
  });
}
