import { expect, test } from '@playwright/test';

// The Career and Open Source rules were container queries on their sections. They are now
// media queries at the window widths src/scss/_page-column.scss derives from Layout.astro's
// page column. This spec checks that derivation against the browser: it measures each
// section's content box as the window grows, and at every width where a rule's old
// container condition turns over, the rule has to turn over too, at the same pixel. A change
// to the column that the Sass does not carry through moves one of the two and not the other.

type Section = '#career' | '#open-source';

type Rule = {
  name: string;
  section: Section;
  // The old `@container (width <op> <rem>)`.
  op: '>=' | '<' | '<=';
  rem: number;
  // An element the rule styles, the property it sets, and whether a computed value is the
  // rule's own.
  target: string;
  property: string;
  applied: (value: string) => boolean;
  // Where the property alone cannot tell this rule from another one: check this rule only
  // where that rule holds (or does not hold).
  only?: { where: string; holds: boolean };
};

const tracks = (value: string) => (value === 'none' ? 0 : value.trim().split(/\s+/).length);

const RULES: Rule[] = [
  {
    name: 'Career notes beside the table',
    section: '#career',
    op: '>=',
    rem: 52,
    target: '#career .sheet-body',
    property: 'grid-template-columns',
    applied: (v) => tracks(v) === 2,
  },
  {
    name: 'Career wide drawing',
    section: '#career',
    op: '>=',
    rem: 44,
    target: '#career .elevation .wide',
    property: 'display',
    applied: (v) => v !== 'none',
  },
  {
    name: 'Career table without its head',
    section: '#career',
    op: '<',
    rem: 36,
    target: '#career .table .head',
    property: 'display',
    applied: (v) => v === 'none',
  },
  {
    name: 'Career cells under the table',
    section: '#career',
    op: '<',
    rem: 52,
    target: '#career .cells',
    property: 'grid-template-columns',
    applied: (v) => tracks(v) === 2,
    only: { where: 'Career cells one to a line', holds: false },
  },
  {
    name: 'Career cells one to a line',
    section: '#career',
    op: '<',
    rem: 30,
    target: '#career .cells',
    property: 'grid-template-columns',
    applied: (v) => tracks(v) === 1,
    // Beside the table the cells are one column too, of the implicit grid.
    only: { where: 'Career cells under the table', holds: true },
  },
  {
    name: 'Open Source margin at half width',
    section: '#open-source',
    op: '<=',
    rem: 50,
    target: '#open-source section[data-group]',
    property: '--margin-x',
    applied: (v) => ['1.75rem', '0rem'].includes(v.trim()),
  },
  {
    name: 'Open Source margin gone',
    section: '#open-source',
    op: '<=',
    rem: 40,
    target: '#open-source section[data-group]',
    property: '--margin-x',
    applied: (v) => v.trim() === '0rem',
  },
  {
    name: 'Open Source wider ruling',
    section: '#open-source',
    op: '<=',
    rem: 34,
    target: '#open-source section[data-group]',
    property: '--line-height',
    applied: (v) => v.trim() === '1.5rem',
  },
  {
    name: 'Open Source header stacked',
    section: '#open-source',
    op: '<=',
    rem: 50,
    target: '#open-source header:has(.sheet-code)',
    property: 'grid-template-columns',
    applied: (v) => tracks(v) === 1,
  },
  {
    name: 'Highlight marks in a column',
    section: '#open-source',
    op: '<=',
    rem: 50,
    target: '#open-source article[id^="highlight-"]',
    property: 'grid-template-columns',
    // The marks' column is 5rem.
    applied: (v) => v.startsWith('80px '),
    only: { where: 'Highlight marks in a row', holds: false },
  },
  {
    name: 'Highlight marks in a row',
    section: '#open-source',
    op: '<=',
    rem: 30,
    target: '#open-source article[id^="highlight-"] > dl',
    property: 'grid-row-start',
    // Beside the marks it is on the first row; under them on the second, or the third once the
    // title is under the marks too.
    applied: (v) => v !== '1',
  },
  {
    name: 'Highlight title under the marks',
    section: '#open-source',
    op: '<=',
    rem: 16,
    target: '#open-source article[id^="highlight-"] > header',
    property: 'grid-row-start',
    applied: (v) => v === '2',
  },
];

// Every rule's old threshold is met somewhere in here: the widest, 52rem of Career sheet,
// is a window under 1000px.
const FROM = 250;
const TO = 1100;
// Coarse steps, then every pixel of a step in which anything changed. Every stretch of window
// between two changes is wider than a step, so no step holds a change and its undoing.
const STEP = 4;

type Sample = { client: number; inner: number; widths: Record<Section, number>; values: string[] };

test.use({ javaScriptEnabled: false });

test('each converted rule turns over at the window width where its section crosses the old threshold', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: FROM, height: 800 });
  await page.goto('/');
  // The other bands have no say in the column's width, and laying them out again at each of
  // some 300 widths is most of the spec's time.
  await page.evaluate(() => {
    const style = document.createElement('style');
    style.textContent = '#main > :not(#career, #open-source) { display: none !important; }';
    document.head.append(style);
  });

  const targets = RULES.map(({ target, property }) => ({ target, property }));
  const samples = new Map<number, Sample>();
  const sample = async (width: number) => {
    const known = samples.get(width);
    if (known) return known;
    await page.setViewportSize({ width, height: 800 });
    const measured = await page.evaluate((targets) => {
      const content = (selector: string) => {
        const element = document.querySelector(selector)!;
        const style = getComputedStyle(element);
        const inset = ['padding-left', 'padding-right', 'border-left-width', 'border-right-width']
          .map((property) => parseFloat(style.getPropertyValue(property)))
          .reduce((a, b) => a + b, 0);
        return element.getBoundingClientRect().width - inset;
      };
      return {
        client: document.documentElement.clientWidth,
        inner: window.innerWidth,
        widths: { '#career': content('#career'), '#open-source': content('#open-source') },
        values: targets.map(({ target, property }) =>
          getComputedStyle(document.querySelector(target)!).getPropertyValue(property),
        ),
      };
    }, targets);
    samples.set(width, measured);
    return measured;
  };

  const holds = (rule: Rule, s: Sample) => {
    const width = s.widths[rule.section];
    const threshold = rule.rem * 16;
    if (rule.op === '>=') return width >= threshold;
    if (rule.op === '<') return width < threshold;
    return width <= threshold;
  };
  const state = (s: Sample) => RULES.map((rule, i) => `${holds(rule, s)}:${s.values[i]}`).join('|');

  for (let width = FROM; width < TO; width += STEP) {
    const [a, b] = [await sample(width), await sample(width + STEP)];
    if (state(a) === state(b)) continue;
    for (let w = width + 1; w < width + STEP; w++) await sample(w);
  }

  const widths = [...samples.keys()].sort((a, b) => a - b);
  // A classic scrollbar narrows the section and not the window, which only the container
  // saw. Headless Chrome has none.
  for (const w of widths) expect(samples.get(w)!.client, `no classic scrollbar at ${w}px`).toBe(w);

  const index = new Map(RULES.map((rule, i) => [rule.name, i]));
  for (const [i, rule] of RULES.entries()) {
    const crossings: number[] = [];
    for (const [k, w] of widths.entries()) {
      const s = samples.get(w)!;
      if (!rule.only || holds(RULES[index.get(rule.only.where)!], s) === rule.only.holds) {
        expect(
          rule.applied(s.values[i]),
          `${rule.name} at ${w}px: the section is ${s.widths[rule.section]}px, ${rule.property} is ${s.values[i]}`,
        ).toBe(holds(rule, s));
      }
      const before = widths[k - 1];
      if (before === w - 1 && holds(rule, samples.get(before)!) !== holds(rule, s)) crossings.push(w);
    }
    // Without a crossing in the range the check above proves nothing about the boundary.
    expect(crossings.length, `${rule.name} turns over between ${FROM}px and ${TO}px`).toBeGreaterThan(0);
    for (const w of crossings) {
      expect(
        rule.applied(samples.get(w - 1)!.values[i]) !== rule.applied(samples.get(w)!.values[i]),
        `${rule.name} flips between ${w - 1}px and ${w}px`,
      ).toBe(true);
    }
  }
});
