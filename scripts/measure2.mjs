import { chromium } from '/home/user/cv/node_modules/@playwright/test/index.mjs';
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module'; const sharp = createRequire(import.meta.url)('/home/user/cv/node_modules/sharp');

const OUT = '/tmp/claude-0/-home-user-cv/ad5a465e-e56e-531f-8e9f-f3d4970b9a55/scratchpad/design-review';
const BASE = 'http://localhost:4320/';
const THEMES = ['light', 'dark', 'arctic', 'dark-forest'];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const report = { deskPixels: {}, focus: {}, toggle: {}, underline: {}, thresholds: {}, tuner: {}, hover: {} };

const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const lum = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

const open = async (theme, width, height = 900) => {
  const context = await browser.newContext({ viewport: { width, height }, ignoreHTTPSErrors: true });
  await context.addInitScript((id) => { try { localStorage.setItem('cv-theme', id); } catch {} }, theme);
  const page = await context.newPage();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1200);
  return { context, page };
};

// 1. Desk pixel range under and beside the folio, and the real contrast of numeral / label ink on it
for (const theme of THEMES) {
  const { context, page } = await open(theme, 1440);
  const info = await page.evaluate(() => {
    const rail = document.querySelector('.folio-rail');
    const num = rail.querySelector('.folio-number').getBoundingClientRect();
    const lab = rail.querySelector('.folio-label').getBoundingClientRect();
    const rgb = (c) => { const cx = document.createElement('canvas').getContext('2d'); cx.fillStyle = '#000'; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1); return [...cx.getImageData(0, 0, 1, 1).data]; };
    return { num: { x: num.left, y: num.top, w: num.width, h: num.height }, lab: { x: lab.left, y: lab.top, w: lab.width, h: lab.height }, ink: rgb(getComputedStyle(rail).color), railRight: rail.getBoundingClientRect().right };
  });
  // bare desk beside the folio: a strip from the numeral's right to the first sheet, 200px tall
  const strip = { x: Math.round(info.railRight) + 4, y: 40, width: 60, height: 300 };
  const buf = await page.screenshot({ clip: strip });
  const { data, info: meta } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
  const lums = [];
  for (let i = 0; i < data.length; i += meta.channels) lums.push(lum(data[i], data[i + 1], data[i + 2]));
  lums.sort((a, b) => a - b);
  const p = (q) => lums[Math.floor(lums.length * q)];
  const ink = info.ink; // rgba with alpha 255*0.55
  const alpha = ink[3] / 255;
  // composite ink over the darkest, median and lightest desk pixels
  const sample = (q) => {
    // find a pixel of that luminance: approximate with mean of a percentile band
    const idx = Math.floor(lums.length * q);
    return lums[idx];
  };
  // approximate compositing in luminance space is not exact; do it in rgb using percentile pixels
  const pix = [];
  for (let i = 0; i < data.length; i += meta.channels) pix.push([data[i], data[i + 1], data[i + 2], lum(data[i], data[i + 1], data[i + 2])]);
  pix.sort((a, b) => a[3] - b[3]);
  const at = (q) => pix[Math.floor(pix.length * q)];
  const comp = (bg) => { const c = [0, 1, 2].map((k) => ink[k] * alpha + bg[k] * (1 - alpha)); return lum(...c); };
  const result = {};
  for (const [name, q] of [['darkest1%', 0.01], ['median', 0.5], ['lightest99%', 0.99]]) {
    const bg = at(q);
    result[name] = { deskL: +bg[3].toFixed(4), ratio: +ratio(comp(bg), bg[3]).toFixed(2) };
  }
  report.deskPixels[theme] = { inkRgba: ink, alpha, ...result, deskLumRange: [+p(0.01).toFixed(4), +p(0.99).toFixed(4)] };
  await context.close();
  console.log('desk', theme);
}

// 2. Focus rings on the ruled sheet (summary and title link), hover wash, and details toggle cost
for (const theme of ['light', 'dark']) {
  const { context, page } = await open(theme, 1440);
  await page.evaluate(() => {
    const sheet = document.querySelector('#open-source section[data-group]');
    window.scrollTo(0, sheet.getBoundingClientRect().top + scrollY - 100);
  });
  await page.waitForTimeout(300);
  // focus the first summary via keyboard-ish focus (focus-visible needs keyboard): use keyboard Tab from the title link
  const firstLink = page.locator('#open-source .row .title').first();
  await firstLink.focus();
  await page.keyboard.press('Tab'); // moves to the summary? order: ul, meta (cite, a.title), details>summary. so Tab from title goes to summary
  await page.waitForTimeout(150);
  const focused = await page.evaluate(() => {
    const el = document.activeElement;
    const st = getComputedStyle(el);
    return { tag: el.tagName, cls: el.className, outline: st.outline, outlineOffset: st.outlineOffset, rect: el.getBoundingClientRect().toJSON() };
  });
  report.focus[theme] = { afterTab: focused };
  await page.screenshot({ path: `${OUT}/shots/${theme}-1440-focus-summary.png`, clip: { x: 200, y: 150, width: 1040, height: 260 } });
  await page.keyboard.press('Shift+Tab');
  await page.waitForTimeout(150);
  const focused2 = await page.evaluate(() => {
    const el = document.activeElement; const st = getComputedStyle(el);
    return { tag: el.tagName, cls: el.className, outline: st.outline, outlineOffset: st.outlineOffset, color: st.color };
  });
  report.focus[theme].afterShiftTab = focused2;
  await page.screenshot({ path: `${OUT}/shots/${theme}-1440-focus-link.png`, clip: { x: 200, y: 150, width: 1040, height: 260 } });

  // hover wash
  await page.mouse.move(700, 283);
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}/shots/${theme}-1440-hover-row.png`, clip: { x: 200, y: 150, width: 1040, height: 260 } });
  report.hover[theme] = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('#open-source .row')];
    const hovered = rows.find((r) => r.matches(':hover'));
    if (!hovered) return null;
    const s = hovered.querySelector('summary');
    return { bg: getComputedStyle(s).backgroundColor, titleColor: getComputedStyle(hovered.querySelector('.title')).color };
  });

  // details toggle cost: open the second row's details and time to next paint
  const toggle = await page.evaluate(async () => {
    const d = document.querySelectorAll('#open-source .row details')[1];
    const times = [];
    for (let i = 0; i < 4; i++) {
      const t0 = performance.now();
      d.open = !d.open;
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      times.push(+(performance.now() - t0).toFixed(1));
    }
    return times;
  });
  report.toggle[theme] = toggle;
  // open one and screenshot the note on the rules
  await page.evaluate(() => { document.querySelectorAll('#open-source .row details')[1].open = true; });
  await page.mouse.move(10, 10);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/shots/${theme}-1440-row-open.png`, clip: { x: 200, y: 150, width: 1040, height: 360 } });

  // underline vs rule: computed offsets and a pixel column through the first title
  report.underline[theme] = await page.evaluate(() => {
    const t = document.querySelector('#open-source .row .title-text');
    const st = getComputedStyle(t);
    const sheet = document.querySelector('#open-source section[data-group]');
    const ss = getComputedStyle(sheet);
    const px = (v) => { const p = document.createElement('div'); p.style.width = v; sheet.append(p); const w = p.getBoundingClientRect().width; p.remove(); return w; };
    const m = document.createElement('span'); m.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline'; t.append(m);
    const baseline = m.getBoundingClientRect().bottom; m.remove();
    return { offset: st.textUnderlineOffset, thickness: st.textDecorationThickness, baselineY: baseline, fontSize: st.fontSize, pitch: px(ss.getPropertyValue('--rule-pitch')), left: t.getBoundingClientRect().left };
  });
  // sample a vertical column of pixels through the first title's baseline area
  const u = report.underline[theme];
  const col = await page.screenshot({ clip: { x: Math.round(u.left) + 8, y: Math.round(u.baselineY) - 4, width: 1, height: 9 } });
  const { data } = await sharp(col).raw().toBuffer({ resolveWithObject: true });
  const rows = [];
  for (let i = 0; i < 9; i++) rows.push([data[i * 3], data[i * 3 + 1], data[i * 3 + 2]]);
  report.underline[theme].column = rows.map((c, i) => ({ dy: i - 4, rgb: c }));
  await context.close();
  console.log('focus', theme);
}

// 3. Threshold transitions: mat and sheet geometry a pixel either side of each threshold
for (const width of [1024, 1025, 1088, 1279, 1280, 1679, 1680]) {
  const { context, page } = await open('light', width);
  report.thresholds[width] = await page.evaluate(() => {
    const box = (s) => { const el = document.querySelector(s); if (!el) return null; const r = el.getBoundingClientRect(); return { left: +r.left.toFixed(1), right: +r.right.toFixed(1), width: +r.width.toFixed(1) }; };
    const mat = document.querySelector('#demos .cutting-mat');
    const ms = getComputedStyle(mat);
    const folio = document.querySelector('.folio-rail');
    const fs = getComputedStyle(folio);
    const num = folio.querySelector('.folio-number');
    return {
      mat: box('#demos .cutting-mat'), matPad: ms.paddingLeft, matBorder: ms.borderLeftWidth,
      bill: box('#bill-of-materials'), billPad: getComputedStyle(document.querySelector('#bill-of-materials')).paddingLeft, billBorder: getComputedStyle(document.querySelector('#bill-of-materials')).borderLeftWidth,
      stack: box('article.technical-drawing-stack'),
      view: box('.callout-view'),
      folioShown: fs.display !== 'none', folioRail: box('.folio-rail'), numeral: fs.display !== 'none' ? { ...box('.folio-number'), size: getComputedStyle(num).fontSize } : null,
      card: getComputedStyle(document.querySelector('.callout-card')).display,
      title: box('#profile .title-block'),
      demosHeader: box('#demos .cutting-mat > header'),
    };
  });
  await context.close();
  console.log('threshold', width);
}

// 4. Review-only weight in the built page
{
  const { context, page } = await open('light', 1440);
  report.tuner = await page.evaluate(() => {
    const tuner = document.getElementById('paper-tuner');
    const scripts = [...document.querySelectorAll('script:not([src])')].map((s) => ({ bytes: s.textContent.length, head: s.textContent.trim().slice(0, 60).replace(/\s+/g, ' ') }));
    const styles = [...document.querySelectorAll('style')].map((s) => s.textContent.length);
    const tunerStyle = [...document.querySelectorAll('style')].find((s) => s.textContent.includes('#paper-tuner'));
    return { tunerMarkupBytes: tuner?.outerHTML.length ?? 0, tunerHidden: tuner?.hidden, scripts, styleTotal: styles.reduce((a, b) => a + b, 0), tunerStyleBytes: tunerStyle?.textContent.length ?? 0, htmlBytes: document.documentElement.outerHTML.length };
  });
  await context.close();
}

await browser.close();
writeFileSync(`${OUT}/measure2.json`, JSON.stringify(report, null, 2));
console.log('done2');
