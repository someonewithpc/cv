import type { Locator, Page } from '@playwright/test';

import { frontPage, frontPageIndex, frontPageName } from './support/paperStack';
import { expect, pageWait, test } from './support/timeScale';

const PAGES = ['Fediverse Playground', 'A Branch for Every Server', 'Bringing a Server Up', 'Names on the Network'];

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

function playgroundStack(page: Page) {
  // By title, not by position: the demos run gains stacks over time.
  return page.locator('article.technical-drawing-stack').filter({
    has: page.locator('h2.typewriter', { hasText: 'Fediverse Playground' }),
  });
}

async function mountedPlayground(page: Page) {
  const stack = playgroundStack(page);
  await stack.scrollIntoViewIfNeeded();
  const front = frontPage(stack, await frontPageIndex(stack));
  const host = front.locator('[data-fediverse-playground]');
  await expect(host).toHaveAttribute('data-mounted', 'true', { timeout: 15_000 });
  return host;
}

// The sheet holds a landscape and a portrait drawing and shows one; the other's nodes are hidden.
const node = (host: Locator, service: string) => host.locator(`.service-graph:visible .node[data-service="${service}"]`);
const links = (host: Locator, server: string) => host.locator(`.service-graph:visible .link[data-from="${server}"]`);
const linkTargets = (host: Locator, server: string) => links(host, server).evaluateAll((paths) =>
  paths.map((path) => (path as SVGPathElement).dataset.to).sort());

/** One page on with the arrow key: no hand on the paper, so the turn commits on the spot and
    does not hang on how quickly the wheel events come through. Waits until the named page is
    in front, rather than a fixed time the flip may or may not take under load. */
async function turnForwardTo(page: Page, stack: Locator, name: string, note: string) {
  await stack.focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => frontPageName(stack), { message: note, timeout: 10_000 }).toBe(name);
}

test('fediverse playground: the copy is about a federated network', async ({ page }) => {
  const stack = playgroundStack(page);
  const card = page.locator('section.callout[aria-labelledby="detail-i"] .title-card');
  await expect(card).toContainText('small federated network on one machine');
  await expect(stack.locator('.intro')).toContainText('how fediverse servers talk to each other');
  await expect(stack.locator('.config .file')).toContainText('recipes: social-v3, social-v2, mastodon');
  await expect(stack.locator('.config .file')).toContainText('planned: lemmy, friendica, gnu-social-v1');
});

test('fediverse playground: the Names on the Network table lists the Mastodon server\'s two names', async ({ page }) => {
  const table = playgroundStack(page).locator('.hosts-layer table');
  await expect(table.locator('tr.server th', { hasText: 'mastodon-carol' })).toHaveCount(1);
  await expect(table.locator('th.name code', { hasText: /^carol\.localhost$/ })).toHaveCount(1);
  await expect(table.locator('th.name code', { hasText: /^carol\.fediverse$/ })).toHaveCount(1);
});

/**
 * #136's rule, held on every page of this stack: both logos lie inside the logo cell, and each
 * logo's box is the size other demos give theirs. The PostgreSQL elephant, which fills its whole
 * box, overflowed the cell and covered the Bash logo at 390.
 */
for (const [width, height] of [[390, 844], [760, 900], [1440, 900]]) {
  test(`fediverse playground: every page's logos sit inside their cell at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await page.addStyleTag({ content: '* { rotate: none !important; transform: none !important; translate: none !important; }' });

    const stack = playgroundStack(page);
    const reference = page.locator('article.technical-drawing-stack').filter({
      has: page.locator('h2.typewriter', { hasText: 'Space Builder' }),
    }).first().locator('td.title-tech .tech-icon').first();
    const size = await reference.evaluate((el) => el.getBoundingClientRect().width);

    const wrong = await stack.locator('td.title-tech').evaluateAll((cells, expected) => cells.flatMap((td) => {
      const title = td.closest('section')?.querySelector('h2')?.textContent?.trim() ?? '?';
      const cell = td.getBoundingClientRect();
      const icons = [...td.querySelectorAll<HTMLElement>('.tech-icon')];
      const found: string[] = [];
      if (icons.length !== 2) found.push(`${title}: ${icons.length} logos`);
      icons.forEach((icon) => {
        const name = icon.querySelector('svg')?.dataset.icon ?? '?';
        const box = icon.getBoundingClientRect();
        if (Math.abs(box.width - expected) > 0.5) found.push(`${title}: ${name} is ${box.width.toFixed(1)}px, others ${expected.toFixed(1)}px`);
        const drawn = icon.querySelector('svg')!.getBoundingClientRect();
        if (drawn.left < cell.left - 0.5 || drawn.right > cell.right + 0.5 || drawn.top < cell.top - 0.5 || drawn.bottom > cell.bottom + 0.5) {
          found.push(`${title}: ${name} leaves its cell`);
        }
      });
      return found;
    }), size);

    expect(wrong).toEqual([]);

    // #129: the rightmost column's "completed" label ran past the edge of its own drawing at a
    // narrow width. Every one has to stay inside the SVG that draws it, whichever side it sits on.
    const gateProblems = await stack.locator('svg.service-graph:visible').evaluateAll((svgs) => svgs.flatMap((svg) => {
      const sheet = svg.getBoundingClientRect();
      return [...svg.querySelectorAll('text.gate')].flatMap((label) => {
        const box = label.getBoundingClientRect();
        if (box.left < sheet.left - 0.5 || box.right > sheet.right + 0.5 || box.top < sheet.top - 0.5 || box.bottom > sheet.bottom + 0.5) {
          return [`"${label.textContent}" at ${box.left.toFixed(1)}..${box.right.toFixed(1)}, sheet ${sheet.left.toFixed(1)}..${sheet.right.toFixed(1)}`];
        }
        return [];
      });
    }));
    expect(gateProblems).toEqual([]);
  });
}

test('fediverse playground: the arrow key visits every page in order, then wraps', async ({ page }) => {
  const stack = playgroundStack(page);
  await stack.scrollIntoViewIfNeeded();

  expect(await stack.locator(':scope > div').count()).toBe(PAGES.length);
  await expect.poll(() => frontPageName(stack)).toBe(PAGES[0]);

  for (let i = 1; i < PAGES.length; i += 1) {
    await turnForwardTo(page, stack, PAGES[i], `page ${i} after ${i} turn(s)`);
  }

  await turnForwardTo(page, stack, PAGES[0], 'wrapped to the first page');
});

test.describe('with reduced motion', () => {
  // The walkthrough stays off, so every toggle starts from the config the page opens on.
  test.use({ reducedMotion: 'reduce' });

  test('main page: the toggles rebuild the graph, and shared services appear once', async ({ page }) => {
    const host = await mountedPlayground(page);
    const toggle = (name: string) => host.locator(`input[name="${name}"]`);

    // The opening state: the two v3 nodes and Mastodon up, the v2 node off.
    await expect(host.locator('.toggle input')).toHaveCount(4);
    await expect(toggle('mastodon-carol')).toBeChecked();
    for (const service of ['nginx', 'db', 'redis', 'search', 'media', 'gnusocial-alice', 'gnusocial-alice-install', 'gnusocial-bob', 'mastodon-carol', 'mastodon-carol-install']) {
      await expect(node(host, service)).toHaveClass(/emitted/);
    }
    // Mastodon's box names its streaming and sidekiq services too.
    await expect(node(host, 'mastodon-carol')).toHaveAttribute('data-also', 'mastodon-carol-streaming mastodon-carol-sidekiq');
    await expect(node(host, 'mariadb')).toHaveClass(/ghost/);
    await expect(host.locator('[data-status]')).toHaveText('13 services · 28 depends_on, all defined');

    // One line from each server to each shared service it uses, and only Mastodon searches.
    await expect(node(host, 'mastodon-carol').locator('text')).toHaveText(['mastodon-carol', 'mastodon', 'carol.localhost', '3 processes']);
    expect(await linkTargets(host, 'gnusocial-alice')).toEqual(['db', 'media', 'redis']);
    expect(await linkTargets(host, 'gnusocial-bob')).toEqual(['db', 'media', 'redis']);
    expect(await linkTargets(host, 'mastodon-carol')).toEqual(['db', 'media', 'redis', 'search']);
    await expect(links(host, 'gnusocial-v2')).toHaveCount(0);

    // Mastodon off takes its four services and search, and leaves the GNU social pair on
    // Postgres, Redis and media.
    await toggle('mastodon-carol').uncheck();
    await expect(node(host, 'mastodon-carol')).toHaveClass(/ghost/);
    await expect(node(host, 'search')).toHaveClass(/ghost/);
    await expect(node(host, 'db')).toHaveClass(/emitted/);
    await expect(node(host, 'media')).toHaveClass(/emitted/);
    await expect(links(host, 'mastodon-carol')).toHaveCount(0);
    await expect(host.locator('[data-status]')).toHaveText('8 services · 12 depends_on, all defined');

    // The v2 node brings mariadb with it; db is still drawn once.
    await toggle('gnusocial-v2').check();
    await expect(node(host, 'mariadb')).toHaveClass(/emitted/);
    await expect(node(host, 'gnusocial-v2-install')).toHaveClass(/emitted/);
    await expect(host.locator('.service-graph:visible .node[data-service="db"]')).toHaveCount(1);
    expect(await linkTargets(host, 'gnusocial-v2')).toEqual(['mariadb']);

    // With only v2 left, nothing asks for Postgres, Redis or media, and the builder does not emit them.
    await toggle('mastodon-carol').uncheck();
    await toggle('gnusocial-alice').uncheck();
    await toggle('gnusocial-bob').uncheck();
    await expect(node(host, 'db')).toHaveClass(/ghost/);
    await expect(node(host, 'redis')).toHaveClass(/ghost/);
    await expect(node(host, 'media')).toHaveClass(/ghost/);
    await expect(node(host, 'nginx')).toHaveClass(/emitted/);

    await toggle('gnusocial-v2').uncheck();
    await expect(node(host, 'nginx')).toHaveClass(/ghost/);
    await expect(host.locator('[data-status]')).toHaveText('No instances: services is empty');
  });

  test('main page: the YAML pane shows the services without volumes or environment, highlighted', async ({ page }) => {
    const host = await mountedPlayground(page);
    const pane = host.locator('details.yaml');
    const code = pane.locator('[data-yaml]');

    await expect(code).toBeHidden();
    await pane.locator('summary').click();
    await expect(code).toBeVisible();
    await expect(code).toContainText('# This file was generated by Fediverse Playground (GPL3+)');
    await expect(code).not.toContainText('gnusocial-v2');

    // No volumes or environment, and no mark where they were: one line under the file says so.
    for (const key of ['volumes:', 'environment:', 'tty:', '# ...']) await expect(code).not.toContainText(key);
    await expect(pane.locator('.left-out')).toContainText('volumes, environment');
    await expect(pane.locator('[data-lines]')).toHaveText(/^\d+ lines, \d+ shown$/);

    // Mastodon's web, streaming and sidekiq services are in it, each waiting on the installer.
    for (const service of ['mastodon-carol-install:', 'mastodon-carol:', 'mastodon-carol-streaming:', 'mastodon-carol-sidekiq:']) {
      await expect(code).toContainText(service);
    }
    await expect(code).toContainText('dockerfile: streaming/Dockerfile');
    for (const line of ['nginx:', 'search:', 'image: elasticsearch:7.17.4', 'media:', 'image: darthsim/imgproxy']) {
      await expect(code).toContainText(line);
    }
    await expect(code).not.toContainText('web:');

    // Highlighted by the emitter itself: keys, values, quoted strings and comments are spans.
    await expect(code.locator('.y-key', { hasText: /^services$/ })).toHaveCount(1);
    await expect(code.locator('.y-plain', { hasText: /^nginx:alpine$/ })).toHaveCount(1);
    await expect(code.locator('.y-string', { hasText: /^"3"$/ })).toHaveCount(1);
    await expect(code.locator('.y-comment')).toHaveCount(1);
    const [key, value] = await Promise.all(['.y-key', '.y-plain'].map((selector) =>
      code.locator(selector).first().evaluate((el) => getComputedStyle(el).color)));
    expect(key).not.toBe(value);

    await host.locator('input[name="gnusocial-v2"]').check();
    await expect(code).toContainText('gnusocial-v2-install:');
    // nginx waits on every app, and only on apps.
    await expect(code).toContainText('depends_on:\n      - gnusocial-alice\n      - gnusocial-bob\n      - gnusocial-v2\n      - mastodon-carol\n      - mastodon-carol-streaming\n');
  });
});

test.describe('walkthrough', () => {
  // The quiet spell before the walkthrough comes back is 6 s of page time.
  test.use({ walkthroughRate: 3 });

  async function playingPlayground(page: Page) {
    const host = await mountedPlayground(page);
    await expect(host).toHaveAttribute('data-autoplay', 'playing');
    const deck = host.locator('xpath=ancestor::section[1]').locator('[data-demo-transport]');
    return { host, deck };
  }

  test('it flips the toggles itself and reports to the deck', { tag: '@handover' }, async ({ page }) => {
    const { host, deck } = await playingPlayground(page);
    await expect(deck).toBeVisible();
    await expect(deck).toHaveAttribute('data-state', 'playing');
    await expect(deck.locator('[data-demo-caption]')).toHaveText('AUTO PLAYING');

    // Its first move switches v2 on, which brings MariaDB into the file.
    await expect(host.locator('input[name="gnusocial-v2"]')).toBeChecked({ timeout: 10_000 });
    await expect(node(host, 'mariadb')).toHaveClass(/emitted/);
    await expect(host.locator('.demo-cursor')).toBeVisible();

    // Then Mastodon and the v3 pair leave, and nothing asks for Postgres any more.
    await expect(host.locator('input[name="mastodon-carol"]')).not.toBeChecked({ timeout: 30_000 });
    await expect(node(host, 'mastodon-carol')).toHaveClass(/ghost/);
    await expect(host.locator('input[name="gnusocial-alice"]')).not.toBeChecked({ timeout: 10_000 });
    await expect(host.locator('input[name="gnusocial-bob"]')).not.toBeChecked({ timeout: 10_000 });
    await expect(node(host, 'db')).toHaveClass(/ghost/);
  });

  test('moving over it takes over, and nothing flips after that', { tag: '@handover' }, async ({ page }) => {
    const { host, deck } = await playingPlayground(page);
    await expect(host.locator('input[name="gnusocial-v2"]')).toBeChecked({ timeout: 10_000 });

    await host.hover();
    await expect(host).toHaveAttribute('data-autoplay', 'user');
    await expect(deck).toHaveAttribute('data-state', 'user');
    await expect(host.locator('.demo-cursor')).toBeHidden();

    const checked = () => host.locator('input[type=checkbox]').evaluateAll((inputs) =>
      inputs.map((input) => (input as HTMLInputElement).checked));
    const settled = await checked();
    await pageWait(page, 3_000);
    expect(await checked()).toEqual(settled);

    // Left alone, it hands back.
    await page.mouse.move(0, 0);
    await expect(host).toHaveAttribute('data-autoplay', 'playing', { timeout: 10_000 });
  });

  test('the deck keys pause, play and reset it', { tag: '@handover' }, async ({ page }) => {
    const { host, deck } = await playingPlayground(page);
    const key = (name: string) => deck.locator(`[data-demo-key="${name}"]`);
    const alice = host.locator('input[name="gnusocial-alice"]');

    await key('pause').click();
    await expect(host).toHaveAttribute('data-autoplay', 'user');
    await expect(key('pause')).toHaveAttribute('aria-pressed', 'true');
    // Pause holds past the quiet spell that hands a hover back.
    await pageWait(page, 9_000);
    await expect(host).toHaveAttribute('data-autoplay', 'user');

    await key('play').click();
    await expect(host).toHaveAttribute('data-autoplay', 'playing');
    await expect(deck).toHaveAttribute('data-state', 'playing');

    // Reset puts the opening config back and starts over.
    await key('pause').click();
    await expect(host).toHaveAttribute('data-autoplay', 'user');
    await alice.uncheck();
    await expect(node(host, 'gnusocial-alice')).toHaveClass(/ghost/);
    await key('reset').click();
    await expect(host).toHaveAttribute('data-autoplay', 'playing');
    await expect(alice).toBeChecked();
    await expect(node(host, 'gnusocial-alice')).toHaveClass(/emitted/);
  });
});
