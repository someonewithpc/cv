import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 1440, height: 1000 } });

// page.pdf output cannot be read back here, so the spec reads the @page rule the PDF is drawn from.
const pageRules = () =>
  [...document.styleSheets].flatMap((sheet) =>
    [...sheet.cssRules]
      .flatMap((rule) => (rule instanceof CSSMediaRule ? [...rule.cssRules] : [rule]))
      .filter((rule): rule is CSSPageRule => rule instanceof CSSPageRule)
      .map((rule) => ({ media: sheet.media.mediaText, margin: rule.style.margin, text: rule.cssText })),
  );

test('every printed page carries the name, hsal.es and the page number in its top margin', async ({ page }) => {
  await page.goto('/');
  await page.emulateMedia({ media: 'print' });

  const rules = await page.evaluate(pageRules);
  expect(rules).toHaveLength(1);
  const [rule] = rules;
  expect(rule.media).toBe('print');
  expect(rule.margin).toBe('1cm');
  expect(rule.text).toMatch(/@top-left\s*{[^}]*content:\s*"Hugo Sales · https:\/\/hsal\.es"[^}]*font:\s*8pt monospace/);
  expect(rule.text).toMatch(/@top-right\s*{[^}]*content:\s*counter\(page\) " \/ " counter\(pages\)[^}]*font:\s*8pt monospace/);

  const pdf = await page.pdf({ format: 'A4', printBackground: false });
  expect(pdf.byteLength).toBeGreaterThan(0);
});

test('a career row prints whole on one page', async ({ page }) => {
  await page.goto('/');
  await page.emulateMedia({ media: 'print' });

  const breaks = await page.locator('#career .row').evaluateAll((rows) => rows.map((row) => getComputedStyle(row).breakInside));
  expect(breaks.length).toBeGreaterThan(0);
  for (const value of breaks) {
    expect(value).toBe('avoid');
  }
});
