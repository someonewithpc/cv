import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const THEMES = ['light', 'dark', 'arctic', 'dark-forest'];

const VIEWPORTS = [
  { name: '1440x900', width: 1440, height: 900 },
  { name: '390x844', width: 390, height: 844 },
];

// Colour contrast and structure read the same either way, and a still page is the one
// axe can measure: the demos' autoplay otherwise repaints the canvases underneath it.
test.use({ reducedMotion: 'reduce' });

for (const viewport of VIEWPORTS) {
  for (const theme of THEMES) {
    test(`${viewport.name} in the ${theme} theme has no axe violations`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.addInitScript((value) => localStorage.setItem('cv-theme', value), theme);

      await page.goto('/');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);

      // Scan the page a reader would have in front of them: every stack booted, every
      // island mounted. Same settle as e2e/home.spec.ts.
      const stacks = page.locator('article.technical-drawing-stack');
      await expect(stacks).toHaveCount(3);
      for (const stack of await stacks.all()) {
        await stack.scrollIntoViewIfNeeded();
      }
      await page.waitForTimeout(2000);

      const { violations } = await new AxeBuilder({ page }).analyze();

      expect(
        violations.map((violation) => ({
          id: violation.id,
          impact: violation.impact,
          nodes: violation.nodes.map((node) => node.target.join(' ')),
        })),
      ).toEqual([]);
    });
  }
}
