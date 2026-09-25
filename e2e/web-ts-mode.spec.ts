import { expect, test, type Locator, type Page } from '@playwright/test';

import { frontPage, frontPageIndex, frontPageName, settledAfter, swipeStack } from './support/paperStack';

const PAGES = ['web-ts-mode', 'Parser Ranges', 'Selector Depth Hue', 'Doctor Report'];

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

function webTsStack(page: Page) {
  // By title, not by position: the demos run gains stacks over time.
  return page.locator('article.technical-drawing-stack').filter({
    has: page.locator('h2.typewriter', { hasText: 'web-ts-mode' }),
  });
}

async function liveBuffer(page: Page): Promise<Locator> {
  const stack = webTsStack(page);
  await stack.scrollIntoViewIfNeeded();
  return frontPage(stack, await frontPageIndex(stack)).locator('[data-web-ts-buffer]');
}

test('web-ts-mode: forward swipes visit every page in order, then wrap', async ({ page }) => {
  const stack = webTsStack(page);
  await stack.scrollIntoViewIfNeeded();
  // fold-drag.ts has taken the stack over (the wheel turns pages only then), the scroll has
  // stopped under it and its own transitions have run out.
  await expect(stack).toHaveAttribute('aria-roledescription', 'paper stack');
  await expect.poll(async () => {
    const before = await stack.evaluate((el) => el.getBoundingClientRect().top);
    await page.evaluate(() => new Promise(requestAnimationFrame));
    return before === (await stack.evaluate((el) => el.getBoundingClientRect().top));
  }).toBe(true);
  await settledAfter(stack, async () => {}, false);

  expect(await stack.locator(':scope > div').count()).toBe(PAGES.length);
  expect(await frontPageName(stack)).toBe(PAGES[0]);

  for (let i = 1; i < PAGES.length; i += 1) {
    await swipeStack(page, stack, true);
    expect(await frontPageName(stack), `page ${i} after ${i} forward swipe(s)`).toBe(PAGES[i]);
  }

  await swipeStack(page, stack, true);
  expect(await frontPageName(stack)).toBe(PAGES[0]);
});

test('main page: a painted buffer, cut into the ranges each parser is handed', async ({ page }) => {
  const buffer = await liveBuffer(page);

  await expect(buffer).toContainText('colours the code with a small lexer');

  // The frontmatter and the style body are whole-line blocks; the one interpolation sits
  // inside its line.
  await expect(buffer.locator('.block[data-lang="tsx"]')).toContainText('type Props');
  await expect(buffer.locator('.block[data-lang="scss"]').first()).toContainText('place-items');
  await expect(buffer.locator('.range[data-lang="tsx"]')).toHaveCount(1);

  // The braces stay with the Astro parser: the offset leaves them out of the range.
  const interpolation = buffer.locator('.range', { hasText: 'label' });
  await expect(interpolation).toHaveText('label');
});

test('main page: dashed boxes over the buffer nest astro around html around the embedded ranges', async ({ page }) => {
  const buffer = await liveBuffer(page);
  const bands = buffer.locator('.bands .band');
  const band = async (lang: string, lane: number) => {
    const found = bands.and(buffer.locator(`[data-lang="${lang}"][data-lane="${lane}"]`));
    await expect(found).toHaveCount(1);
    const [from, to] = await found.evaluate((el) => [Number(el.dataset.from), Number(el.dataset.to)]);
    return { from, to, box: (await found.boundingBox())!, label: await found.locator('.band-label').innerText() };
  };

  const astro = await band('astro', 0);
  const frontmatter = await band('tsx', 1);
  const html = await band('html', 1);
  const expression = await band('tsx', 2);
  const style = await band('scss', 2);

  // The lines Emacs 31.1 gives each parser in WipStamp.astro.
  expect([astro.from, astro.to]).toEqual([1, 79]);
  expect([frontmatter.from, frontmatter.to]).toEqual([2, 10]);
  expect([html.from, html.to]).toEqual([13, 79]);
  expect([expression.from, expression.to]).toEqual([16, 16]);
  expect([style.from, style.to]).toEqual([23, 78]);
  expect(html.label).toBe('html 13-79');

  // One style for every range: a dashed box, and nothing else outlines the code.
  const styles = await bands.evaluateAll((all) => all.map((el) => getComputedStyle(el).borderTopStyle));
  expect(styles).toEqual(Array(5).fill('dashed'));
  const otherOutlines = await buffer.locator('.block, .range').evaluateAll((all) =>
    all.map((el) => getComputedStyle(el).outlineStyle).filter((style) => style !== 'none'),
  );
  expect(otherOutlines).toEqual([]);

  const inside = (inner: typeof astro, outer: typeof astro) => {
    expect(inner.from).toBeGreaterThanOrEqual(outer.from);
    expect(inner.to).toBeLessThanOrEqual(outer.to);
    // Drawn inside too, inset on the left and on the right so both outlines show.
    expect(inner.box.x).toBeGreaterThan(outer.box.x);
    expect(inner.box.x + inner.box.width).toBeLessThan(outer.box.x + outer.box.width);
    expect(inner.box.y).toBeGreaterThanOrEqual(outer.box.y - 1);
    expect(inner.box.y + inner.box.height).toBeLessThanOrEqual(outer.box.y + outer.box.height + 1);
  };
  inside(frontmatter, astro);
  inside(html, astro);
  inside(expression, html);
  inside(style, html);
});

test('main page: the code keeps clear of the scrollbar', async ({ page }) => {
  const buffer = await liveBuffer(page);
  const text = buffer.locator('.emacs-window .text');
  const gap = await text.evaluate((el) => {
    const style = getComputedStyle(el);
    const code = el.querySelector('.line code')!.getBoundingClientRect();
    const box = el.getBoundingClientRect();
    // Where the scrollbar starts, or the edge when there is none.
    const scrollbarStart = box.left + el.clientLeft + el.clientWidth;
    return { gap: scrollbarStart - code.right, em: parseFloat(style.fontSize) };
  });
  expect(gap.gap).toBeGreaterThanOrEqual(gap.em * 0.5);
});

test('main page: the toggle shows and hides the range outlines', async ({ page }) => {
  const buffer = await liveBuffer(page);
  const toggle = buffer.locator('.show-ranges');
  const bands = buffer.locator('.bands');

  await expect(toggle).toBeChecked();
  await expect(bands).toBeVisible();

  await toggle.uncheck();
  await expect(bands).toBeHidden();
});

test('main page: pointing at a token lights up the range that owns it', async ({ page }) => {
  const buffer = await liveBuffer(page);
  const echo = buffer.locator('.echo');
  const visibleEcho = () => echo.locator('span').filter({ visible: true });

  await expect(visibleEcho()).toHaveText(/Point at the code/);

  const interpolation = buffer.locator('.range', { hasText: 'label' });
  const idle = await interpolation.evaluate((el) => getComputedStyle(el).backgroundColor);
  await interpolation.hover();
  await expect(visibleEcho()).toHaveText("tsx: element (html_interpolation), :offset '(1 . -1), :local t");
  expect(await interpolation.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(idle);

  await buffer.locator('.block[data-lang="scss"]').first().hover();
  await expect(visibleEcho()).toHaveText(/^scss: style_element \(raw_text\)/);

  // Markup outside every embedded range belongs to the Astro parser itself.
  await buffer.locator('.line', { hasText: 'aria-hidden="true"' }).first().hover();
  await expect(visibleEcho()).toHaveText(/^astro: the host parser/);
});

test('depth page: each selector level gets its own hue, and nesting starts again at 0', async ({ page }) => {
  const stack = webTsStack(page);
  const depthPage = stack.locator(':scope > div').filter({
    has: page.locator('h2.typewriter', { hasText: 'Selector Depth Hue' }),
  });
  const snippet = depthPage.locator('.snippet');

  const depthOf = (text: string) => snippet
    .locator('.f-selector', { hasText: text })
    .first()
    .evaluate((el) => (el as HTMLElement).style.getPropertyValue('--depth') || '0');

  expect(await depthOf('.note-card')).toBe('2');
  expect(await depthOf('.note-fold')).toBe('4');
  expect(await depthOf('.content')).toBe('0');

  // One colour per depth, all different.
  const colours = await depthPage.locator('.scale .swatch').evaluateAll((swatches) =>
    swatches.map((swatch) => getComputedStyle(swatch).backgroundColor),
  );
  expect(colours).toHaveLength(6);
  expect(new Set(colours).size).toBe(6);
});

test('doctor page: the report keeps the real layout and says what is not on PATH', async ({ page }) => {
  const stack = webTsStack(page);
  const doctor = stack.locator(':scope > div').filter({
    has: page.locator('h2.typewriter', { hasText: 'Doctor Report' }),
  });

  const report = doctor.locator('.flow');
  await expect(report).toContainText('web-ts-mode doctor');
  await expect(report).toContainText('jsdoc: ok');
  await expect(report).toContainText('client: eglot');
  await expect(report).toContainText('astro-ls: found');
  await expect(report).toContainText('vue: not found (tried vue-language-server, vls)');
});

for (const theme of ['light', 'dark', 'arctic', 'dark-forest']) {
  test(`depth page: every level stands out from the paper and from the next level, ${theme} theme`, async ({ page }) => {
    await page.addInitScript((id) => {
      try {
        localStorage.setItem('cv-theme', id);
      } catch {
        /* ignore */
      }
    }, theme);
    await page.goto('/');

    const scale = webTsStack(page).locator('.scale');
    const measured = await scale.evaluate((plate) => {
      // Any CSS colour to sRGB bytes, the way it lands on the screen.
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      const context = canvas.getContext('2d', { willReadFrequently: true })!;
      const bytes = (color: string) => {
        context.clearRect(0, 0, 1, 1);
        context.fillStyle = color;
        context.fillRect(0, 0, 1, 1);
        return [...context.getImageData(0, 0, 1, 1).data].slice(0, 3);
      };
      const linear = (v: number) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      const luminance = (c: number[]) => 0.2126 * linear(c[0]) + 0.7152 * linear(c[1]) + 0.0722 * linear(c[2]);
      const contrast = (a: number[], b: number[]) => {
        const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
        return (hi + 0.05) / (lo + 0.05);
      };
      const oklab = (c: number[]) => {
        const [r, g, b] = c.map(linear);
        const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
        const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
        const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
        return [
          0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
          1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
          0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
        ];
      };
      const distance = (a: number[], b: number[]) => {
        const [p, q] = [oklab(a), oklab(b)];
        return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
      };

      const paper = bytes(getComputedStyle(plate).backgroundColor);
      const levels = [...plate.querySelectorAll('.swatch')].map((swatch) => bytes(getComputedStyle(swatch).backgroundColor));
      return levels.map((level, depth) => ({
        depth,
        onPaper: contrast(level, paper),
        fromPrevious: depth ? distance(level, levels[depth - 1]) : null,
      }));
    });

    expect(measured).toHaveLength(6);
    for (const { depth, onPaper, fromPrevious } of measured) {
      expect(onPaper, `level ${depth} against the paper`).toBeGreaterThanOrEqual(3);
      // About one just noticeable difference in OKLab is 0.02.
      if (fromPrevious !== null) expect(fromPrevious, `level ${depth} against level ${depth - 1}`).toBeGreaterThanOrEqual(0.02);
    }
  });
}
