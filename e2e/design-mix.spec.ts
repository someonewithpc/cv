import { readFileSync } from 'node:fs';

import { expect, test } from '@playwright/test';

/** The width past which Layout.astro gives the sheets a margin of desk on either side. */
const DESK_FROM = 1024;

/** The side the desk lays a scan down at: 45rem at a 16px root, as ThemePicker.astro sets it. */
const TILE = 720;

/** Each theme's baked tile in public/desk, and its average, which shows until the tile loads. */
const DESKS = {
  light: 'rgb(229, 200, 160)',
  dark: 'rgb(31, 28, 24)',
  arctic: 'rgb(212, 203, 197)',
  'dark-forest': 'rgb(37, 27, 12)',
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

for (const [theme, desk] of Object.entries(DESKS)) {
  test(`the ${theme} desk fills main past ${DESK_FROM}px`, async ({ page }) => {
    await withTheme(page, theme);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');

    const background = await page.locator('main').evaluate((el) => {
      const style = getComputedStyle(el);
      return { image: style.backgroundImage, color: style.backgroundColor, blend: style.backgroundBlendMode };
    });

    // One baked tile per theme, laid down as it is, over the colour it averages to.
    expect(background.image).toContain(`/desk/${theme}.webp`);
    expect(background.blend).toBe('normal');
    expect(background.color).toBe(desk);
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

    // The same tile the wide desk has, at the same size.
    expect(background.image).toContain('/desk/light.webp');
    expect(background.blend).toBe('normal');
    expect(background.size).toBe(`${TILE}px ${TILE}px`);
    expect(background.color).toBe(DESKS.light);

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

  const themes = Object.keys(DESKS);
  const tiles = await page.evaluate((names) => names.map((name) => {
    document.documentElement.dataset.theme = name;
    return getComputedStyle(document.querySelector('main')!).backgroundImage;
  }), themes);

  expect(new Set(tiles).size, 'four themes, four grains').toBe(tiles.length);
  themes.forEach((theme, index) => {
    expect(tiles[index], `${theme} wears its own tile`).toContain(`/desk/${theme}.webp`);
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

/** Details are lettered A, B, C and on down the page, one per demo. */
const letter = (index: number) => String.fromCharCode('A'.charCodeAt(0) + index);

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
      paper: style.backgroundImage,
      ruling: (({ maskImage, left, top, zIndex }) => ({ maskImage, left: parseFloat(left), top: parseFloat(top), zIndex }))(
        getComputedStyle(el, '::before'),
      ),
      stacks: stacks.map(({ left, right, top, bottom }) => ({ left, right, top: top + scrollY, bottom: bottom + scrollY })),
    };
  });

  // Narrower than the viewport, with desk left and right of it.
  expect(box.left).toBeGreaterThan(0);
  expect(box.right).toBeLessThan(box.viewport);
  expect(box.right - box.left).toBeLessThan(box.viewport);

  // Every stack lies on it.
  expect(box.stacks.length).toBeGreaterThan(0);
  for (const stack of box.stacks) {
    expect(stack.left).toBeGreaterThanOrEqual(box.left);
    expect(stack.right).toBeLessThanOrEqual(box.right);
    expect(stack.top).toBeGreaterThanOrEqual(box.top);
    expect(stack.bottom).toBeLessThanOrEqual(box.bottom);
  }

  // The rim is a plain margin closed by one line: the ruling is an SVG tile laid over the
  // content box alone, under the details, and only the mat's own colour reaches the border box.
  expect(box.padding).toBeGreaterThanOrEqual(12);
  expect(box.border).toBe(1);
  expect(box.paper).toBe('none');
  expect(box.ruling.maskImage).toContain('data:image/svg+xml');
  expect(box.ruling.left).toBe(box.padding);
  expect(box.ruling.top).toBe(box.padding);
  expect(box.ruling.zIndex).toBe('-1');
});

test('each demo is a lettered detail and nothing else is called out', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');

  const stacks = await page.locator('article.technical-drawing-stack').count();
  expect(stacks).toBeGreaterThan(0);
  const letters = Array.from({ length: stacks }, (_, index) => letter(index));

  const bubbles = page.locator('#demos .cutting-mat .callout .callout-bubble');
  await expect(bubbles).toHaveText(letters);

  const callouts = page.locator('#demos .callout');
  await expect(callouts).toHaveCount(stacks);
  // Each detail encloses exactly one stack.
  for (let index = 0; index < stacks; index++) {
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
    const mat = document.querySelector('#demos .cutting-mat')!.getBoundingClientRect();

    return {
      mat: { left: mat.left, right: mat.right },
      details: [...document.querySelectorAll<HTMLElement>('#demos .callout')].map((callout) => {
        const card = callout.querySelector<HTMLElement>('.callout-card')!;
        const leader = callout.querySelector<HTMLElement>('.callout-card-leader')!;
        const stack = callout.querySelector('article.technical-drawing-stack')!;
        const shown = getComputedStyle(card).display !== 'none';
        const box = callout.querySelector('.callout-view')!.getBoundingClientRect();
        const stackBox = stack.getBoundingClientRect();

        return {
          side: callout.dataset.card,
          shown,
          // The chain-line boundary is the edge of the view's wrapper.
          boundary: { left: box.left, right: box.right },
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
  expect(details.length).toBeGreaterThan(0);

  for (const [index, detail] of details.entries()) {
    const name = letter(index);
    const onTheLeft = index % 2 === 0;
    expect(detail.side, `${name} side`).toBe(onTheLeft ? 'start' : 'end');
    expect(detail.shown, `${name} shown`).toBe(true);

    const card = detail.card!;
    const leader = detail.leader!;
    const centre = (card.left + card.right) / 2;

    if (onTheLeft) {
      expect(centre, `${name} card centre`).toBeLessThan(detail.stack.left);
      expect(card.right, `${name} card clear of the stack`).toBeLessThanOrEqual(detail.stack.left);
      // The leader runs from the card's near edge and ends in its arrowhead on the boundary.
      expect(leader.left, `${name} leader starts at the card`).toBeGreaterThanOrEqual(card.right - 1);
      expect(Math.abs(leader.right - detail.boundary.left), `${name} arrowhead`).toBeLessThanOrEqual(2);
    } else {
      expect(centre, `${name} card centre`).toBeGreaterThan(detail.stack.right);
      expect(card.left, `${name} card clear of the stack`).toBeGreaterThanOrEqual(detail.stack.right);
      expect(leader.right, `${name} leader starts at the card`).toBeLessThanOrEqual(card.left + 1);
      expect(Math.abs(leader.left - detail.boundary.right), `${name} arrowhead`).toBeLessThanOrEqual(2);
    }

    expect(card.left, `${name} card inside the mat`).toBeGreaterThanOrEqual(mat.left);
    expect(card.right, `${name} card inside the mat`).toBeLessThanOrEqual(mat.right);
  }
});

for (const width of [CARDS_FROM - 16, 1440, 1280, 390]) {
  test(`the title card is a slip under the stack at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width < 800 ? 844 : 800 });
    await page.goto('/');
    await page.waitForTimeout(1000);

    const { mat, details } = await readCards(page);
    expect(details.length).toBeGreaterThan(0);

    for (const [index, detail] of details.entries()) {
      expect(detail.shown, `${letter(index)} shown`).toBe(true);
      const card = detail.card!;
      // Inside the boundary, not in a lane beside it.
      expect(card.left, `${letter(index)} card inside the boundary`).toBeGreaterThanOrEqual(detail.boundary.left);
      expect(card.right, `${letter(index)} card inside the boundary`).toBeLessThanOrEqual(detail.boundary.right);
      expect(card.left, `${letter(index)} card inside the mat`).toBeGreaterThanOrEqual(mat.left);
      expect(card.right, `${letter(index)} card inside the mat`).toBeLessThanOrEqual(mat.right);
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
      // their title is written on the cutting mat. Nor does the name: its title block is the
      // paper, and the header behind it is bare.
      ...[...main.children].filter((el) =>
        !el.classList.contains('full-width')
        && !el.classList.contains('folio-rail')
        && el.id !== 'open-source'
        && el.id !== 'profile'),
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

  expect(sheets.length).toBeGreaterThanOrEqual(1);
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
  { number: '02', id: 'career', heading: '#career-heading .typewriter' },
  { number: '03', id: 'bill-of-materials', heading: '#tech-icon-cloud-label' },
  { number: '04', id: 'demos', heading: '#demos-heading .typewriter' },
  { number: '05', id: 'open-source', heading: '#open-source-heading .typewriter' },
];

/** The width from which Layout.astro has desk to spare for a folio. */
const FOLIO_FROM = 76 * 16;

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
        // The numeral and its label together, which is all of the folio that draws.
        ink: [rail.querySelector('.folio-number')!, rail.querySelector('.folio-label')!]
          .map((el) => el.getBoundingClientRect())
          .reduce((a, b) => ({
            left: Math.min(a.left, b.left),
            right: Math.max(a.right, b.right),
            top: Math.min(a.top, b.top),
            bottom: Math.max(a.bottom, b.bottom),
          })),
      })),
      // The paper nearest the window, whose edge every folio's rail ends at.
      matLeft: document.querySelector('#demos .cutting-mat')!.getBoundingClientRect().left,
      headings: sheets.map(({ heading }) =>
        [...document.querySelectorAll(heading)].map(text).join(' ')),
      sheets: sheets.map(({ id }) => box(document.querySelector(`#${id}`)!.getBoundingClientRect())),
      // Every piece of paper the page lays down, and the mat with its stacks: what a folio
      // must stay clear of. #demos itself is the whole viewport wide and holds no ink.
      paper: [...document.querySelectorAll('#profile, #career, #bill-of-materials, #demos > *, #open-source .intro, #open-source section[data-group], article.technical-drawing-stack')]
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
    for (const band of paper.filter((band) => band.top < folio.ink.bottom && band.bottom > folio.ink.top)) {
      expect(folio.ink.right, `${folio.number} clear of ${band.name}`).toBeLessThanOrEqual(band.left);
    }
  }
});

test('every folio stays centred beside the mat once the mat stops growing', async ({ page }) => {
  // Past the mat's 100rem cap the desk's margin keeps opening while the numeral stays at
  // 7.5rem, so a numeral pinned to either edge would drift away from the middle.
  await page.setViewportSize({ width: 2560, height: 1440 });
  await page.goto('/');

  const { folios, matLeft } = await readFolios(page);
  expect(folios).toHaveLength(SHEETS.length);

  for (const folio of folios) {
    expect(folio.numeral.left, `${folio.number} follows the paper in`).toBeGreaterThan(0);
    const left = folio.numeral.left;
    const right = matLeft - folio.numeral.right;
    expect(Math.abs(left - right), `${folio.number} centred: ${left} left, ${right} right`).toBeLessThanOrEqual(1);
  }
});

test('a folio rides along while its sheet scrolls past', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');

  const demosFolio = SHEETS.findIndex(({ id }) => id === 'demos');
  const before = (await readFolios(page)).folios[demosFolio];
  // The demos sheet is the tall one: 400px into it the folio has travelled but not left.
  await page.evaluate(() => {
    const demos = document.querySelector('#demos')!.getBoundingClientRect();
    window.scrollTo(0, demos.top + window.scrollY + 400);
  });
  await page.waitForTimeout(200);

  const { folios, clientWidth } = await readFolios(page);
  const after = folios[demosFolio];
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

for (const width of [FOLIO_FROM, 1440, 1920]) {
  test(`the mat hugs what lies on it at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');

    const room = await page.evaluate(() => {
      const mat = document.querySelector('#demos .cutting-mat')!;
      const style = getComputedStyle(mat);
      const box = mat.getBoundingClientRect();
      const inset = (side: string) =>
        parseFloat(style.getPropertyValue(`border-${side}-width`)) + parseFloat(style.getPropertyValue(`padding-${side}`));
      const inside = {
        left: box.left + inset('left'),
        right: box.right - inset('right'),
        top: box.top + inset('top'),
        bottom: box.bottom - inset('bottom'),
      };
      // What is laid on the mat reaches as far out as the callouts' boundaries and the cards.
      const drawn = [...document.querySelectorAll('#demos .cutting-mat .callout-view, #demos .cutting-mat .callout-card')]
        .filter((el) => getComputedStyle(el).display !== 'none')
        .map((el) => el.getBoundingClientRect());
      const details = [...mat.children].map((el) => el.getBoundingClientRect());
      const rails = [...document.querySelectorAll<HTMLElement>('.folio-rail')];
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
        railRights: rails.map((rail) => rail.getBoundingClientRect().right),
      };
    });

    // 0.75rem of ruled mat past the outermost line on all four sides, and no more: the mat is
    // only as wide as what lies on it.
    for (const [side, clear] of [
      ['left', room.widest.left - room.inside.left],
      ['right', room.inside.right - room.widest.right],
      ['top', room.tallest.top - room.inside.top],
      ['bottom', room.inside.bottom - room.tallest.bottom],
    ] as const) {
      expect(clear, `mat clear ${side}`).toBeGreaterThanOrEqual(11.5);
      expect(clear, `mat clear ${side}`).toBeLessThanOrEqual(12.5);
    }
    // The mat and the folios share the desk margin: every folio's rail ends at the mat's edge.
    expect(room.railRights).toHaveLength(SHEETS.length);
    for (const right of room.railRights) {
      expect(room.mat.left).toBeGreaterThanOrEqual(right - 0.5);
      expect(room.mat.left - right).toBeLessThanOrEqual(1);
    }
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
          // The ruling and the margin line.
          image: style.backgroundImage,
          layers: style.backgroundImage.split('linear-gradient(').length - 1,
          size: style.backgroundSize.split(', '),
          repeat: style.backgroundRepeat.split(', '),
          mask: style.maskImage,
          maskPosition: style.maskPosition,
          maskRepeat: style.maskRepeat,
          maskSize: style.maskSize.split(', '),
          fringe: getComputedStyle(sheet, '::after').maskImage,
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
    // The ruling and the margin line.
    expect(sheet.layers, `${sheet.id} paper`).toBe(2);
    // The ruling is one pitch-tall tile repeated down the whole sheet, so it runs on past
    // the writing and off both torn edges rather than stopping under the last row.
    expect(sheet.size[0], `${sheet.id} ruling`).toBe(`100% ${sheet.pitch}px`);
    expect(sheet.repeat[0], `${sheet.id} ruling repeats`).toBe('repeat');
    // A torn edge along the top, a different one along the bottom, and straight sides. Each
    // edge is a tile laid side by side at its own size rather than one path stretched across
    // the sheet, so the tear is as fine on a phone as on a wide screen.
    expect(sheet.mask, `${sheet.id} tear`).toContain('svg');
    expect(sheet.mask.split('url("data:').length - 1, `${sheet.id} two tears`).toBe(2);
    expect(sheet.maskRepeat, `${sheet.id} tear tiles`).toBe('repeat-x, no-repeat, repeat-x');
    expect(sheet.maskSize[0], `${sheet.id} tile`).toBe(sheet.maskSize[2]);
    expect(sheet.maskSize[0], `${sheet.id} tile`).not.toMatch(/%/);
    // The paper's inside shows along both tears, where the fibres pulled out. Count the
    // images, not the url(#…) references inside them.
    expect(sheet.fringe.split('url("data:').length - 1, `${sheet.id} fringe`).toBe(2);
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
      // A row is a whole number of bands, so every line of it sits in a band and so
      // does every row under it.
      expect(Math.abs(height - Math.round(lines) * sheet.pitch), `${sheet.id} row of ${height}px`)
        .toBeLessThanOrEqual(1);
      // A title long enough to wrap takes a second line, and at the reader's own text size
      // the longest takes a third. Nothing here needs a fourth.
      expect(Math.round(lines), `${sheet.id} row of ${height}px`).toBeLessThanOrEqual(3);
      if (Math.round(lines) === 1) onOneLine++;
      total++;
    }
  }
  // At the reader's own text size most titles wrap once; still, a good share keep a line to
  // themselves.
  expect(onOneLine / total).toBeGreaterThan(1 / 3);
});

test('the ruled sheets fit a phone without scrolling sideways', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.waitForTimeout(1000);

  const { sheets } = await readSheets(page);
  expect(sheets).toHaveLength(GROUPS.length);
  for (const sheet of sheets) {
    expect(sheet.layers, `${sheet.id} paper`).toBe(2);
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

// A narrowing sheet gives its margin up first, so the writing keeps the width.
test('the margin goes before the writing loses any room', async ({ page }) => {
  const read = () =>
    page.locator('#open-source section[data-group="open"]').evaluate((sheet) => {
      const style = getComputedStyle(sheet);
      const probe = document.createElement('div');
      probe.style.width = style.getPropertyValue('--margin-x');
      sheet.append(probe);
      const margin = probe.getBoundingClientRect().width;
      probe.remove();
      const left = sheet.getBoundingClientRect().left;
      return {
        margin,
        writing: sheet.querySelector('.lines')!.getBoundingClientRect().left - left,
        title: sheet.querySelector('.row .title')!.getBoundingClientRect().left - left,
      };
    });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  expect((await read()).margin).toBeGreaterThan(40);

  for (const width of [640, 506, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const { margin, writing, title } = await read();
    expect(margin, `margin at ${width}px`).toBe(0);
    expect(writing, `writing at ${width}px`).toBeLessThanOrEqual(24);
    // The marks' column and its gap are all that stand before a title.
    expect(title - writing, `title at ${width}px`).toBeLessThanOrEqual(width < 500 ? 30 : 40);
  }
});

type WrittenLine = {
  sheet: string;
  kind: string;
  text: string;
  size: number;
  /** The middle of the line's writing, from the top of its sheet. */
  centre: number;
  /** How far that middle is from the midpoint between the two rules around it. */
  offset: number;
  /** The node's line boxes one after another, a wrapped line one band under the last. */
  steps: number[];
};

/**
 * Every line of writing on every sheet, wrapped lines included, against the bands between the
 * rules.
 *
 * A text node's line boxes come from a Range, one rectangle per line it covers. The top of
 * each is the face's ascent above its baseline; that ascent is measured once per face, by
 * setting a zero-height mark down beside the node and reading off where its baseline puts it.
 * The middle of the writing is halfway between the baseline and the average of the face's
 * x-height and cap height, both read off the ink of an "x" and an "H" drawn in that face, so
 * a line of lowercase and capitals reads as centred. Writing set in capitals is centred on
 * its capitals. None of it comes from the CSS that places the writing.
 */
const readWrittenLines = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const px = (value: string, el: Element) => {
      const probe = document.createElement('div');
      probe.style.width = value;
      el.append(probe);
      const width = probe.getBoundingClientRect().width;
      probe.remove();
      return width;
    };
    const kinds: [string, string][] = [
      ['group', 'h3'],
      ['head', '.lines > header'],
      ['repo', 'cite'],
      ['title', '.title'],
      ['note', '.body'],
    ];
    const context = document.createElement('canvas').getContext('2d')!;

    // One mark per face and size: setting one down makes the page lay itself out again.
    const faces = new Map<string, { ascent: number; cap: number; ex: number }>();
    const lines: WrittenLine[] = [];
    for (const sheet of document.querySelectorAll<HTMLElement>('#open-source section[data-group]')) {
      const style = getComputedStyle(sheet);
      const box = sheet.getBoundingClientRect();
      const pitch = px(style.getPropertyValue('--rule-pitch'), sheet);
      // The ruling's tile starts at the top of the first band and draws its rule in the
      // tile's last pixel, so the rules' own middles are half a pixel above each band's top.
      const origin = parseFloat(style.borderTopWidth) + px(style.getPropertyValue('--paper-top'), sheet) - 0.5;

      const walker = document.createTreeWalker(sheet, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
        const parent = node.parentElement!;
        if (!node.data.trim() || parent.closest('.sr-only, details:not([open]) > .body')) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        const rects = [...range.getClientRects()].filter((rect) => rect.width > 0 && rect.height > 0);
        if (rects.length === 0) continue;

        const font = getComputedStyle(parent);
        const face = `${font.fontStyle} ${font.fontWeight} ${font.fontSize} ${font.fontFamily}`;
        const caps = font.textTransform === 'uppercase';
        if (!faces.has(face)) {
          const mark = document.createElement('span');
          mark.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
          node.after(mark);
          const ascent = mark.getBoundingClientRect().bottom - rects[rects.length - 1].top;
          mark.remove();
          context.font = face;
          const cap = context.measureText('H').actualBoundingBoxAscent;
          const ex = context.measureText('x').actualBoundingBoxAscent;
          faces.set(face, { ascent, cap, ex });
        }
        const { ascent, cap, ex } = faces.get(face)!;
        const middle = caps ? cap / 2 : (cap + ex) / 4;

        const kind = kinds.find(([, selector]) => parent.closest(selector))?.[0] ?? parent.tagName;
        const tops = [...new Set(rects.map((rect) => Math.round(rect.top * 100) / 100))];
        const steps = tops.slice(1).map((top, i) => top - tops[i]);
        const seen = new Set<number>();
        for (const rect of rects) {
          const centre = rect.top + ascent - middle - box.top;
          if (seen.has(Math.round(centre))) continue;
          seen.add(Math.round(centre));
          const band = Math.floor((centre - origin) / pitch);
          lines.push({
            sheet: sheet.dataset.group!,
            kind,
            text: node.data.trim().slice(0, 32),
            size: parseFloat(font.fontSize),
            centre,
            offset: centre - (origin + (band + 0.5) * pitch),
            steps,
          });
        }
      }
    }
    return lines;
  });

const blockWebfonts = (page: import('@playwright/test').Page) =>
  page.route('**/*', (route) => {
    const url = route.request().url();
    if (/fonts\.(googleapis|gstatic)\.com/.test(url) || /\.(woff2?|ttf|otf|eot)(\?|$)/.test(url)) {
      return route.abort();
    }
    return route.continue();
  });

const expectCentred = (lines: WrittenLine[], pitch: number) => {
  for (const { sheet, kind, text, size, offset, steps } of lines) {
    expect(Math.abs(offset), `${sheet} ${kind} "${text}" at ${size}px is ${offset.toFixed(2)}px off the middle of its band`)
      .toBeLessThanOrEqual(1);
    for (const step of steps) {
      expect(Math.abs(step - pitch), `${sheet} ${kind} "${text}" wraps ${step}px down`).toBeLessThanOrEqual(0.5);
    }
  }
};

/** The ruling's pitch and the line the writing would take on its own, on the first sheet. */
const readPitch = (page: import('@playwright/test').Page) =>
  page.locator('#open-source section[data-group]').first().evaluate((sheet) => {
    const style = getComputedStyle(sheet);
    const px = (value: string) => {
      const probe = document.createElement('div');
      probe.style.width = value;
      sheet.append(probe);
      const width = probe.getBoundingClientRect().width;
      probe.remove();
      return width;
    };
    return { pitch: px(style.getPropertyValue('--rule-pitch')), line: px(style.getPropertyValue('--line-height')) };
  });

// The layout changes at each of these: three columns, two, the repository over the title
// with no margin, and a narrower sheet with a wider pitch and a tighter column of marks. A row
// that grows by a pixel anywhere pushes every line under it out of its band, so each width is
// walked to the last line of the last sheet.
for (const width of [1440, 1024, 768, 640, 390]) {
  test(`every line on a ruled sheet is centred between two rules at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await page.evaluate(() => document.fonts.ready);

    // The ruling is half as wide again as the line the writing would take on its own.
    const { pitch, line } = await readPitch(page);
    expect(pitch, `a ${pitch}px pitch for a ${line}px line`).toBeCloseTo(line * 1.5, 1);

    const lines = await readWrittenLines(page);
    const rows = await page.locator('#open-source .row').count();
    // Every row has a repository and a title, and some of them run onto a second line.
    expect(lines.length).toBeGreaterThan(rows * 2);
    expect(lines.some(({ steps }) => steps.length > 0), 'some line wraps').toBe(true);
    expectCentred(lines, pitch);
  });
}

for (const width of [1440, 390]) {
  test(`every line is centred between two rules with the webfonts blocked at ${width}px`, async ({ page }) => {
    await blockWebfonts(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await page.waitForTimeout(500);

    const lines = await readWrittenLines(page);
    expect(new Set(lines.map(({ kind }) => kind))).toEqual(
      new Set(width > 480 ? ['group', 'head', 'repo', 'title'] : ['group', 'repo', 'title']),
    );
    expectCentred(lines, (await readPitch(page)).pitch);
  });
}

test('an opened row writes its note between the rules and keeps the rows under it there', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.evaluate(() => {
    for (const details of document.querySelectorAll<HTMLDetailsElement>('#open-source .row details')) {
      details.open = true;
    }
  });

  const lines = await readWrittenLines(page);
  expect(lines.filter(({ kind }) => kind === 'note').length).toBeGreaterThan(20);
  expectCentred(lines, (await readPitch(page)).pitch);
});

/**
 * The rules the page really paints, found in a screenshot of the strip of paper left of the
 * margin line where nothing is written, against the middles of the writing. The tests above
 * trust the ruling's own numbers; this one looks at the pixels.
 */
for (const theme of ['light', 'dark-forest'] as const) {
  for (const width of [1440, 390]) {
    test(`the painted rules run either side of the writing in ${theme} at ${width}px`, async ({ page }) => {
      await withTheme(page, theme);
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      await page.evaluate(() => document.fonts.ready);

      const sheet = page.locator('#open-source section[data-group="merged"]');
      const lines = (await readWrittenLines(page)).filter((line) => line.sheet === 'merged');
      const strip = await sheet.evaluate((el) => {
        const style = getComputedStyle(el);
        const probe = document.createElement('div');
        probe.style.width = style.getPropertyValue('--margin-x');
        el.append(probe);
        const margin = probe.getBoundingClientRect().width;
        probe.style.width = style.getPropertyValue('--rule-pitch');
        const pitch = probe.getBoundingClientRect().width;
        probe.remove();
        // Left of the margin line, or on a sheet too narrow for a margin, the paper's own edge.
        const to = margin > 0 ? Math.floor(margin) - 6 : Math.floor(parseFloat(style.paddingLeft)) - 2;
        return { from: margin > 0 ? 4 : 2, to, pitch };
      });
      // A clip of the full page in document coordinates; an element screenshot of a sheet this
      // tall lands a few pixels off its box.
      const clip = await sheet.evaluate((el) => {
        const box = el.getBoundingClientRect();
        return { x: box.left + scrollX, y: box.top + scrollY, width: box.width, height: box.height };
      });
      const shot = await page.screenshot({ fullPage: true, clip, animations: 'disabled' });

      // How far each row of pixels in the strip is from the paper around it.
      const profile: number[] = await page.evaluate(async ({ png, from, to }) => {
        const image = new Image();
        image.src = `data:image/png;base64,${png}`;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext('2d')!;
        context.drawImage(image, 0, 0);
        const data = context.getImageData(from, 0, to - from, image.height).data;
        const w = to - from;
        const rows = Array.from({ length: image.height }, (_, y) => {
          let sum = 0;
          for (let i = 0; i < w; i++) sum += data[(y * w + i) * 4] + data[(y * w + i) * 4 + 1] + data[(y * w + i) * 4 + 2];
          return sum / w / 3;
        });
        return rows.map((value, y) => {
          const around = rows.slice(Math.max(0, y - 8), y + 9).sort((a, b) => a - b);
          return Math.abs(value - around[Math.floor(around.length / 2)]);
        });
      }, { png: shot.toString('base64'), from: strip.from, to: strip.to });

      // The painted rule half a pitch above each line's middle and the one half a pitch below:
      // the row that stands out most within a few pixels of each. Both must stand out, and
      // the writing's middle must be halfway between them.
      const noise = [...profile].sort((a, b) => a - b)[Math.floor(profile.length / 2)];
      const rule = (near: number) => {
        let best = Math.round(near);
        for (let y = best - 4; y <= best + 4; y++) if (profile[y] > profile[best]) best = y;
        return best;
      };
      for (const { kind, text, centre } of lines) {
        const above = rule(centre - strip.pitch / 2 - 0.5);
        const below = rule(centre + strip.pitch / 2 - 0.5);
        expect(profile[above], `no rule painted above ${kind} "${text}"`).toBeGreaterThan(noise * 3 + 2);
        expect(profile[below], `no rule painted below ${kind} "${text}"`).toBeGreaterThan(noise * 3 + 2);
        expect(Math.abs(below - above - strip.pitch), `rules ${below - above}px apart around ${kind} "${text}"`)
          .toBeLessThanOrEqual(1);
        // A rule fills the pixel row it is found at, so its own middle is half a pixel down.
        const midpoint = (above + below) / 2 + 0.5;
        expect(Math.abs(centre - midpoint), `${kind} "${text}" is ${(centre - midpoint).toFixed(2)}px off the middle of its band`)
          .toBeLessThanOrEqual(1);
      }
    });
  }
}

test('a linked title carries one underline, not the link\'s as well', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const decorations = await page.locator('#open-source .row a.title').first().evaluate((title) => ({
    link: getComputedStyle(title).textDecorationLine,
    text: getComputedStyle(title.querySelector('.title-text')!).textDecorationLine,
  }));
  expect(decorations).toEqual({ link: 'none', text: 'underline' });
});

/**
 * Each row's technology marks, against the band they stand in: the middle of the marks is the
 * middle of the row's first band, the same middle the writing beside them is centred on.
 */
const readMarks = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const marks: { repo: string; offset: number }[] = [];

    for (const sheet of document.querySelectorAll<HTMLElement>('#open-source section[data-group]')) {
      const style = getComputedStyle(sheet);
      const probe = document.createElement('div');
      probe.style.width = style.getPropertyValue('--rule-pitch');
      sheet.append(probe);
      const pitch = probe.getBoundingClientRect().width;
      probe.remove();

      for (const row of sheet.querySelectorAll('.lines .row')) {
        const list = row.querySelector('ul');
        const cite = row.querySelector('cite');
        const drawn = [...(list?.querySelectorAll('svg') ?? [])].map((svg) => svg.getBoundingClientRect());
        // Three marks share a narrow row's two bands between them rather than one to a band.
        if (!cite || drawn.length === 0 || drawn.length === 3) continue;

        const top = row.getBoundingClientRect().top;
        // Beside each other on a wide row, one to a band down the margin on a narrow one.
        const bands = new Set(drawn.map((rect) => Math.floor(((rect.top + rect.bottom) / 2 - top) / pitch)));
        for (const band of bands) {
          const inBand = drawn.filter((rect) => Math.floor(((rect.top + rect.bottom) / 2 - top) / pitch) === band);
          const middle = (Math.min(...inBand.map((rect) => rect.top)) + Math.max(...inBand.map((rect) => rect.bottom))) / 2;
          marks.push({
            repo: cite.textContent?.trim().slice(0, 40) ?? '',
            // The band's middle, half a pixel up to the midpoint between the rules' own middles.
            offset: middle - (top + (band + 0.5) * pitch - 0.5),
          });
        }
      }
    }

    return marks;
  });

for (const width of [1440, 390]) {
  test(`every row's marks are centred in the band they stand in at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await page.waitForTimeout(500);

    const marks = await readMarks(page);
    expect(marks.length).toBeGreaterThan(50);

    for (const { repo, offset } of marks) {
      expect(Math.abs(offset), `${repo} marks are ${offset.toFixed(2)}px off the middle of their band`).toBeLessThanOrEqual(1);
    }
  });
}

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
    expect(bubbles.length).toBeGreaterThan(0);

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

for (const theme of ['light', 'arctic', 'dark-forest'] as const) {
  test(`a ${theme} drawing sheet is the paper Hugo picked for it`, async ({ page }) => {
    await withTheme(page, theme);
    await page.goto('/');

    const sheet = page.locator('article.technical-drawing-stack .paper-front > section').first();
    await sheet.scrollIntoViewIfNeeded();

    const [painted, picked] = await sheet.evaluate((el) => {
      // Both come back as oklch() here, so a canvas fill turns each into the pixel it paints.
      const rgb = (colour: string) => {
        const cx = document.createElement('canvas').getContext('2d')!;
        cx.fillStyle = colour;
        cx.fillRect(0, 0, 1, 1);
        return [...cx.getImageData(0, 0, 1, 1).data.slice(0, 3)];
      };
      const paper = getComputedStyle(document.documentElement).getPropertyValue('--theme-paper').trim();
      return [rgb(getComputedStyle(el).backgroundColor), rgb(paper)];
    });

    expect(painted).toEqual(picked);
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
