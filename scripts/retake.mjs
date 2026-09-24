import { chromium } from '/home/user/cv/node_modules/@playwright/test/index.mjs';

const OUT = '/tmp/claude-0/-home-user-cv/ad5a465e-e56e-531f-8e9f-f3d4970b9a55/scratchpad/design-review/shots';
const BASE = 'http://localhost:4320/';
// (theme, width, views) to retake with the webfonts confirmed loaded
const PLAN = JSON.parse(process.argv[2]);

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
for (const { theme, width, views, full } of PLAN) {
  const height = width >= 2560 ? 1200 : 900;
  const context = await browser.newContext({ viewport: { width, height }, ignoreHTTPSErrors: true });
  await context.addInitScript((id) => { try { localStorage.setItem('cv-theme', id); } catch {} }, theme);
  const page = await context.newPage();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  let ok = false;
  for (let attempt = 0; attempt < 4 && !ok; attempt++) {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    for (let i = 0; i < 40; i++) {
      ok = await page.evaluate(() => { const l = [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family.replace(/"/g, '')); return l.some(f => f.includes('Special Elite')) && l.some(f => f.includes('Poppins')) && l.some(f => f.includes('Permanent')); });
      if (ok) break;
      await page.waitForTimeout(250);
    }
    if (!ok) console.log('fonts not loaded, retry', theme, width, attempt);
  }
  await page.waitForTimeout(2000);
  const name = (what) => `${OUT}/${theme}-${width}-${what}.png`;
  for (const view of views) {
    if (view === 'top') await page.evaluate(() => window.scrollTo(0, 0));
    else if (view === 'mat') await page.evaluate(() => { const first = document.querySelector('#demos .callout'); window.scrollTo(0, Math.max(0, first.getBoundingClientRect().top + scrollY - 140)); });
    else if (view === 'folio') await page.evaluate(() => { const d = document.querySelector('#demos').getBoundingClientRect(); window.scrollTo(0, d.top + scrollY + 400); });
    else if (view === 'contrib') await page.evaluate(() => { const s = document.querySelector('#open-source section[data-group]'); window.scrollTo(0, Math.max(0, s.getBoundingClientRect().top + scrollY - 120)); });
    await page.waitForTimeout(600);
    await page.screenshot({ path: name(view) });
    console.log('shot', name(view), 'fonts', ok);
  }
  if (full) { await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(300); await page.screenshot({ path: name('full'), fullPage: true }); console.log('shot', name('full')); }
  await context.close();
}
await browser.close();
