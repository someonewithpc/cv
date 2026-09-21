import { readFileSync } from 'node:fs';

import { expect, test } from '@playwright/test';

/** The width past which Layout.astro lays the page on a desk. */
const DESK_FROM = 1024;

/** --theme-desk per theme, as ThemePicker.astro writes it. */
const DESKS = {
  light: 'oklch(0.76 0.05 68)',
  dark: 'oklch(0.235 0.018 55)',
  arctic: 'oklch(0.81 0.013 232)',
  'dark-forest': 'oklch(0.225 0.03 75)',
} as const;

const withTheme = async (page: import('@playwright/test').Page, theme: string) => {
  await page.addInitScript((id) => {
    try {
      localStorage.setItem('cv-theme', id);
    } catch {
      /* ignore */
    }
  }, theme);
};

/** Serialised the way the browser serialises it, so the two sides compare like with like. */
const asComputedColor = (page: import('@playwright/test').Page, color: string) =>
  page.evaluate((value) => {
    const probe = document.createElement('div');
    probe.style.backgroundColor = value;
    document.body.append(probe);
    const computed = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return computed;
  }, color);

for (const [theme, desk] of Object.entries(DESKS)) {
  test(`the ${theme} desk fills main past ${DESK_FROM}px`, async ({ page }) => {
    await withTheme(page, theme);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');

    const main = page.locator('main');
    await expect(main).toHaveCSS('--theme-desk', desk);

    const background = await main.evaluate((el) => {
      const style = getComputedStyle(el);
      return { image: style.backgroundImage, color: style.backgroundColor };
    });

    // The grain is one inline SVG tile: a fine noise stretched along the grain,
    // displaced by a coarse one so the lines wander rather than band.
    expect(background.image).toContain('feTurbulence');
    expect(background.image).toContain('feDisplacementMap');
    expect(background.color).toBe(await asComputedColor(page, desk));
  });
}

test(`no desk at ${DESK_FROM}px, where the page column still fills the viewport`, async ({ page }) => {
  await withTheme(page, 'light');
  await page.setViewportSize({ width: DESK_FROM, height: 768 });
  await page.goto('/');

  const background = await page.locator('main').evaluate((el) => {
    const style = getComputedStyle(el);
    return { image: style.backgroundImage, color: style.backgroundColor };
  });

  // What main has always had: the two drafting-grid gradients over a transparent box.
  expect(background.image).not.toContain('url(');
  expect(background.image.match(/linear-gradient/g)).toHaveLength(2);
  expect(background.color).toBe('rgba(0, 0, 0, 0)');
});

for (const width of [390, 1024, 1440]) {
  test(`the home page does not scroll sideways at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/');
    await page.waitForTimeout(1000);

    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
  });
}

/** One lettered detail per demo, in order. */
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

test('the cutting mat lies under every detail and leaves the desk showing at 1440px', async ({ page }) => {
  await withTheme(page, 'light');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');

  const mat = page.locator('#demos .cutting-mat');
  await expect(mat).toHaveCount(1);

  const box = await mat.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    const stacks = [...document.querySelectorAll('article.technical-drawing-stack')]
      .map((stack) => stack.getBoundingClientRect())
      .map(({ left, right, top, bottom }) => ({ left, right, top, bottom }));
    return {
      left: rect.left,
      right: rect.right,
      top: rect.top + scrollY,
      bottom: rect.bottom + scrollY,
      viewport: document.documentElement.clientWidth,
      padding: parseFloat(style.paddingLeft),
      border: parseFloat(style.borderTopWidth),
      clip: style.backgroundClip,
      layers: style.backgroundImage.split('linear-gradient(').length - 1,
      stacks: stacks.map(({ left, right, top, bottom }) => ({ left, right, top: top + scrollY, bottom: bottom + scrollY })),
    };
  });

  // Narrower than the viewport, with desk left and right of it.
  expect(box.left).toBeGreaterThan(0);
  expect(box.right).toBeLessThan(box.viewport);
  expect(box.right - box.left).toBeLessThan(box.viewport);

  // Every stack lies on it.
  expect(box.stacks).toHaveLength(LETTERS.length);
  for (const stack of box.stacks) {
    expect(stack.left).toBeGreaterThanOrEqual(box.left);
    expect(stack.right).toBeLessThanOrEqual(box.right);
    expect(stack.top).toBeGreaterThanOrEqual(box.top);
    expect(stack.bottom).toBeLessThanOrEqual(box.bottom);
  }

  // The rim is a plain margin closed by one line: the two rulings are clipped to the content
  // box, and only the mat's own colour reaches the border box.
  expect(box.padding).toBeGreaterThanOrEqual(16);
  expect(box.border).toBe(1);
  expect(box.layers).toBe(3);
  expect(box.clip).toBe('content-box, content-box, border-box');
});

test('each demo is a lettered detail and nothing else is called out', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');

  const bubbles = page.locator('#demos .cutting-mat .callout .callout-bubble');
  await expect(bubbles).toHaveText(LETTERS);

  const callouts = page.locator('#demos .callout');
  await expect(callouts).toHaveCount(LETTERS.length);
  // Each detail encloses exactly one stack.
  for (let index = 0; index < LETTERS.length; index++) {
    await expect(callouts.nth(index).locator('article.technical-drawing-stack')).toHaveCount(1);
  }

  await expect(page.locator('#open-source .callout')).toHaveCount(0);
  await expect(page.locator('main > .callout')).toHaveCount(0);
});

test('the mat runs the full width of a phone and nothing scrolls sideways', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.waitForTimeout(1000);

  const fit = await page.locator('#demos .cutting-mat').evaluate((el) => ({
    width: el.getBoundingClientRect().width,
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    padding: parseFloat(getComputedStyle(el).paddingLeft),
  }));
  expect(fit.width).toBe(fit.clientWidth);
  expect(fit.scrollWidth).toBe(fit.clientWidth);
  // The rim shrinks to the page gutter but never away.
  expect(fit.padding).toBeGreaterThan(0);
});

/** The width from which index.astro opens a lane beside each stack for its title card. */
const CARDS_FROM = 105 * 16;

/** Every detail's card, its stack, its boundary and its leader, in page order. */
const readCards = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const px = (value: string) => {
      const probe = document.createElement('div');
      probe.style.width = value;
      document.body.append(probe);
      const width = probe.getBoundingClientRect().width;
      probe.remove();
      return width;
    };

    const mat = document.querySelector('#demos .cutting-mat')!.getBoundingClientRect();

    return {
      mat: { left: mat.left, right: mat.right },
      details: [...document.querySelectorAll<HTMLElement>('#demos .callout')].map((callout) => {
        const card = callout.querySelector<HTMLElement>('.callout-card')!;
        const leader = callout.querySelector<HTMLElement>('.callout-card-leader')!;
        const stack = callout.querySelector('article.technical-drawing-stack')!;
        const shown = getComputedStyle(card).display !== 'none';
        const pad = px(getComputedStyle(callout).getPropertyValue('--callout-pad'));
        const box = callout.getBoundingClientRect();
        const stackBox = stack.getBoundingClientRect();

        return {
          side: callout.dataset.card,
          shown,
          // The chain-line boundary is drawn this far outside the view's own box.
          boundary: { left: box.left - pad, right: box.right + pad },
          stack: { left: stackBox.left, right: stackBox.right },
          // Zero wherever the card is not drawn: it then takes no room anywhere on the page,
          // beside the view or under it.
          room: card.getBoundingClientRect().width + card.getBoundingClientRect().height,
          card: shown ? card.getBoundingClientRect() : null,
          leader: shown ? leader.getBoundingClientRect() : null,
        };
      }),
    };
  });

test('a title card stands beside every detail at 1728px, alternating sides', async ({ page }) => {
  await page.setViewportSize({ width: 1728, height: 900 });
  await page.goto('/');

  const { mat, details } = await readCards(page);
  expect(details).toHaveLength(LETTERS.length);

  for (const [index, detail] of details.entries()) {
    const letter = LETTERS[index];
    const onTheLeft = index % 2 === 0;
    expect(detail.side, `${letter} side`).toBe(onTheLeft ? 'start' : 'end');
    expect(detail.shown, `${letter} shown`).toBe(true);

    const card = detail.card!;
    const leader = detail.leader!;
    const centre = (card.left + card.right) / 2;

    if (onTheLeft) {
      expect(centre, `${letter} card centre`).toBeLessThan(detail.stack.left);
      expect(card.right, `${letter} card clear of the stack`).toBeLessThanOrEqual(detail.stack.left);
      // The leader runs from the card's near edge and ends in its arrowhead on the boundary.
      expect(leader.left, `${letter} leader starts at the card`).toBeGreaterThanOrEqual(card.right - 1);
      expect(Math.abs(leader.right - detail.boundary.left), `${letter} arrowhead`).toBeLessThanOrEqual(2);
    } else {
      expect(centre, `${letter} card centre`).toBeGreaterThan(detail.stack.right);
      expect(card.left, `${letter} card clear of the stack`).toBeGreaterThanOrEqual(detail.stack.right);
      expect(leader.right, `${letter} leader starts at the card`).toBeLessThanOrEqual(card.left + 1);
      expect(Math.abs(leader.left - detail.boundary.right), `${letter} arrowhead`).toBeLessThanOrEqual(2);
    }

    expect(card.left, `${letter} card inside the mat`).toBeGreaterThanOrEqual(mat.left);
    expect(card.right, `${letter} card inside the mat`).toBeLessThanOrEqual(mat.right);
  }
});

for (const width of [CARDS_FROM - 16, 1440, 1280, 390]) {
  test(`no title card at ${width}px, and none of it under the stack`, async ({ page }) => {
    await page.setViewportSize({ width, height: width < 800 ? 844 : 800 });
    await page.goto('/');
    await page.waitForTimeout(1000);

    const { details } = await readCards(page);
    expect(details).toHaveLength(LETTERS.length);

    for (const [index, detail] of details.entries()) {
      expect(detail.shown, `${LETTERS[index]} hidden`).toBe(false);
      expect(detail.room, `${LETTERS[index]} takes no room`).toBe(0);
    }

    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
  });
}

test('every band on the desk is a sheet of the same width, edged and lifted', async ({ page }) => {
  await withTheme(page, 'light');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');

  const sheets = await page.evaluate(() => {
    const main = document.querySelector('main')!;
    const bands = [
      // A folio stands in the desk margin, not laid down as a band. #open-source is not one
      // band of paper either: it lays down a sheet for its heading and one torn sheet of
      // ruled paper per group, which the tests below measure.
      ...[...main.children].filter((el) =>
        !el.classList.contains('full-width')
        && !el.classList.contains('folio-rail')
        && el.id !== 'open-source'),
      ...main.querySelectorAll(':scope > .full-width > *:not(.cutting-mat)'),
    ];
    return bands.map((band) => {
      const rect = band.getBoundingClientRect();
      const style = getComputedStyle(band);
      const headings = [...band.querySelectorAll('h1, h2')].map((heading) => {
        const box = heading.getBoundingClientRect();
        return { left: box.left, right: box.right, text: heading.textContent?.trim().slice(0, 24) };
      });
      return {
        name: band.id || band.tagName,
        width: rect.width,
        left: rect.left,
        right: rect.right,
        shadow: style.boxShadow,
        border: parseFloat(style.borderTopWidth),
        headings,
      };
    });
  });

  expect(sheets.length).toBeGreaterThanOrEqual(3);
  const widest = Math.max(...sheets.map((sheet) => sheet.width));
  for (const sheet of sheets) {
    expect(Math.abs(sheet.width - widest), `${sheet.name} width`).toBeLessThanOrEqual(1);
    expect(sheet.shadow, `${sheet.name} shadow`).not.toBe('none');
    expect(sheet.border, `${sheet.name} edge`).toBe(1);
    for (const heading of sheet.headings) {
      expect(heading.left, `${sheet.name} / ${heading.text} left`).toBeGreaterThanOrEqual(sheet.left);
      expect(heading.right, `${sheet.name} / ${heading.text} right`).toBeLessThanOrEqual(sheet.right);
    }
  }
});

/** Every sheet on the desk, in page order, with the heading it carries itself. */
const SHEETS = [
  // The ruby bases, without the pronunciation the rt annotations carry.
  { number: '01', id: 'profile', heading: '#profile h1 ruby span' },
  { number: '02', id: 'bill-of-materials', heading: '#tech-icon-cloud-label' },
  { number: '03', id: 'demos', heading: '#demos-heading .typewriter' },
  { number: '04', id: 'open-source', heading: '#open-source-heading .typewriter' },
];

/** The width from which Layout.astro has desk to spare for a folio. */
const FOLIO_FROM = 80 * 16;

const readFolios = (page: import('@playwright/test').Page) =>
  page.evaluate((sheets) => {
    const text = (el: Element | null) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    const box = ({ left, right, top, bottom, width, height }: DOMRect) =>
      ({ left, right, top, bottom, width, height });

    return {
      folios: [...document.querySelectorAll<HTMLElement>('.folio-rail')].map((rail) => ({
        number: text(rail.querySelector('.folio-number')),
        label: text(rail.querySelector('.folio-label')),
        hidden: rail.getAttribute('aria-hidden'),
        links: rail.querySelectorAll('a, button').length,
        shown: getComputedStyle(rail).display !== 'none',
        box: box(rail.getBoundingClientRect()),
        numeral: box(rail.querySelector('.folio-number')!.getBoundingClientRect()),
      })),
      headings: sheets.map(({ heading }) =>
        [...document.querySelectorAll(heading)].map(text).join(' ')),
      sheets: sheets.map(({ id }) => box(document.querySelector(`#${id}`)!.getBoundingClientRect())),
      // Every piece of paper the page lays down, and the mat with its stacks: what a folio
      // must stay clear of. #demos itself is the whole viewport wide and holds no ink.
      paper: [...document.querySelectorAll('#profile, #bill-of-materials, #demos > *, #open-source .intro, #open-source section[data-group], article.technical-drawing-stack')]
        .map((band) => ({ name: band.id || band.className, ...box(band.getBoundingClientRect()) })),
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    };
  }, SHEETS);

test('the desk margin carries one numbered folio per sheet, named after that sheet', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');

  const { folios, headings } = await readFolios(page);

  expect(folios.map((folio) => folio.number)).toEqual(SHEETS.map(({ number }) => number));
  expect(folios.map((folio) => folio.label)).toEqual(headings);
  // Decoration: it says nothing the sheet does not already say, and nothing can be done to it.
  for (const folio of folios) {
    expect(folio.hidden, `${folio.number} is hidden from assistive tech`).toBe('true');
    expect(folio.links, `${folio.number} is not interactive`).toBe(0);
  }
});

test('every folio stands in the desk margin beside its own sheet', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');

  const { folios, sheets, paper } = await readFolios(page);
  expect(folios).toHaveLength(SHEETS.length);
  expect(paper.length).toBeGreaterThanOrEqual(4);

  for (const [index, folio] of folios.entries()) {
    const sheet = sheets[index];
    expect(folio.shown, `${folio.number} shows`).toBe(true);
    expect(folio.box.left, `${folio.number} starts at the desk's edge`).toBeGreaterThanOrEqual(0);
    // Beside its own sheet, top to bottom, and never over anything written on the page.
    expect(folio.box.top, `${folio.number} top`).toBeCloseTo(sheet.top, 0);
    expect(folio.box.bottom, `${folio.number} bottom`).toBeCloseTo(sheet.bottom, 0);
    for (const band of paper) {
      expect(folio.box.right, `${folio.number} clear of ${band.name}`).toBeLessThanOrEqual(band.left);
    }
  }
});

test('a folio rides along while its sheet scrolls past', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');

  const before = (await readFolios(page)).folios[2];
  // The demos sheet is the tall one: 400px into it the folio has travelled but not left.
  await page.evaluate(() => {
    const demos = document.querySelector('#demos')!.getBoundingClientRect();
    window.scrollTo(0, demos.top + window.scrollY + 400);
  });
  await page.waitForTimeout(200);

  const { folios, clientWidth } = await readFolios(page);
  const after = folios[2];
  expect(after.numeral.top).toBeLessThan(before.numeral.top);
  // Stuck 1.5rem down the screen, and still on it.
  expect(after.numeral.top).toBeCloseTo(24, 0);
  expect(after.numeral.left).toBeGreaterThanOrEqual(0);
  expect(after.numeral.right).toBeLessThan(clientWidth);
});

for (const [width, height] of [[FOLIO_FROM - 16, 900], [1024, 768], [390, 844]]) {
  test(`no folio at ${width}px, where the desk has no margin to spare`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await page.waitForTimeout(1000);

    const { folios, scrollWidth, clientWidth } = await readFolios(page);
    expect(folios).toHaveLength(SHEETS.length);
    for (const folio of folios) {
      expect(folio.shown, `${folio.number} is not drawn`).toBe(false);
      expect(folio.box.width + folio.box.height, `${folio.number} takes no room`).toBe(0);
    }
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });
}

for (const width of [1440, 1920]) {
  test(`the mat keeps 3rem of itself clear around the drawings at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');

    const room = await page.evaluate(() => {
      const mat = document.querySelector('#demos .cutting-mat')!;
      const style = getComputedStyle(mat);
      const box = mat.getBoundingClientRect();
      const inside = {
        left: box.left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft),
        right: box.right - parseFloat(style.borderRightWidth) - parseFloat(style.paddingRight),
      };
      const drawn = [...document.querySelectorAll('#demos .cutting-mat article.technical-drawing-stack, #demos .cutting-mat .callout-card')]
        .filter((el) => getComputedStyle(el).display !== 'none')
        .map((el) => el.getBoundingClientRect());
      // Down the mat there is no slack to take a margin from, so the details themselves are
      // held that far off the mat's own top and bottom edge.
      const details = [...mat.children].map((el) => el.getBoundingClientRect());
      const folio = document.querySelector<HTMLElement>('.folio-rail')!;
      return {
        mat: { left: box.left, right: box.right },
        inside,
        widest: {
          left: Math.min(...drawn.map((rect) => rect.left)),
          right: Math.max(...drawn.map((rect) => rect.right)),
        },
        tallest: {
          top: Math.min(...details.map((rect) => rect.top)),
          bottom: Math.max(...details.map((rect) => rect.bottom)),
        },
        edges: { top: box.top, bottom: box.bottom },
        folioRight: folio.getBoundingClientRect().right,
      };
    });

    expect(room.widest.left - room.inside.left, 'mat clear on the left').toBeGreaterThanOrEqual(48);
    expect(room.inside.right - room.widest.right, 'mat clear on the right').toBeGreaterThanOrEqual(48);
    expect(room.tallest.top - room.edges.top, 'mat clear above').toBeGreaterThanOrEqual(48);
    expect(room.edges.bottom - room.tallest.bottom, 'mat clear below').toBeGreaterThanOrEqual(48);
    // The mat and the folio share the desk margin and never reach into each other.
    expect(room.mat.left).toBeGreaterThanOrEqual(room.folioRight);
  });
}

/** The groups site.json carries, in the order the section writes them out. */
const GROUPS = JSON.parse(
  readFileSync(new URL('../src/components/OpenSourceContributions/site.json', import.meta.url), 'utf8'),
).groups.map(({ id, items }: { id: string; items: unknown[] }) => ({ id, rows: items.length }));

/** Every ruled sheet: its paper, its tear, its pitch and the height of every row on it. */
const readSheets = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const px = (value: string) => {
      const probe = document.createElement('div');
      probe.style.width = value;
      document.body.append(probe);
      const width = probe.getBoundingClientRect().width;
      probe.remove();
      return width;
    };

    const intro = document.querySelector('#open-source .intro')!.getBoundingClientRect();

    return {
      intro: { left: intro.left, width: intro.width },
      sheets: [...document.querySelectorAll<HTMLElement>('#open-source section[data-group]')].map((sheet) => {
        const style = getComputedStyle(sheet);
        const box = sheet.getBoundingClientRect();
        return {
          id: sheet.dataset.group!,
          left: box.left,
          width: box.width,
          pitch: px(style.getPropertyValue('--rule-pitch')),
          // Paper tone, the two fibre edges, the ruling and the margin line.
          image: style.backgroundImage,
          layers: style.backgroundImage.split('linear-gradient(').length - 1,
          size: style.backgroundSize.split(', '),
          repeat: style.backgroundRepeat.split(', '),
          mask: style.maskImage,
          maskPosition: style.maskPosition,
          rows: [...sheet.querySelectorAll('.row')].map((row) => row.getBoundingClientRect().height),
        };
      }),
    };
  });

test('each group is a sheet of ruled paper torn along the top and the bottom', async ({ page }) => {
  await withTheme(page, 'light');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');

  const { intro, sheets } = await readSheets(page);
  expect(sheets.map((sheet) => sheet.id)).toEqual(GROUPS.map(({ id }: { id: string }) => id));

  for (const sheet of sheets) {
    // Fibre along both tears, the ruling, the margin line.
    expect(sheet.layers, `${sheet.id} paper`).toBe(4);
    // The ruling is one pitch-tall tile repeated down the whole sheet, so it runs on past
    // the writing and off both torn edges rather than stopping under the last row.
    expect(sheet.size[2], `${sheet.id} ruling`).toBe(`100% ${sheet.pitch}px`);
    expect(sheet.repeat[2], `${sheet.id} ruling repeats`).toBe('repeat');
    // A jagged path along the top, a different one along the bottom, and straight sides.
    expect(sheet.mask, `${sheet.id} tear`).toContain('svg');
    expect(sheet.mask.split('url(').length - 1, `${sheet.id} two tears`).toBe(2);
    // The sheets are the width of the band, laid one under the other.
    expect(Math.abs(sheet.width - intro.width), `${sheet.id} width`).toBeLessThanOrEqual(1);
    expect(Math.abs(sheet.left - intro.left), `${sheet.id} edge`).toBeLessThanOrEqual(1);
  }

  // No two sheets tear alike: each one slides its masks along by a different amount.
  const tears = sheets.map((sheet) => sheet.maskPosition);
  expect(new Set(tears).size, 'each sheet tears differently').toBe(sheets.length);
});

test('every contribution is written on the rules of its sheet at 1440px', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');

  const { sheets } = await readSheets(page);
  expect(sheets.map(({ id, rows }) => ({ id, rows: rows.length }))).toEqual(GROUPS);

  let onOneLine = 0;
  let total = 0;
  for (const sheet of sheets) {
    for (const height of sheet.rows) {
      const lines = height / sheet.pitch;
      // A row is a whole number of ruled lines, so every line of it sits on a rule and so
      // does every row under it.
      expect(Math.abs(height - Math.round(lines) * sheet.pitch), `${sheet.id} row of ${height}px`)
        .toBeLessThanOrEqual(1);
      // A title long enough to wrap takes a second line. Nothing here needs a third.
      expect(Math.round(lines), `${sheet.id} row of ${height}px`).toBeLessThanOrEqual(2);
      if (Math.round(lines) === 1) onOneLine++;
      total++;
    }
  }
  // One contribution to a line is the rule, and a wrapped title the exception.
  expect(onOneLine / total).toBeGreaterThan(0.5);
});

test('the ruled sheets fit a phone without scrolling sideways', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.waitForTimeout(1000);

  const { sheets } = await readSheets(page);
  expect(sheets).toHaveLength(GROUPS.length);
  for (const sheet of sheets) {
    expect(sheet.layers, `${sheet.id} paper`).toBe(4);
    expect(sheet.mask, `${sheet.id} tear`).toContain('svg');
    // Wider ruling for a thumb.
    expect(sheet.pitch, `${sheet.id} pitch`).toBeGreaterThan(32);
    for (const height of sheet.rows) {
      expect(Math.abs(height - Math.round(height / sheet.pitch) * sheet.pitch), `${sheet.id} row`)
        .toBeLessThanOrEqual(1);
    }
  }

  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
});

/** Every baseline written on a sheet, against the rule it is meant to sit on. */
const readBaselines = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const px = (value: string, el: Element) => {
      const probe = document.createElement('div');
      probe.style.width = value;
      el.append(probe);
      const width = probe.getBoundingClientRect().width;
      probe.remove();
      return width;
    };

    const offsets: { kind: string; size: number; offset: number }[] = [];

    for (const sheet of document.querySelectorAll<HTMLElement>('#open-source section[data-group]')) {
      const style = getComputedStyle(sheet);
      const pitch = px(style.getPropertyValue('--rule-pitch'), sheet);
      const shift = px(style.getPropertyValue('--rule-shift'), sheet);
      const paperTop = px(style.getPropertyValue('--paper-top'), sheet);
      // The ruling is laid out from the padding box, which is where the writing starts.
      const top = sheet.getBoundingClientRect().top + parseFloat(style.borderTopWidth) + window.scrollY;

      const cells: [string, string][] = [
        ['head', '.lines > header > span'],
        ['group', 'h3 > span'],
        ['repo', '.row cite'],
        ['title', '.row .title .title-text'],
      ];

      for (const [kind, selector] of cells) {
        for (const cell of sheet.querySelectorAll(selector)) {
          // A zero-height inline-block aligned to the baseline puts its own bottom on it.
          const marker = document.createElement('span');
          marker.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
          cell.append(marker);
          const baseline = marker.getBoundingClientRect().bottom + window.scrollY;
          marker.remove();

          const n = Math.round((baseline - top - paperTop - shift) / pitch);
          const rule = top + paperTop + shift + n * pitch;
          offsets.push({ kind, size: parseFloat(getComputedStyle(cell).fontSize), offset: baseline - rule });
        }
      }
    }

    return offsets;
  });

const blockWebfonts = (page: import('@playwright/test').Page) =>
  page.route('**/*', (route) => {
    const url = route.request().url();
    if (/fonts\.(googleapis|gstatic)\.com/.test(url) || /\.(woff2?|ttf|otf|eot)(\?|$)/.test(url)) {
      return route.abort();
    }
    return route.continue();
  });

for (const fonts of ['loaded', 'blocked'] as const) {
  test(`every line on a ruled sheet sits on a rule with the webfonts ${fonts}`, async ({ page }) => {
    if (fonts === 'blocked') await blockWebfonts(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.waitForTimeout(500);

    const offsets = await readBaselines(page);
    // Four sizes and three faces are written on these sheets; a drop measured against one of
    // them is right for that one and wrong for the rest, which is what this catches.
    expect(offsets.length).toBeGreaterThan(100);
    expect(new Set(offsets.map(({ kind }) => kind)).size).toBe(4);

    for (const { kind, size, offset } of offsets) {
      expect(Math.abs(offset), `${kind} at ${size}px is ${offset}px off its rule`).toBeLessThanOrEqual(1);
    }
  });
}

/**
 * Each row's technology marks, against the writing they stand beside. The writing sits on
 * the rule, so its middle is half a cap height above the baseline; a mark centred in the
 * pitch instead floats a third of a line over the row it marks.
 */
const readMarks = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const marks: { repo: string; offset: number }[] = [];

    for (const row of document.querySelectorAll('#open-source .lines .row')) {
      const list = row.querySelector('ul');
      const cite = row.querySelector('cite');
      const drawn = [...(list?.querySelectorAll('svg') ?? [])].map((svg) => svg.getBoundingClientRect());
      if (!cite || drawn.length === 0) continue;

      // Prepended, not appended: a repository too long for its line takes a second one, and
      // the marks stand on the first.
      const baselineProbe = document.createElement('span');
      baselineProbe.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
      cite.prepend(baselineProbe);
      const baseline = baselineProbe.getBoundingClientRect().bottom;
      baselineProbe.remove();

      const capProbe = document.createElement('div');
      capProbe.style.width = '1cap';
      cite.append(capProbe);
      const cap = capProbe.getBoundingClientRect().width;
      capProbe.remove();

      const middle = (Math.min(...drawn.map((rect) => rect.top)) + Math.max(...drawn.map((rect) => rect.bottom))) / 2;
      marks.push({ repo: cite.textContent?.trim().slice(0, 40) ?? '', offset: middle - (baseline - cap / 2) });
    }

    return marks;
  });

test('every row wears its marks on the line it is written on', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.waitForTimeout(500);

  const marks = await readMarks(page);
  expect(marks.length).toBeGreaterThan(50);

  for (const { repo, offset } of marks) {
    expect(Math.abs(offset), `${repo} marks are ${offset}px off its line`).toBeLessThanOrEqual(1.5);
  }
});

/** The letter's ink against the circle drawn round it. */
const readBubbles = (page: import('@playwright/test').Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.callout-bubble')].map((bubble) => {
      const letter = bubble.querySelector<HTMLElement>('.callout-letter')!;
      const style = getComputedStyle(letter);
      const circle = bubble.getBoundingClientRect();

      const node = [...letter.childNodes].find((child) => child.nodeType === Node.TEXT_NODE)!;
      const range = document.createRange();
      range.selectNodeContents(node);
      const line = range.getBoundingClientRect();

      const context = document.createElement('canvas').getContext('2d')!;
      context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const ink = context.measureText(node.textContent!.trim());

      // The range's box is the face's own ascent-to-descent box, so the baseline is one
      // ascent down it; the ink of a capital is measured from there.
      const baseline = line.top + ink.fontBoundingBoxAscent;
      const inkCentre = baseline + (ink.actualBoundingBoxDescent - ink.actualBoundingBoxAscent) / 2;

      return {
        letter: node.textContent!.trim(),
        lineBox: line.height,
        faceBox: ink.fontBoundingBoxAscent + ink.fontBoundingBoxDescent,
        off: inkCentre - (circle.top + circle.bottom) / 2,
      };
    }));

for (const [width, height] of [[1440, 900], [390, 844]]) {
  test(`the letter is centred in its detail's circle at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    // The circle is set in Special Elite; the fallback centres a pixel or two differently.
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);

    const bubbles = await readBubbles(page);
    expect(bubbles.map(({ letter }) => letter)).toEqual(LETTERS);

    for (const bubble of bubbles) {
      expect(Math.abs(bubble.lineBox - bubble.faceBox), `${bubble.letter} face box`).toBeLessThanOrEqual(0.5);
      expect(Math.abs(bubble.off), `${bubble.letter} sits ${bubble.off}px off centre`).toBeLessThanOrEqual(1);
    }
  });
}
