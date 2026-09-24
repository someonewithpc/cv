import { chromium } from '/home/user/cv/node_modules/@playwright/test/index.mjs';
import { createRequire } from 'node:module';
const sharp = createRequire(import.meta.url)('/home/user/cv/node_modules/sharp');
const OUT = '/tmp/claude-0/-home-user-cv/ad5a465e-e56e-531f-8e9f-f3d4970b9a55/scratchpad/design-review';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const open = async (theme, width) => {
  const context = await browser.newContext({ viewport: { width, height: 900 }, ignoreHTTPSErrors: true });
  await context.addInitScript((id) => { try { localStorage.setItem('cv-theme', id); } catch {} }, theme);
  const page = await context.newPage();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('http://localhost:4320/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  return { context, page };
};
// 1. rendered desk colour per theme (mean over a bare strip on the right at 1440), as rgb and oklch-ish hue
const toOklch = (r, g, b) => {
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  const L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
  const C = Math.hypot(a, bb); let h = Math.atan2(bb, a) * 180 / Math.PI; if (h < 0) h += 360;
  return { L: +L.toFixed(3), C: +C.toFixed(3), h: +h.toFixed(0) };
};
console.log('=== rendered desk per theme (1440, strip x 1300..1400, y 150..750) ===');
for (const theme of ['light', 'dark', 'arctic', 'dark-forest']) {
  const { context, page } = await open(theme, 1440);
  const buf = await page.screenshot({ clip: { x: 1300, y: 150, width: 100, height: 600 } });
  const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
  let r = 0, g = 0, b = 0; const n = data.length / info.channels;
  for (let i = 0; i < data.length; i += info.channels) { r += data[i]; g += data[i + 1]; b += data[i + 2]; }
  r /= n; g /= n; b /= n;
  const token = await page.evaluate(() => getComputedStyle(document.querySelector('main')).getPropertyValue('--theme-desk').trim());
  console.log(theme.padEnd(12), 'rendered rgb', [r, g, b].map(Math.round).join(','), 'oklch', JSON.stringify(toOklch(r, g, b)), 'token', token);
  await context.close();
}
// 2. repo vs title wrapping at 1440, and alternative column grids
{
  const { context, page } = await open('light', 1440);
  const count = async (css) => {
    await page.evaluate((c) => { let s = document.getElementById('probe-css'); if (!s) { s = document.createElement('style'); s.id = 'probe-css'; document.head.append(s); } s.textContent = c; }, css);
    await page.waitForTimeout(100);
    return page.evaluate(() => {
      const sheet = document.querySelector('#open-source section[data-group]');
      const px = (v) => { const p = document.createElement('div'); p.style.width = v; sheet.append(p); const w = p.getBoundingClientRect().width; p.remove(); return w; };
      const pitch = px(getComputedStyle(sheet).getPropertyValue('--rule-pitch'));
      const rows = [...document.querySelectorAll('#open-source .row')];
      let citeWrap = 0, titleWrap = 0, rowTwo = 0, rowMore = 0, both = 0;
      for (const row of rows) {
        const c = Math.round(row.querySelector('cite').getBoundingClientRect().height / pitch);
        const t = Math.round(row.querySelector('.title').getBoundingClientRect().height / pitch);
        const h = Math.round(row.getBoundingClientRect().height / pitch);
        if (c > 1) citeWrap++; if (t > 1) titleWrap++; if (c > 1 && t > 1) both++; if (h === 2) rowTwo++; if (h > 2) rowMore++;
      }
      const cols = getComputedStyle(rows[0]).gridTemplateColumns;
      return { rows: rows.length, citeWrap, titleWrap, both, rowTwo, rowMore, cols };
    });
  };
  console.log('=== wrap split at 1440 ===');
  console.log('as is                    ', JSON.stringify(await count('')));
  console.log('repo col max 22rem       ', JSON.stringify(await count('#open-source .lines { --grid: 4rem minmax(11rem, 22rem) minmax(0, 1fr) !important; }')));
  console.log('repo col max 24rem       ', JSON.stringify(await count('#open-source .lines { --grid: 4rem minmax(11rem, 24rem) minmax(0, 1fr) !important; }')));
  console.log('repo col max 27rem       ', JSON.stringify(await count('#open-source .lines { --grid: 4rem minmax(11rem, 27rem) minmax(0, 1fr) !important; }')));
  console.log('repo 22rem, marks 3.5rem ', JSON.stringify(await count('#open-source .lines { --grid: 3.5rem minmax(11rem, 22rem) minmax(0, 1fr) !important; }')));
  // longest cite and title in characters
  const lengths = await page.evaluate(() => { const c = [...document.querySelectorAll('#open-source .row cite')].map((e) => e.textContent.length).sort((a, b) => b - a); const t = [...document.querySelectorAll('#open-source .row .title-text')].map((e) => e.textContent.length).sort((a, b) => b - a); return { citeTop: c.slice(0, 8), citeMedian: c[Math.floor(c.length / 2)], titleTop: t.slice(0, 5), titleMedian: t[Math.floor(t.length / 2)] }; });
  console.log('lengths', JSON.stringify(lengths));
  // 3. toggle remedies
  await page.evaluate(() => { const s = document.querySelector('#open-source section[data-group]'); window.scrollTo(0, s.getBoundingClientRect().top + scrollY - 100); });
  await page.waitForTimeout(300);
  const variants = {
    'as is': '',
    'sheet: will-change transform': '#open-source .sheet { will-change: transform; }',
    'sheet: one drop-shadow': '#open-source .sheet { filter: drop-shadow(0 0.5rem 0.9rem rgb(0 0 0 / 14%)) !important; }',
    'sheet: contain paint': '#open-source .sheet { contain: paint; }',
    'main: blend normal': 'main { background-blend-mode: normal !important; }',
    'main: no veneer': 'main { background-image: none !important; }',
  };
  console.log('=== details toggle ms (median of 6) ===');
  for (const [name, css] of Object.entries(variants)) {
    await page.evaluate((c) => { document.getElementById('probe-css').textContent = c; }, css);
    await page.waitForTimeout(250);
    const t = await page.evaluate(async () => { const d = document.querySelectorAll('#open-source .row details')[3]; const out = []; for (let i = 0; i < 6; i++) { const t0 = performance.now(); d.open = !d.open; await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); out.push(performance.now() - t0); } out.sort((a, b) => a - b); return { median: +out[3].toFixed(1), min: +out[0].toFixed(1) }; });
    console.log('   ', name.padEnd(30), JSON.stringify(t));
  }
  // 4. scroll cost with blend normal vs as is at 1440 (median of 60 frames, 3 runs)
  console.log('=== scroll frame ms at 1440: blend normal vs as is ===');
  for (const [name, css] of [['as is', ''], ['main: blend normal', 'main { background-blend-mode: normal !important; }'], ['main: no veneer', 'main { background-image: none !important; }']]) {
    const meds = [];
    for (let k = 0; k < 3; k++) {
      await page.evaluate((c) => { document.getElementById('probe-css').textContent = c; }, css);
      await page.waitForTimeout(150);
      meds.push(await page.evaluate(async () => { const frames = []; const total = document.body.scrollHeight - innerHeight; const step = total / 60; window.scrollTo(0, 0); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); let last = performance.now(); for (let i = 0; i < 60; i++) { window.scrollTo(0, i * step); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); const now = performance.now(); frames.push(now - last); last = now; } frames.sort((a, b) => a - b); return +frames[30].toFixed(1); }));
    }
    console.log('   ', name.padEnd(22), 'medians', meds.join(' '), 'best', Math.min(...meds));
  }
  await context.close();
}
await browser.close();
