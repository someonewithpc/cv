import { chromium } from '/home/user/cv/node_modules/@playwright/test/index.mjs';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
for (const width of [390, 1024, 1025, 1100, 1440]) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, ignoreHTTPSErrors: true });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text().slice(0, 160)); });
  page.on('requestfailed', (r) => errors.push('FAILED ' + r.url().slice(0, 120) + ' ' + (r.failure()?.errorText ?? '')));
  const t0 = Date.now();
  await page.goto('http://localhost:4320/', { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const first = await page.evaluate(() => ({ se: document.fonts.check('16px "Special Elite"'), st: document.fonts.check('16px "Allerta Stencil"'), po: document.fonts.check('16px Poppins'), links: [...document.querySelectorAll('link[rel=stylesheet]')].map(l => l.media), n: document.fonts.size, statuses: [...document.fonts].map(f => f.family + ':' + f.status).slice(0, 12) }));
  await page.waitForTimeout(4000);
  const later = await page.evaluate(() => ({ se: document.fonts.check('16px "Special Elite"'), st: document.fonts.check('16px "Allerta Stencil"'), po: document.fonts.check('16px Poppins'), links: [...document.querySelectorAll('link[rel=stylesheet]')].map(l => l.media), name: getComputedStyle(document.querySelector('#profile h1')).fontFamily.slice(0, 40) }));
  console.log(width, 'after ready', JSON.stringify(first), '\n     +4s', JSON.stringify(later), 'ms', Date.now() - t0, '\n     errors', errors.slice(0, 6));
  await context.close();
}
await browser.close();
