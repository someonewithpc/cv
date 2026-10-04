import { expect, test, type Page } from '@playwright/test';

import { demoStack, dogEarShown, frontPage, frontPageIndex } from './support/paperStack';

declare global {
  interface Window {
    __viewTransitions: number;
    __themeClips: number;
  }
}

test.use({ reducedMotion: 'reduce' });

test('the dog-ear rests without its pulse', async ({ page }) => {
  await page.goto('/');
  const stack = page.locator('article.technical-drawing-stack').first();
  await stack.scrollIntoViewIfNeeded();
  await dogEarShown(stack);
  // Past the pulse's 1.5s delay, so a pulse that was going to start has started
  await page.waitForTimeout(2000);

  const pulses = await stack.evaluate((el) =>
    el.getAnimations({ subtree: true })
      .filter((animation) => (animation as CSSAnimation).animationName?.startsWith('fold-pulse-')).length);
  expect(pulses).toBe(0);
});

test('a theme pick fades in, without the wipe', async ({ page }) => {
  await page.addInitScript(() => {
    window.__viewTransitions = 0;
    window.__themeClips = 0;
    const startViewTransition = document.startViewTransition?.bind(document);
    if (startViewTransition) {
      document.startViewTransition = (callback) => {
        window.__viewTransitions += 1;
        return startViewTransition(callback);
      };
    }
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (keyframes, options) {
      if (typeof options === 'object' && options.pseudoElement?.startsWith('::view-transition')) window.__themeClips += 1;
      return animate.call(this, keyframes, options);
    };
  });
  await page.goto('/');

  await page.locator('#theme-picker label:has(input[value="dark"])').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const fades = await page.evaluate(() => document.getAnimations()
    .filter((animation) => (animation as CSSAnimation).animationName === 'theme-fade-in').length);
  expect(fades).toBe(1);
  await expect(page.locator('html')).not.toHaveClass(/theme-transition/);
  expect(await page.evaluate(() => [window.__viewTransitions, window.__themeClips])).toEqual([1, 0]);
});

test('a demo waits paused, plays at full motion on play, and pause puts it back', async ({ page }) => {
  await page.goto('/');
  const stack = page.locator('article.technical-drawing-stack').filter({
    has: page.locator('h2.typewriter', { hasText: 'GNU social · Event Dispatch' }),
  });
  await stack.scrollIntoViewIfNeeded();
  const sheet = frontPage(stack, await frontPageIndex(stack));
  const bus = sheet.locator('.event-bus[data-live]');
  await expect(bus).toHaveAttribute('data-ready', 'true', { timeout: 15_000 });
  const deck = sheet.locator('[data-demo-transport]');
  // The deck sits on the sheet itself, the element that carries data-full-motion.
  const drawing = deck.locator('xpath=..');
  const key = (name: string) => deck.locator(`[data-demo-key="${name}"]`);

  await expect(bus).toHaveAttribute('data-autoplay-state', 'paused');
  await expect(deck).toHaveAttribute('data-state', 'paused');
  await expect(deck).toContainText('ANIMATION PAUSED');
  await expect(key('play')).toBeEnabled();
  await expect(sheet.locator('.event-bus-cursor')).toBeHidden();

  await key('play').click();
  await expect(drawing).toHaveAttribute('data-full-motion', '');
  await expect(bus).toHaveAttribute('data-autoplay-state', 'playing');
  await expect(deck).toContainText('AUTO PLAYING');
  // Full motion: the cursor glides from control to control on a timed animation.
  const cursor = sheet.locator('.event-bus-cursor');
  await expect(cursor).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => cursor.evaluate((el) => el.getAnimations()
    .filter((animation) => Number(animation.effect?.getComputedTiming().duration) > 100).length), { timeout: 15_000 })
    .toBeGreaterThan(0);

  await key('pause').click();
  await expect(bus).toHaveAttribute('data-autoplay-state', 'paused');
  await expect(deck).toHaveAttribute('data-state', 'paused');
  await expect(drawing).not.toHaveAttribute('data-full-motion');
});

test('schemaDef resumes its walk once reduced motion is turned off', async ({ page }) => {
  await page.goto('/');
  const stack = demoStack(page, 'schemaDef → Doctrine Metadata');
  await stack.scrollIntoViewIfNeeded();
  const sheet = frontPage(stack, await frontPageIndex(stack));
  const root = sheet.locator('[data-schemadef]');
  await expect(root).toHaveAttribute('data-enhanced', 'true', { timeout: 15_000 });
  await expect(root).toHaveAttribute('data-autoplay-state', 'paused');

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(root).toHaveAttribute('data-autoplay-state', 'playing', { timeout: 5_000 });
});

// The two sheets whose artwork holds still at every setting: nothing on them to play.
const NO_DECK = ['web-ts-mode', 'Paper Stack'];

test('every demo sheet shows its deck paused, with its keys in reach', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/');
  const stacks = page.locator('article.technical-drawing-stack');
  const titles = await stacks.evaluateAll((all) => all.map((stack) => stack.getAttribute('aria-label') ?? ''));
  for (const title of titles) {
    await test.step(title, async () => {
      const stack = demoStack(page, title);
      await stack.scrollIntoViewIfNeeded();
      const deck = frontPage(stack, await frontPageIndex(stack)).locator('[data-demo-transport]');
      if (NO_DECK.includes(title)) {
        await expect(deck).toBeHidden();
        return;
      }
      await expect(deck).toBeVisible({ timeout: 15_000 });
      await expect(deck).toHaveAttribute('data-state', 'paused');
      await expect(deck).toContainText('ANIMATION PAUSED');
      for (const key of ['play', 'pause', 'reset']) {
        await expect(deck.locator(`[data-demo-key="${key}"]`)).toBeVisible();
        await expect(deck.locator(`[data-demo-key="${key}"]`)).toBeEnabled();
      }
    });
  }
});

test('a sheet that only animates plays on request and pause stills it', async ({ page }) => {
  await page.goto('/');
  const stack = demoStack(page, 'Visrez Animated Loading Logo');
  await stack.scrollIntoViewIfNeeded();
  const sheet = frontPage(stack, await frontPageIndex(stack)).locator(':scope > section');
  const deck = sheet.locator('[data-demo-transport]');
  const logoAnimations = () => sheet.locator('.content svg path').evaluateAll((paths) =>
    paths.flatMap((path) => path.getAnimations()).filter((animation) => animation.playState === 'running').length);

  await expect(deck).toBeVisible();
  await expect(deck).toContainText('ANIMATION PAUSED');
  expect(await logoAnimations()).toBe(0);

  await deck.locator('[data-demo-key="play"]').click();
  await expect(sheet).toHaveAttribute('data-full-motion', '');
  await expect(deck).toContainText('PLAYING');
  await expect.poll(logoAnimations).toBeGreaterThan(0);

  await deck.locator('[data-demo-key="pause"]').click();
  await expect(deck).toHaveAttribute('data-state', 'paused');
  await expect(sheet).not.toHaveAttribute('data-full-motion');
  await expect.poll(logoAnimations).toBe(0);
});

test.describe('with full motion', () => {
  test.use({ reducedMotion: 'no-preference' });

  test('a sheet that only animates plays by itself and shows no deck', async ({ page }) => {
    await page.goto('/');
    const stack = demoStack(page, 'Visrez Animated Loading Logo');
    await stack.scrollIntoViewIfNeeded();
    const sheet = frontPage(stack, await frontPageIndex(stack));
    await expect(sheet.locator('.content svg path').first()).toBeVisible();
    await expect(sheet.locator('[data-demo-transport]')).toBeHidden();
  });
});

// Reduced motion shows each sheet as it rests once its motion is done, never half-drawn: a
// note, a title block or a dog-ear that full motion shows has to show here too. Only the
// sheet around the artwork is compared, since a walkthrough changes its own artwork as it
// plays. The page is walked stack by stack first, so every sheet has booted. A booted demo
// sheet shows its deck under reduced motion with script on, and only then, so the walk waits
// for it there: a sheet still booting under load would leave the deck out of the comparison.
// A portrait sheet hands its deck to the stack's callout card.
async function restingLook(page: Page, decksShown: boolean) {
  const stacks = page.locator('article.technical-drawing-stack');
  for (let i = 0; i < await stacks.count(); i++) {
    const stack = stacks.nth(i);
    await stack.scrollIntoViewIfNeeded();
    if (decksShown && !NO_DECK.includes((await stack.getAttribute('aria-label')) ?? '')) {
      await expect.poll(() => stack.evaluate((el) =>
        [...el.querySelectorAll('[data-demo-transport]'), ...el.closest('.callout')?.querySelectorAll('.callout-card > [data-demo-transport]') ?? []]
          .some((deck) => deck.checkVisibility())), { message: 'the sheet never showed its deck', timeout: 15_000 }).toBe(true);
    }
    await page.waitForTimeout(300);
  }
  await page.waitForTimeout(3000);
  return page.evaluate(() => {
    const shown = (el: Element) => {
      const box = el.getBoundingClientRect();
      let opacity = 1;
      for (let node: Element | null = el; node; node = node.parentElement) opacity *= Number(getComputedStyle(node).opacity);
      return el.checkVisibility({ visibilityProperty: true }) && box.width > 0 && box.height > 0 && opacity > 0.99;
    };
    const path = (el: Element) => {
      const steps = [];
      for (let node: Element | null = el; node && node !== document.body; node = node.parentElement) {
        steps.unshift(`${node.tagName}:${[...(node.parentElement?.children ?? [])].indexOf(node)}`);
      }
      return steps.join('>');
    };
    const sheet = [...document.querySelectorAll('article.technical-drawing-stack *')]
      // The deck's hint spans exist only while a walkthrough plays: state, not an element that vanishes.
      .filter((el) => !el.closest('.content, script, style, template, [data-demo-hint]') && shown(el))
      .map(path);
    const notes = [...document.querySelectorAll('aside.marker-font')]
      .map((note) => `${shown(note) ? 'shown' : 'hidden'}: ${note.textContent?.trim().slice(0, 40)}`);
    return { sheet, notes };
  });
}

for (const { width, javaScriptEnabled } of [
  { width: 1440, javaScriptEnabled: true },
  { width: 390, javaScriptEnabled: true },
  { width: 1440, javaScriptEnabled: false },
]) {
  test.describe(`at ${width}px, script ${javaScriptEnabled ? 'on' : 'off'}`, () => {
    test.use({ viewport: { width, height: 900 }, javaScriptEnabled });

    test('every note and every part of the sheet full motion shows is shown at rest', async ({ page, browser, baseURL }) => {
      test.setTimeout(120_000);
      const full = await browser.newContext({ baseURL, viewport: { width, height: 900 }, javaScriptEnabled, reducedMotion: 'no-preference' });
      const fullPage = await full.newPage();
      await Promise.all([page.goto('/'), fullPage.goto('/')]);
      const [reduced, moving] = await Promise.all([restingLook(page, javaScriptEnabled), restingLook(fullPage, false)]);
      await full.close();

      expect(reduced.notes.length).toBeGreaterThan(0);
      expect(reduced.notes).toEqual(moving.notes);
      // Beside the artwork, every note is out on its sheet; narrower, it waits under the dog-ear.
      if (width === 1440 && javaScriptEnabled) expect(reduced.notes.filter((note) => note.startsWith('hidden'))).toEqual([]);
      expect(moving.sheet.filter((part) => !reduced.sheet.includes(part))).toEqual([]);
    });
  });
}
