import { expect, test } from '@playwright/test';

// The printable width of A4 and Letter at 96px to the inch, the width Chrome lays a page out at.
for (const [paper, width] of [['A4', 794], ['Letter', 816]] as const) {
  test(`on ${paper} the printed picks span the band, their repo column fits the names and the title takes the rest`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1100 });
    await page.goto('/');
    await page.emulateMedia({ media: 'print' });

    const { band, header, rows } = await page.locator('#open-source').evaluate((section) => {
      const box = (el: Element) => el.getBoundingClientRect();
      const shown = (el: Element) => getComputedStyle(el).display !== 'none';
      const head = [...section.querySelectorAll('.lines > header')].find(shown)!;
      return {
        band: [box(section).left, box(section).right].map(Math.round),
        header: [...head.querySelectorAll('span')].map((span) => Math.round(box(span).left)),
        rows: [...section.querySelectorAll('.row')].filter(shown).map((row) => {
          const cite = row.querySelector('cite')!;
          const title = row.querySelector('.title')!;
          return {
            reference: cite.textContent!,
            citeLines: Math.round(box(cite).height / parseFloat(getComputedStyle(cite).lineHeight)),
            citeLeft: Math.round(box(cite).left),
            titleLeft: Math.round(box(title).left),
            edges: [box(row).left, box(row).right].map(Math.round),
            marksRight: Math.round(box(row.querySelector('ul')!).right),
            tracks: getComputedStyle(row).gridTemplateColumns,
          };
        }),
      };
    });

    expect(rows.length).toBe(12);
    for (const row of rows) {
      // No margin and no paper beside the writing: each pick is as wide as the band.
      expect(row.edges, row.reference).toEqual(band);
      // Picks from every group share one set of columns, so the titles line up down the list.
      expect(row.tracks, row.reference).toBe(rows[0].tracks);
      expect(row.titleLeft, row.reference).toBe(rows[0].titleLeft);
      // A name up to 32 characters, withastro/compiler-rs#61 included, stays on one line; a
      // longer one wraps at its slash.
      expect(row.citeLines, row.reference).toBe(row.reference.length > 32 ? 2 : 1);
      expect(row.marksRight, row.reference).toBeLessThanOrEqual(row.citeLeft);
    }

    // The repo column is no wider than the longest printed name that fits on one line, so the
    // title column gets every pixel left over.
    const repo = parseFloat(rows[0].tracks.split(' ')[1]);
    const charWidth = await page.locator('#open-source .row[data-print] cite').first().evaluate((cite) => {
      const probe = document.createElement('span');
      probe.textContent = '0'.repeat(10);
      probe.style.whiteSpace = 'nowrap';
      cite.append(probe);
      const w = probe.getBoundingClientRect().width / 10;
      probe.remove();
      return w;
    });
    const longest = Math.max(...rows.map(({ reference }) => reference.length).filter((n) => n <= 32));
    expect(longest).toBe('withastro/compiler-rs#61'.length);
    expect(repo).toBeCloseTo(longest * charWidth, 0);

    // The column labels stand over their columns.
    expect(header[1]).toBe(rows[0].citeLeft);
    expect(header[2]).toBe(rows[0].titleLeft);
  });
}
