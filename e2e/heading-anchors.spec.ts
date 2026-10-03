import { expect, test } from '@playwright/test';

const opacity = (el: import('@playwright/test').Locator) =>
  el.evaluate((node) => Number(getComputedStyle(node).opacity));

test('every section and demo title has an anchor to an existing id, named after its title', async ({ page }) => {
  await page.goto('/');
  const anchors = page.locator('a.anchor');
  // Career, bill of materials, demos, open source, and the fifteen demo callouts.
  expect(await anchors.count()).toBeGreaterThanOrEqual(19);

  for (const anchor of await anchors.all()) {
    await expect(anchor).toHaveAttribute('aria-label', /^Link to (?!Detail)\S/);
    const href = await anchor.getAttribute('href');
    expect(href).toMatch(/^#[a-z0-9-]+$/);
    await expect(page.locator(`[id="${href!.slice(1)}"]`), `no element for ${href}`).toHaveCount(1);
  }

  await expect(page.locator('a.anchor[href="#career"]')).toHaveAttribute('aria-label', 'Link to Career');
  await expect(page.locator('a.anchor[href="#paper-stack"]')).toHaveAttribute('aria-label', 'Link to Paper stack');
});

test('the link shows on hover and focus, stays in the tab order, and sets the fragment', async ({ page }) => {
  await page.goto('/');
  const heading = page.locator('#career-heading');
  const anchor = page.locator('a.anchor[href="#career"]');

  expect(await opacity(anchor)).toBe(0);
  await heading.hover();
  await expect.poll(() => opacity(anchor)).toBe(1);

  await page.mouse.move(0, 0);
  await expect.poll(() => opacity(anchor)).toBe(0);
  await anchor.focus();
  await expect(anchor).toBeFocused();
  await expect.poll(() => opacity(anchor)).toBe(1);

  await anchor.press('Enter');
  await expect(page).toHaveURL(/#career$/);
});

test('the link stands beside the title, clear of the heading text', async ({ page }) => {
  await page.goto('/');
  for (const [heading, anchor] of [
    ['#career-heading', 'a.anchor[href="#career"]'],
    ['#demos-heading', 'a.anchor[href="#demos"]'],
    ['#open-source-heading', 'a.anchor[href="#open-source"]'],
    ['#detail-a .callout-text', 'a.anchor[href="#loading-logo"]'],
  ]) {
    const h = (await page.locator(heading).boundingBox())!;
    const a = (await page.locator(anchor).boundingBox())!;
    expect(a.x, `${anchor} overlaps ${heading}`).toBeGreaterThanOrEqual(h.x + h.width - 1);
  }
});

for (const id of ['career', 'demos', 'loading-logo', 'paper-stack', 'open-source']) {
  test(`a fresh load of #${id} lands on it and stays after the page boots`, async ({ page }) => {
    await page.goto(`/#${id}`);
    await page.waitForTimeout(3000);
    const top = await page.locator(`[id="${id}"]`).evaluate((el) => el.getBoundingClientRect().top);
    expect(Math.abs(top)).toBeLessThanOrEqual(1);
  });
}

for (const width of [390, 768, 1440]) {
  test(`the icon is as tall as its title's capitals and centred on them at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await page.evaluate(() => document.fonts.ready);
    for (const theme of ['dark', 'arctic', 'dark-forest', 'light']) {
      await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
      await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
      await page.evaluate(() => document.fonts.ready);
      const rows = await page.evaluate(() => {
        const out: { name: string; height: number; offset: number; wrapped: boolean }[] = [];
        for (const a of document.querySelectorAll<HTMLElement>('a.anchor')) {
          const t = a.parentElement!.querySelector<HTMLElement>('.callout-title') ?? a.parentElement!.querySelector<HTMLElement>('.typewriter');
          if (!t) continue;
          const icon = a.querySelector('svg')!.getBoundingClientRect();
          if (!icon.height) continue;
          const style = getComputedStyle(t);
          const ctx = document.createElement('canvas').getContext('2d')!;
          ctx.font = `100px ${style.fontFamily}`;
          const cap = (ctx.measureText('H').actualBoundingBoxAscent / 100) * parseFloat(style.fontSize);
          const probe = document.createElement('span');
          probe.style.cssText = 'display: inline-block; width: 0; height: 0';
          t.append(probe);
          const baseline = probe.getBoundingClientRect().bottom;
          probe.remove();
          out.push({
            name: a.getAttribute('href')!,
            height: icon.height - cap,
            offset: (icon.top + icon.bottom) / 2 - (baseline - cap / 2),
            wrapped: a.getBoundingClientRect().top > t.getBoundingClientRect().bottom,
          });
        }
        return out;
      });
      expect(rows.length).toBeGreaterThanOrEqual(3);
      for (const r of rows) {
        expect(Math.abs(r.height), `${r.name} ${theme}: icon vs capital height`).toBeLessThanOrEqual(1);
        expect(Math.abs(r.offset), `${r.name} ${theme}: icon centre vs capitals' centre`).toBeLessThanOrEqual(0.5);
        expect(r.wrapped, `${r.name} ${theme} wraps below its title`).toBe(false);
      }
    }
  });
}
