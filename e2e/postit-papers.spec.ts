import { expect, test } from '@playwright/test';

// Astro renders sibling components concurrently, so a note that counted itself would take
// its paper in whatever order the render happened to finish. The papers come off the
// finished page instead; this holds that to page order without knowing the demos.
test('neighbouring notes are on different papers', async ({ page }) => {
  await page.goto('/');

  const stacks = await page.$$eval('.technical-drawing-frame', (frames) =>
    frames
      .map((frame) => [...frame.querySelectorAll<HTMLElement>('aside.marker-font')].map((note) => note.dataset.paper))
      .filter((papers) => papers.length > 0),
  );
  expect(stacks.length).toBeGreaterThan(0);

  for (const papers of stacks) {
    for (const paper of papers) expect(['peeled', 'taped']).toContain(paper);
    for (let i = 1; i < papers.length; i++) {
      expect(papers[i], `sheet ${i + 1} of ${papers.join(', ')}`).not.toBe(papers[i - 1]);
    }
  }

  const fronts = stacks.map((papers) => papers[0]);
  for (let i = 1; i < fronts.length; i++) {
    expect(fronts[i], `front notes ${fronts.join(', ')}`).not.toBe(fronts[i - 1]);
  }
});
