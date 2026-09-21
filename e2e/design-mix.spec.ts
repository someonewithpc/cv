import { expect, test } from '@playwright/test';

/** The width past which Layout.astro lays the page on a desk. */
const DESK_FROM = 1024;

/** --theme-desk per theme, as ThemePicker.astro writes it. */
const DESKS = {
  light: 'oklch(0.87 0.022 76)',
  dark: 'oklch(0.175 0.018 48)',
  arctic: 'oklch(0.875 0.009 85)',
  'dark-forest': 'oklch(0.225 0.045 58)',
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
const CARDS_FROM = 86 * 16;

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

test('a title card stands beside every detail at 1600px, alternating sides', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
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

for (const width of [CARDS_FROM - 16, 1280, 390]) {
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
      // The index rail is fixed in the margin, not laid down as a band.
      ...[...main.children].filter((el) => !el.classList.contains('full-width') && !el.classList.contains('index-tabs')),
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

  expect(sheets.length).toBeGreaterThanOrEqual(4);
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

/** The sections the rail indexes, in page order, with the heading each one carries itself. */
const SECTIONS = [
  // The ruby bases, without the pronunciation the rt annotations carry.
  { id: 'profile', heading: '#profile h1 ruby span' },
  { id: 'bill-of-materials', heading: '#tech-icon-cloud-label' },
  { id: 'demos', heading: '#demos-heading .typewriter' },
  { id: 'open-source', heading: '#open-source-heading .typewriter' },
];

const readRail = (page: import('@playwright/test').Page) =>
  page.evaluate((sections) => {
    const text = (el: Element | null) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    const box = ({ left, right, top, bottom, width, height }: DOMRect) =>
      ({ left, right, top, bottom, width, height });

    const tabs = [...document.querySelectorAll<HTMLAnchorElement>('.index-tabs a')].map((tab) => ({
      href: tab.getAttribute('href')!,
      number: text(tab.querySelector('.tab-number')),
      name: text(tab.querySelector('.tab-name')),
      resolves: !!document.querySelector(tab.hash),
      proud: getComputedStyle(tab).getPropertyValue('--proud').trim(),
      current: tab.getAttribute('aria-current'),
      box: box(tab.getBoundingClientRect()),
    }));

    return {
      tabs,
      headings: sections.map(({ heading }) =>
        [...document.querySelectorAll(heading)].map(text).join(' ')),
      // Every sheet the page lays down, and the mat with its stacks: what the rail must stay
      // out of. The #demos section itself is the whole viewport wide and holds no ink.
      bands: [...document.querySelectorAll('#profile, #bill-of-materials, #demos > *, #open-source, article.technical-drawing-stack')]
        .map((band) => ({ name: band.id || band.className, ...box(band.getBoundingClientRect()) })),
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    };
  }, SECTIONS);

test('the rail carries one numbered tab per section, each named after that section', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');

  const { tabs, headings } = await readRail(page);

  expect(tabs.map((tab) => tab.name)).toEqual(headings);
  expect(tabs.map((tab) => tab.href)).toEqual(SECTIONS.map(({ id }) => `#${id}`));
  expect(tabs.map((tab) => tab.number)).toEqual(['01', '02', '03', '04']);
  for (const tab of tabs) {
    expect(tab.resolves, `${tab.href} points at an element on the page`).toBe(true);
  }
});

test('the rail stands in the desk margin, clear of every band the page lays down', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');

  const { tabs, bands } = await readRail(page);

  // The pulled-out tab reaches furthest left, the rest furthest right.
  const edge = Math.max(...tabs.map((tab) => tab.box.right));
  expect(Math.min(...tabs.map((tab) => tab.box.left))).toBeGreaterThan(0);
  expect(bands.length).toBeGreaterThanOrEqual(4);
  for (const band of bands) {
    expect(band.left, `${band.name} starts right of the rail`).toBeGreaterThanOrEqual(edge);
  }
});

test('a tab scrolls to its section and is the one left standing out', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');

  await page.locator('.index-tabs a').nth(2).click();

  const demos = page.locator('.index-tabs a[href="#demos"]');
  await expect(demos).toHaveAttribute('aria-current', 'location');

  const landed = await page.evaluate(() => {
    const section = document.querySelector('#demos')!.getBoundingClientRect();
    const tabs = [...document.querySelectorAll<HTMLAnchorElement>('.index-tabs a')];
    return {
      top: section.top,
      bottom: section.bottom,
      proud: tabs.map((tab) => getComputedStyle(tab).getPropertyValue('--proud').trim()),
      marked: tabs.filter((tab) => tab.hasAttribute('aria-current')).length,
    };
  });

  // The section starts at the top of the screen and runs down past it.
  expect(Math.abs(landed.top)).toBeLessThanOrEqual(2);
  expect(landed.bottom).toBeGreaterThan(0);
  expect(landed.proud).toEqual(['0', '0', '1', '0']);
  expect(landed.marked).toBe(1);
});

test('no rail on a phone, and no tab anywhere over the page', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.waitForTimeout(1000);

  await expect(page.locator('.index-tabs')).toBeHidden();

  const { tabs, scrollWidth, clientWidth } = await readRail(page);
  expect(tabs).toHaveLength(SECTIONS.length);
  for (const tab of tabs) {
    expect(tab.box.width + tab.box.height, `${tab.href} takes no room`).toBe(0);
  }
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
});
