import { expect, test, type Page } from '@playwright/test';

import { EVENT_PATH, SESSION_PATTERN } from '../src/analytics';
import { demoStack, pressTurn } from './support/paperStack';

// The page's own beacons, caught before they reach the worker. src/client/analytics.ts sends
// only on hsal.es and not under automation. The astro server only answers to localhost, so
// these specs load http://hsal.es/ and have each request answered from the test server; the
// specs that expect beacons also report navigator.webdriver as false.

async function serveAsProduction(page: Page, baseURL: string | undefined): Promise<void> {
  await page.route('http://hsal.es/**', async (route) => {
    const { pathname, search } = new URL(route.request().url());
    if (pathname === EVENT_PATH) return route.fallback();
    await route.fulfill({ response: await route.fetch({ url: new URL(pathname + search, baseURL).href }) });
  });
}

async function hideAutomation(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });
}

type Beacon = { s: string, e: (string | number)[][] };

async function catchBeacons(page: Page): Promise<Beacon[]> {
  const beacons: Beacon[] = [];
  await page.route(`**${EVENT_PATH}`, async (route) => {
    expect(route.request().method()).toBe('POST');
    beacons.push(JSON.parse(route.request().postData() ?? '') as Beacon);
    await route.fulfill({ status: 204 });
  });
  return beacons;
}

const events = (beacons: Beacon[]) => beacons.flatMap((beacon) => beacon.e);
const named = (beacons: Beacon[], name: string) => events(beacons).filter(([event]) => event === name);

test('a visit reports the load, the sections reached, a flip, a theme pick, a print, a contact click and the leave', async ({ page, baseURL }) => {
  await hideAutomation(page);
  const beacons = await catchBeacons(page);
  await serveAsProduction(page, baseURL);
  await page.goto('http://hsal.es/');

  const stack = demoStack(page, 'Interactive Map Marker Editor');
  await stack.scrollIntoViewIfNeeded();
  await pressTurn(stack, 'ArrowRight');
  await page.locator('#theme-picker label:has(input[value="dark"])').click();
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  const opened = page.context().waitForEvent('page');
  await page.locator('#profile [data-contact="github"] a').click();
  await (await opened).close();

  // The tab going hidden sends what is queued at once, the leave with it.
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { get: () => 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(() => named(beacons, 'leave').length, { timeout: 10_000 }).toBe(1);

  const visits = named(beacons, 'visit');
  expect(visits).toHaveLength(1);
  const [, referrer, viewport, theme] = visits[0];
  expect(referrer).toBe('');
  expect(viewport).toBe('wide');
  expect(theme).toMatch(/^os-(light|dark)$/);

  const sections = named(beacons, 'section').map(([, id]) => id);
  expect(sections).toContain('profile');
  expect(sections).toContain('marker-editor');
  expect(new Set(sections).size, 'a section reported twice').toBe(sections.length);

  expect(named(beacons, 'flip')).toEqual([['flip', 'marker-editor', 'selector']]);
  expect(named(beacons, 'demo')).toEqual([['demo', 'marker-editor']]);
  expect(named(beacons, 'theme')).toEqual([['theme', 'dark']]);
  expect(named(beacons, 'print')).toEqual([['print']]);
  expect(named(beacons, 'contact')).toEqual([['contact', 'github']]);
  const [[, seconds]] = named(beacons, 'leave');
  expect(seconds).toBeGreaterThanOrEqual(0);
  expect(Number.isInteger(seconds)).toBe(true);

  const sessions = new Set(beacons.map((beacon) => beacon.s));
  expect(sessions.size).toBe(1);
  expect([...sessions][0]).toMatch(SESSION_PATTERN);
});

test('every sheet carries a stable id and every demo a slug', async ({ page }) => {
  await page.goto('/');
  const stacks = await page.locator('article.technical-drawing-stack').evaluateAll((els) => els.map((stack) => ({
    demo: stack.closest<HTMLElement>('[data-demo]')?.dataset.demo ?? '',
    sheets: [...stack.querySelectorAll<HTMLElement>(':scope > div > section')].map((sheet) => sheet.dataset.sheetId ?? ''),
  })));
  expect(stacks.length).toBeGreaterThan(0);
  for (const { demo, sheets } of stacks) {
    expect(demo, 'a stack outside a named demo').toMatch(/^[a-z0-9-]+$/);
    expect(demo).not.toMatch(/-demo$/);
    for (const sheet of sheets) expect(sheet, `an unnamed sheet in ${demo}`).toMatch(/^[a-z0-9-]+$/);
    expect(new Set(sheets).size, `a sheet id repeated in ${demo}`).toBe(sheets.length);
  }
  const demos = stacks.map(({ demo }) => demo);
  expect(new Set(demos).size, 'a demo slug repeated').toBe(demos.length);
});

test('Global Privacy Control stops every beacon', async ({ page, baseURL }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'globalPrivacyControl', { get: () => true });
  });
  await hideAutomation(page);
  const beacons = await catchBeacons(page);
  await serveAsProduction(page, baseURL);
  await page.goto('http://hsal.es/');
  await page.locator('#theme-picker label:has(input[value="dark"])').click();
  await page.waitForTimeout(3000);
  expect(beacons).toEqual([]);
});

test('on hsal.es an automated browser sends nothing', async ({ page, baseURL }) => {
  const beacons = await catchBeacons(page);
  await serveAsProduction(page, baseURL);
  await page.goto('http://hsal.es/');
  await page.locator('#theme-picker label:has(input[value="dark"])').click();
  await page.waitForTimeout(3000);
  expect(beacons).toEqual([]);
});

test('a host other than hsal.es sends nothing', async ({ page, baseURL }) => {
  await hideAutomation(page);
  const beacons = await catchBeacons(page);
  await page.goto('/');
  await page.locator('#theme-picker label:has(input[value="dark"])').click();
  await page.waitForTimeout(3000);
  expect(beacons).toEqual([]);
});
