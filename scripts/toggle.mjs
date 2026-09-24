import { chromium } from '/home/user/cv/node_modules/@playwright/test/index.mjs';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true });
await context.addInitScript(() => { try { localStorage.setItem('cv-theme', 'light'); } catch {} });
const page = await context.newPage();
await page.goto('http://localhost:4320/', { waitUntil: 'networkidle' });
await page.evaluate(() => { const s = document.querySelector('#open-source section[data-group]'); window.scrollTo(0, s.getBoundingClientRect().top + scrollY - 100); });
await page.waitForTimeout(500);
const variants = {
  'as is': '',
  'no drop-shadow on .sheet': '#open-source .sheet { filter: none !important; }',
  'no tear mask': '#open-source section[data-group] { mask-image: none !important; }',
  'no fibre pseudo': '#open-source section[data-group]::before { display: none !important; }',
  'no shadow, no mask': '#open-source .sheet { filter: none !important; } #open-source section[data-group] { mask-image: none !important; }',
  'no veneer on main': 'main { background-image: none !important; }',
};
for (const [name, css] of Object.entries(variants)) {
  await page.evaluate((c) => { let s = document.getElementById('probe-css'); if (!s) { s = document.createElement('style'); s.id = 'probe-css'; document.head.append(s); } s.textContent = c; }, css);
  await page.waitForTimeout(200);
  const times = await page.evaluate(async () => {
    const d = document.querySelectorAll('#open-source .row details')[3];
    const out = [];
    for (let i = 0; i < 6; i++) { const t0 = performance.now(); d.open = !d.open; await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); out.push(performance.now() - t0); }
    out.sort((a, b) => a - b); return { median: +out[3].toFixed(1), min: +out[0].toFixed(1) };
  });
  console.log(name.padEnd(28), JSON.stringify(times));
}
await browser.close();
