import { chromium } from '/home/user/cv/node_modules/@playwright/test/index.mjs';
import { mkdirSync } from 'node:fs';

const OUT = '/tmp/claude-0/-home-user-cv/ad5a465e-e56e-531f-8e9f-f3d4970b9a55/scratchpad/design-review/shots';
mkdirSync(OUT, { recursive: true });

const BASE = 'http://localhost:4320/';
const THEMES = ['light', 'dark', 'arctic', 'dark-forest'];

// what to shoot per (theme, width): full page and/or viewport shots
const PLAN = [
  // light at every width, everything
  ...[390, 1024, 1100, 1280, 1440, 1728, 1920, 2560].map((w) => ({ theme: 'light', width: w, full: true, views: ['top', 'mat', 'folio', 'contrib'] })),
  // the other themes at the widths that matter for the desk
  ...['dark', 'arctic', 'dark-forest'].flatMap((theme) => [
    { theme, width: 1024, full: false, views: ['mat'] },
    { theme, width: 1280, full: false, views: ['top', 'mat'] },
    { theme, width: 1440, full: true, views: ['top', 'mat', 'folio', 'contrib'] },
    { theme, width: 1728, full: false, views: ['mat'] },
    { theme, width: 1920, full: theme === 'dark', views: ['top', 'mat', 'folio', 'contrib'] },
    { theme, width: 2560, full: false, views: ['top', 'mat', 'contrib'] },
    { theme, width: 390, full: false, views: ['top', 'contrib'] },
  ]),
];

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

for (const item of PLAN) {
  const { theme, width, full, views } = item;
  const height = width >= 2560 ? 1200 : 900;
  const context = await browser.newContext({
    viewport: { width, height },
    ignoreHTTPSErrors: true,
    deviceScaleFactor: 1,
  });
  await context.addInitScript((id) => {
    try { localStorage.setItem('cv-theme', id); } catch {}
  }, theme);
  const page = await context.newPage();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(2000);

  const name = (what) => `${OUT}/${theme}-${width}-${what}.png`;

  for (const view of views) {
    if (view === 'top') {
      await page.evaluate(() => window.scrollTo(0, 0));
    } else if (view === 'mat') {
      await page.evaluate(() => {
        const first = document.querySelector('#demos .callout');
        const top = first.getBoundingClientRect().top + window.scrollY;
        window.scrollTo(0, Math.max(0, top - 140));
      });
    } else if (view === 'folio') {
      await page.evaluate(() => {
        const demos = document.querySelector('#demos').getBoundingClientRect();
        window.scrollTo(0, demos.top + window.scrollY + 400);
      });
    } else if (view === 'contrib') {
      await page.evaluate(() => {
        const sheet = document.querySelector('#open-source section[data-group]');
        const top = sheet.getBoundingClientRect().top + window.scrollY;
        window.scrollTo(0, Math.max(0, top - 120));
      });
    }
    await page.waitForTimeout(600);
    await page.screenshot({ path: name(view), fullPage: false });
    console.log('shot', name(view));
  }

  if (full) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
    await page.screenshot({ path: name('full'), fullPage: true });
    console.log('shot', name('full'));
  }

  await context.close();
}

await browser.close();
