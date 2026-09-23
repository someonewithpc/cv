import { readFileSync } from 'node:fs';

import { expect, test } from '@playwright/test';

/** The width past which Layout.astro gives the sheets a margin of desk on either side. */
const DESK_FROM = 1024;

/** The side the desk lays a scan down at: 45rem at a 16px root, as ThemePicker.astro sets it. */
const TILE = 720;

/** --theme-desk per theme, as ThemePicker.astro writes it. */
const DESKS = {
  light: 'oklch(0.76 0.05 68)',
  dark: 'oklch(0.235 0.01 55)',
  arctic: 'oklch(0.81 0.013 232)',
  'dark-forest': 'oklch(0.225 0.03 75)',
} as const;

/** The veneer each theme wears, and the colour a dark desk subtracts that veneer from. */
const WOODS = {
  light: { file: 'oak-7760-limed', base: null },
  dark: { file: 'oak-7760-mid', base: 'rgb(128, 97, 73)' },
  arctic: { file: 'oak-7760', base: null },
  'dark-forest': { file: 'oak-7760-smoked', base: 'rgb(76, 68, 62)' },
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

    // The grain is a scan of real veneer, one file per theme, laid down at its own size.
    expect(background.image).toContain(`/desk/${WOODS[theme as keyof typeof WOODS].file}.webp`);
    // A dark desk subtracts its scan from a base cut to that wood's own mean; a pale one
    // lays the scan over the desk colour itself.
    const base = WOODS[theme as keyof typeof WOODS].base;
    expect(background.color).toBe(base ?? (await asComputedColor(page, desk)));
  });
}

/** A phone and a tablet, where the desk has nothing but the page gutter to show in. */
const NARROW = [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
] as const;

for (const { width, height } of NARROW) {
  test(`the desk still lies under the page at ${width}px`, async ({ page }) => {
    await withTheme(page, 'light');
    await page.setViewportSize({ width, height });
    await page.goto('/');

    const background = await page.locator('main').evaluate((el) => {
      const style = getComputedStyle(el);
      return {
        image: style.backgroundImage,
        color: style.backgroundColor,
        size: style.backgroundSize,
        blend: style.backgroundBlendMode,
      };
    });

    // The same two layers the wide desk has: the veil of theme colour, and the scan under it.
    expect(background.image).toContain(`/desk/${WOODS.light.file}.webp`);
    expect(background.blend).toBe('normal, overlay');
    expect(background.size).toContain(`${TILE}px ${TILE}px`);
    expect(background.color).toBe(await asComputedColor(page, DESKS.light));

    const fit = await page.evaluate(() => ({
      scrollWidth: document.body.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(fit.scrollWidth).toBeLessThanOrEqual(fit.innerWidth);
  });
}

test('the wood shows in the gutter and between the bands on a phone', async ({ page }) => {
  await withTheme(page, 'light');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.waitForTimeout(500);

  const spots = await page.evaluate(() => {
    const main = document.querySelector('main')!;
    const bands = [...main.children].filter((el) => !el.classList.contains('folio-rail'));
    const first = bands[0].getBoundingClientRect();
    const second = bands[1].getBoundingClientRect();
    return {
      paper: getComputedStyle(bands[0]).backgroundColor,
      gutter: {
        x: 1,
        y: Math.round(first.top + first.height / 2),
        width: Math.floor(first.left) - 2,
        height: 24,
      },
      gap: {
        x: Math.round(first.left + 20),
        y: Math.round(first.bottom + 2),
        width: 40,
        height: Math.max(1, Math.floor(second.top - first.bottom) - 4),
      },
    };
  });

  // The band is paper and the gutter beside it is not, so there is wood down the edge of the
  // page, and the same between one band and the next.
  expect(spots.gutter.width).toBeGreaterThan(8);
  expect(spots.gap.height).toBeGreaterThan(8);
  const paper = spots.paper.match(/\d+/g)!.map(Number);

  for (const [name, clip] of [['gutter', spots.gutter], ['gap', spots.gap]] as const) {
    const shot = await page.screenshot({ clip });
    const off = await page.evaluate(async ({ png, ink }) => {
      const image = new Image();
      await new Promise((done, fail) => {
        image.onload = done;
        image.onerror = fail;
        image.src = `data:image/png;base64,${png}`;
      });
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d', { willReadFrequently: true })!;
      context.drawImage(image, 0, 0);
      const { data } = context.getImageData(0, 0, image.width, image.height);
      let nearest = Infinity;
      for (let at = 0; at < data.length; at += 4) {
        const distance = Math.abs(data[at] - ink[0]) + Math.abs(data[at + 1] - ink[1]) + Math.abs(data[at + 2] - ink[2]);
        nearest = Math.min(nearest, distance);
      }
      return nearest;
    }, { png: shot.toString('base64'), ink: paper });
    expect(off, `${name} is paper, not desk`).toBeGreaterThan(60);
  }
});

/** The widest lightness swing, in L*, each theme's veneer is allowed over the bare margin. */
const SWING = {
  light: 8,
  dark: 13,
  arctic: 7,
  'dark-forest': 12,
} as const;

/**
 * Reads the desk out of a screenshot of the bare margin beside the sheets, as L* per pixel.
 * The strip is taken on the right, where nothing stands: the sheet numbers are in the left
 * margin and the theme picker is at the top.
 */
const readDesk = async (page: import('@playwright/test').Page) => {
  const frame = await page.evaluate(() => {
    const main = document.querySelector('main')!;
    // The widest thing the desk lays down, which is the cutting mat: the desk to measure is
    // what is left beside it. A .full-width wrapper is the window itself, not something laid
    // down, so it is measured through its children.
    const laid = [
      ...[...main.children].filter((el) => !el.classList.contains('folio-rail') && !el.classList.contains('full-width')),
      ...main.querySelectorAll(':scope > .full-width > *'),
    ].map((el) => el.getBoundingClientRect()).filter((box) => box.width < window.innerWidth - 4);
    const sheet = laid.reduce((widest, box) => (box.right > widest.right ? box : widest));
    const origin = main.getBoundingClientRect();
    return {
      // The tile is positioned from main's padding box, so the boards are counted from there.
      originX: origin.left,
      originY: origin.top,
      clip: { x: Math.ceil(sheet.right) + 8, y: 200, width: Math.floor(window.innerWidth - sheet.right) - 16, height: 1100 },
    };
  });
  const shot = await page.screenshot({ clip: frame.clip });
  const lightness = await page.evaluate(async (png) => {
    const image = new Image();
    await new Promise((done, fail) => { image.onload = done; image.onerror = fail; image.src = `data:image/png;base64,${png.data}`; });
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d', { willReadFrequently: true })!;
    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, image.width, image.height);
    const linear = (value: number) => (value / 255 <= 0.04045 ? value / 255 / 12.92 : ((value / 255 + 0.055) / 1.055) ** 2.4);
    const rows: number[][] = [];
    for (let y = 0; y < image.height; y += 1) {
      const row: number[] = [];
      for (let x = 0; x < image.width; x += 1) {
        const at = (y * image.width + x) * 4;
        const luminance = 0.2126 * linear(data[at]) + 0.7152 * linear(data[at + 1]) + 0.0722 * linear(data[at + 2]);
        row.push(luminance > 0.008856 ? 116 * Math.cbrt(luminance) - 16 : 903.3 * luminance);
      }
      rows.push(row);
    }
    return rows;
  }, { data: shot.toString('base64') });
  return { ...frame, lightness };
};

const median = (values: number[]) => values.slice().sort((a, b) => a - b)[Math.floor(values.length / 2)];

for (const [theme, bound] of Object.entries(SWING)) {
  test(`the ${theme} desk is quiet veneer that meets itself at the tile's edge at 2560px`, async ({ page }) => {
    await withTheme(page, theme);
    await page.setViewportSize({ width: 2560, height: 1440 });
    await page.goto('/');
    await page.waitForTimeout(500);

    const desk = await readDesk(page);
    const rows = desk.lightness;
    const width = rows[0].length;
    expect(width, 'bare desk to measure').toBeGreaterThan(360);

    /* Quiet enough to stay under the sheets, and never so quiet that the wood is gone. */
    const levels = rows.flat().sort((a, b) => a - b);
    const swing = levels[Math.floor(levels.length * 0.99)] - levels[Math.floor(levels.length * 0.01)];
    expect(swing, `${theme} veneer swings ${swing.toFixed(1)} L*`).toBeLessThanOrEqual(bound);
    expect(swing, `${theme} veneer should still read as wood`).toBeGreaterThan(1.5);

    /* The scan repeats on both axes, and the tile is positioned from main's padding box, so
       both its edges fall inside the strip and both have to meet themselves as closely as the
       grain does inside the tile. Down the desk that is as close as any two rows. Across, a
       photographed veneer wraps a little less exactly than a drawn tile did, so the bound is
       looser. A seam would step many times the grain beside it, not twice. */
    const step = (a: number[], b: number[]) => a.reduce((sum, value, at) => sum + Math.abs(value - b[at]), 0) / a.length;
    const column = (x: number) => rows.map((row) => row[x]);
    const edge = (from: number, origin: number) => Math.ceil((from - origin) / TILE) * TILE + origin - from;
    const down = edge(desk.clip.y, desk.originY);
    const across = edge(desk.clip.x, desk.originX);
    expect(down, 'the strip crosses the tile edge downwards').toBeGreaterThan(0);
    expect(across, 'the strip crosses the tile edge sideways').toBeGreaterThan(0);
    expect(across, 'the strip crosses the tile edge sideways').toBeLessThan(width - 1);

    const inTileDown: number[] = [];
    for (let y = 40; y < rows.length - 40; y += 29) inTileDown.push(step(rows[y], rows[y + 1]));
    const inTileAcross: number[] = [];
    for (let x = 5; x < width - 5; x += 7) inTileAcross.push(step(column(x), column(x + 1)));
    const atDown = step(rows[down - 1], rows[down]);
    const atAcross = step(column(across - 1), column(across));
    expect(atDown, `the join down steps ${atDown.toFixed(3)} L* against ${median(inTileDown).toFixed(3)} inside the tile`)
      .toBeLessThanOrEqual(median(inTileDown) * 2 + 0.05);
    expect(atAcross, `the join across steps ${atAcross.toFixed(3)} L* against ${median(inTileAcross).toFixed(3)} inside the tile`)
      .toBeLessThanOrEqual(median(inTileAcross) * 3 + 0.05);
  });
}

test('each theme brings its own wood, not one scan recoloured', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');

  const woods = Object.entries(WOODS);
  const tiles = await page.evaluate((names) => names.map((name) => {
    document.documentElement.dataset.theme = name;
    return getComputedStyle(document.querySelector('main')!).backgroundImage;
  }), woods.map(([theme]) => theme));

  expect(new Set(tiles).size, 'four themes, four grains').toBe(tiles.length);
  woods.forEach(([theme, wood], index) => {
    expect(tiles[index], `${theme} wears ${wood.file}`).toContain(`/desk/${wood.file}.webp`);
  });
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
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];

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
      // ruled paper per group, which the tests below measure. The demos lay down no sheet:
      // their title is written on the cutting mat.
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

  expect(sheets.length).toBeGreaterThanOrEqual(2);
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

test('a folio keeps to the paper once the mat stops growing', async ({ page }) => {
  // Past the mat's 100rem cap the desk's margin opens faster than the folio's lane, so a
  // lane measured from the window is left behind in the corner.
  await page.setViewportSize({ width: 2560, height: 1440 });
  await page.goto('/');

  const { folios, paper } = await readFolios(page);
  expect(folios).toHaveLength(SHEETS.length);
  const nearest = Math.min(...paper.map((band) => band.left));
  expect(nearest).toBeGreaterThan(0);

  for (const folio of folios) {
    expect(folio.box.left, `${folio.number} follows the paper in`).toBeGreaterThan(0);
    expect(nearest - folio.box.right, `${folio.number} lane ends at the paper`).toBeLessThanOrEqual(1);
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

test('the paper grain tile is fetched once and stays under 24 KB', async ({ page }) => {
  const paperRequests: string[] = [];
  let paperBytes = -1;
  page.on('requestfinished', async (request) => {
    if (!/\/paper-fibre\.webp$/.test(request.url())) return;
    paperRequests.push(request.url());
    const response = await request.response();
    const body = await response?.body();
    if (body) paperBytes = body.byteLength;
  });

  await page.setViewportSize({ width: 1440, height: 2400 });
  await page.goto('/');
  // Dozens of sheets carry the grain, the drawing stacks' pages and the contributions sheets,
  // so scroll the whole page to give every one of them a chance to request the tile before
  // counting.
  await page.evaluate(() => document.getElementById('open-source')?.scrollIntoView());
  await page.waitForTimeout(300);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(300);

  expect(paperRequests, `requested from:\n${paperRequests.join('\n')}`).toHaveLength(1);
  expect(paperBytes).toBeGreaterThan(0);
  // 21,604 bytes today, cut losslessly by scripts/cut-paper-tile.mjs. Lossless is the point:
  // a lossy encode of paper fibre lays a visible transform grid over every sheet. The budget
  // is the room a 192px tile needs to stay lossless, and is deliberately too tight for a
  // bigger one to be squeezed back under it by being encoded lossily.
  expect(paperBytes).toBeLessThan(24 * 1024);
});

test("the light sheet's paper is lighter than before the grain was added", async ({ page }) => {
  await withTheme(page, 'light');
  await page.goto('/');

  const canvas = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--theme-canvas').trim(),
  );
  const lightness = parseFloat(canvas.replace(/^oklch\(/, ''));

  // The paper was oklch(0.94 0.014 85) and round 1 lifted it to oklch(0.97 0.011 85), where it
  // stays. Round 2 lifted it again to pay back the grain's multiply on the CV's own sheets;
  // round 3 took the grain off those sheets, so that second lift went with it.
  expect(lightness).toBeGreaterThanOrEqual(0.97);
});

for (const theme of ['light', 'arctic'] as const) {
  test(`a ${theme} drawing sheet is paper, not a sunken panel`, async ({ page }) => {
    await withTheme(page, theme);
    await page.goto('/');

    const sheet = page.locator('article.technical-drawing-stack .paper-front > section').first();
    await sheet.scrollIntoViewIfNeeded();

    const lightness = await sheet.evaluate((el) => {
      // backgroundColor comes back as oklch() here, so a canvas fill does the conversion.
      const cx = document.createElement('canvas').getContext('2d')!;
      cx.fillStyle = getComputedStyle(el).backgroundColor;
      cx.fillRect(0, 0, 1, 1);
      const [r, g, b] = cx.getImageData(0, 0, 1, 1).data;
      const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
      const y = 0.2126 * lin(r / 255) + 0.7152 * lin(g / 255) + 0.0722 * lin(b / 255);
      return y > 216 / 24389 ? 116 * Math.cbrt(y) - 16 : (y * 24389) / 27;
    });

    // --surface-sunken, which this was, steps from the canvas toward the ink, so on a light
    // theme it put the sheet at L* 81, a clear grey, however far round 1 lifted the canvas.
    // One step instead of two puts it at 89, under the cutting mat's 97 and well clear of it.
    expect(lightness).toBeGreaterThan(86);
    expect(lightness).toBeLessThan(93);
  });
}

test('the grain paints on the paper sheets and on nothing else', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 2400 });
  await page.goto('/');

  const carriers = await page.evaluate(() =>
    [...document.querySelectorAll('*')]
      .filter((el) => getComputedStyle(el, '::before').backgroundImage.includes('paper-fibre.webp'))
      .map((el) => ({
        // The page face of a drawing stack: the element that wears the fold's clip-path, so
        // the grain is cut by the dog-ear along with the rest of the sheet.
        drawingPage: el.matches('article.technical-drawing-stack > * > section'),
        // The title block paints paper of its own over the sheet's, so it carries its own
        // fibre. Without it the block is the one flat patch on a sheet of paper.
        titleBlock: el.matches('article.technical-drawing-stack > * > section > table'),
        contributions: !!el.closest('#open-source'),
        behindTheContent: getComputedStyle(el, '::before').zIndex === '-1',
      })),
  );

  expect(carriers.length).toBeGreaterThan(20);
  for (const carrier of carriers) {
    expect(carrier.drawingPage || carrier.titleBlock || carrier.contributions).toBe(true);
    expect(carrier.behindTheContent).toBe(true);
  }
  // All three kinds are here, not one kind over and over.
  expect(carriers.some((c) => c.drawingPage)).toBe(true);
  expect(carriers.some((c) => c.titleBlock)).toBe(true);
  expect(carriers.some((c) => c.contributions)).toBe(true);
});

test("the title block's paper is the sheet's, on the sheet's phase", async ({ page }) => {
  await withTheme(page, 'light');
  await page.goto('/');

  const stack = page.locator('article.technical-drawing-stack').first();
  await stack.scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);

  const block = await stack.evaluate((el) => {
    const sheet = el.querySelector('.paper-front > section')!;
    const table = sheet.querySelector(':scope > table')!;
    const fill = (node: Element) => {
      const cx = document.createElement('canvas').getContext('2d')!;
      cx.fillStyle = getComputedStyle(node).backgroundColor;
      cx.fillRect(0, 0, 1, 1);
      return [...cx.getImageData(0, 0, 1, 1).data].slice(0, 3);
    };
    // Both pseudo-elements are inset: 0 on their own element, so each tiles from that
    // element's padding box, which is its border box less its border. One tile is 12rem, so
    // in register is a whole number of tiles apart.
    const origin = (node: Element) => {
      const box = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      const [x, y] = getComputedStyle(node, '::before').backgroundPosition.split(' ').map(parseFloat);
      return [
        box.left + parseFloat(style.borderLeftWidth) + x,
        box.top + parseFloat(style.borderTopWidth) + y,
      ];
    };
    const [sx, sy] = origin(sheet);
    const [bx, by] = origin(table);
    const off = (a: number, b: number) => {
      const d = Math.abs(a - b) % 192;
      return Math.min(d, 192 - d);
    };
    return { sheetFill: fill(sheet), blockFill: fill(table), dx: off(sx, bx), dy: off(sy, by) };
  });

  expect(block.blockFill).toEqual(block.sheetFill);
  expect(block.dx).toBeLessThan(1);
  expect(block.dy).toBeLessThan(1);
});

test('the fold flap is the back of the sheet, with no fibre on it', async ({ page }) => {
  await page.goto('/');
  const stack = page.locator('article.technical-drawing-stack').first();
  await stack.scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);

  // The flap, the clip, the grab handle and the hint ride on top of the page rather than being
  // the page, so none of them may carry the tile.
  const riders = stack.locator(
    '.paper-front > :is(.paper-fold, .paper-back-grab, .paper-clip, .paper-clip-under, .paper-flip-hint)',
  );
  expect(await riders.count()).toBeGreaterThan(0);
  for (const rider of await riders.all()) {
    for (const pseudo of ['::before', '::after']) {
      const painted = await rider.evaluate(
        (el, p) => getComputedStyle(el, p).backgroundImage,
        pseudo,
      );
      expect(painted).not.toContain('paper-fibre.webp');
    }
    await expect(rider).not.toHaveCSS('background-image', /paper-fibre\.webp/);
  }
});
