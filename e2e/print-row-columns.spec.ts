import { expect, test } from '@playwright/test';

// The printable width of A4 and Letter at 96px to the inch, the width Chrome lays a page out at.
for (const [paper, width] of [['A4', 794], ['Letter', 816]] as const) {
  test(`on ${paper} each contribution table spans the band, its repo column fits the names and the title takes the rest`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1100 });
    await page.goto('/');
    await page.emulateMedia({ media: 'print' });

    const groups = await page.locator('#open-source section[data-group]').evaluateAll((sections) =>
      sections.map((section) => {
        const box = (el: Element) => el.getBoundingClientRect();
        const lines = section.querySelector('.lines')!;
        const header = [...lines.querySelectorAll(':scope > header span')].map((span) => Math.round(box(span).left));
        const rows = [...lines.querySelectorAll(':scope > .row')].map((row) => {
          const cite = row.querySelector('cite')!;
          const title = row.querySelector('.title')!;
          return {
            reference: cite.textContent!,
            citeLines: Math.round(box(cite).height / parseFloat(getComputedStyle(cite).lineHeight)),
            citeLeft: Math.round(box(cite).left),
            titleLeft: Math.round(box(title).left),
            right: Math.round(box(row).right),
            marksRight: Math.round(box(row.querySelector('ul')!).right),
            tracks: getComputedStyle(row).gridTemplateColumns.split(' ').map(parseFloat),
          };
        });
        return { id: section.getAttribute('data-group'), section: [box(section).left, box(section).right].map(Math.round), lines: [box(lines).left, box(lines).right].map(Math.round), header, rows };
      }),
    );

    expect(groups.map(({ id }) => id)).toEqual(['merged', 'open', 'closed']);
    for (const group of groups) {
      // No margin and no paper beside the writing: the table is as wide as the band.
      expect(group.lines, group.id!).toEqual(group.section);

      for (const row of group.rows) {
        // A name up to 48 characters, withastro/compiler-rs#61 and DefinitelyTyped's included,
        // stays on one line; only a longer one wraps.
        expect(row.citeLines, row.reference).toBe(row.reference.length > 48 ? 2 : 1);
        expect(row.titleLeft, row.reference).toBe(group.rows[0].titleLeft);
        expect(row.right, row.reference).toBe(group.lines[1]);
        // The marks fit their column.
        expect(row.marksRight, row.reference).toBeLessThanOrEqual(row.citeLeft);
      }

      // The repo column is no wider than the longest name that fits on one line, so the
      // title column gets every pixel left over.
      const [, repo] = group.rows[0].tracks;
      const charWidth = await page.locator(`#open-source section[data-group="${group.id}"] cite`).first().evaluate((cite) => {
        const probe = document.createElement('span');
        probe.textContent = '0'.repeat(10);
        probe.style.whiteSpace = 'nowrap';
        cite.append(probe);
        const w = probe.getBoundingClientRect().width / 10;
        probe.remove();
        return w;
      });
      const longest = Math.max(...group.rows.map(({ reference }) => reference.length).filter((n) => n <= 48));
      expect(repo, group.id!).toBeCloseTo(longest * charWidth, 0);

      // The column labels stand over their columns.
      expect(group.header[1], group.id!).toBe(group.rows[0].citeLeft);
      expect(group.header[2], group.id!).toBe(group.rows[0].titleLeft);
    }
  });
}
