import { chromium } from '/home/user/cv/node_modules/@playwright/test/index.mjs';
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const sharp = createRequire(import.meta.url)('/home/user/cv/node_modules/sharp');

const OUT = '/tmp/claude-0/-home-user-cv/ad5a465e-e56e-531f-8e9f-f3d4970b9a55/scratchpad/design-review';
const BASE = 'http://localhost:4320/';
const report = { platformFonts: {}, veneerRepeat: {}, fibre: {} };

// 1. platform fonts actually used, via CDP, at 1024 and 1440 (light)
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
for (const width of [1024, 1280, 1440]) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, ignoreHTTPSErrors: true });
  await context.addInitScript(() => { try { localStorage.setItem('cv-theme', 'light'); } catch {} });
  const page = await context.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  const client = await context.newCDPSession(page);
  await client.send('DOM.enable'); await client.send('CSS.enable');
  const { root } = await client.send('DOM.getDocument', { depth: -1 });
  const fonts = {};
  for (const [label, sel] of [['demos heading', '#demos-heading .typewriter'], ['callout title', '.callout-title'], ['stack h2', 'article.technical-drawing-stack h2.typewriter'], ['folio number', '.folio-number'], ['folio label', '.folio-label'], ['name h1', '#profile h1'], ['row title', '#open-source .row .title-text'], ['card dd', '.title-card dd.typewriter'], ['peel hint', '.flip-hint--fwd.hint-words']]) {
    try {
      const { nodeId } = await client.send('DOM.querySelector', { nodeId: root.nodeId, selector: sel });
      if (!nodeId) { fonts[label] = 'not found'; continue; }
      const { fonts: pf } = await client.send('CSS.getPlatformFontsForNode', { nodeId });
      fonts[label] = pf.map((f) => `${f.familyName}${f.isCustomFont ? '' : ' (system)'}:${f.glyphCount}`).join(', ');
    } catch (e) { fonts[label] = 'err ' + e.message.slice(0, 60); }
  }
  const statuses = await page.evaluate(() => [...document.fonts].map((f) => f.family + ':' + f.status).filter((s, i, a) => a.indexOf(s) === i));
  report.platformFonts[width] = { fonts, statuses };
  await context.close();
  console.log('fonts', width);
}
await browser.close();

// 2. veneer repeat: autocorrelation down the left desk margin of the full-page shots
const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
for (const [name, file, x, w] of [['light-2560', 'light-2560-full.png', 20, 440], ['dark-1920', 'dark-1920-full.png', 10, 140], ['light-1920', 'light-1920-full.png', 10, 140], ['arctic-1440', 'arctic-1440-full.png', 10, 140], ['dark-1440', 'dark-1440-full.png', 10, 140]]) {
  const img = sharp(`${OUT}/shots/${file}`);
  const meta = await img.metadata();
  const height = Math.min(meta.height, 5000);
  // strip on the RIGHT margin (nothing stands there): x from the right edge
  const left = meta.width - x - w;
  const { data, info } = await img.extract({ left, top: 150, width: w, height: height - 150 }).greyscale().raw().toBuffer({ resolveWithObject: true });
  // row means
  const rows = [];
  for (let y = 0; y < info.height; y++) { let s = 0; for (let xx = 0; xx < info.width; xx++) s += data[y * info.width + xx]; rows.push(s / info.width); }
  const mean = rows.reduce((a, b) => a + b, 0) / rows.length;
  const c = rows.map((r) => r - mean);
  const ac = (lag) => { let s = 0, n = 0; for (let y = 0; y + lag < c.length; y++) { s += c[y] * c[y + lag]; n++; } return s / n; };
  const a0 = ac(0);
  const lags = {};
  for (const lag of [100, 300, 500, 700, 710, 720, 730, 740, 900, 1440]) lags[lag] = +(ac(lag) / a0).toFixed(3);
  // also a 2D check: identical pixels at (y, y+720)?
  let same = 0, tot = 0;
  for (let y = 0; y + 720 < info.height; y += 7) for (let xx = 0; xx < info.width; xx += 5) { tot++; if (Math.abs(data[y * info.width + xx] - data[(y + 720) * info.width + xx]) <= 2) same++; }
  report.veneerRepeat[name] = { strip: { left, width: w, height }, autocorr: lags, pixelsEqualAt720: +(same / tot).toFixed(3) };
  console.log('repeat', name, JSON.stringify(report.veneerRepeat[name]));
}

// 3. crops: two consecutive tiles of the desk side by side (evidence of the repeat), fibre close-ups
{
  const src = sharp(`${OUT}/shots/light-2560-full.png`);
  const meta = await src.metadata();
  const a = await sharp(`${OUT}/shots/light-2560-full.png`).extract({ left: meta.width - 470, top: 100, width: 300, height: 720 }).toBuffer();
  const b = await sharp(`${OUT}/shots/light-2560-full.png`).extract({ left: meta.width - 470, top: 820, width: 300, height: 720 }).toBuffer();
  await sharp({ create: { width: 620, height: 720, channels: 3, background: '#fff' } }).composite([{ input: a, left: 0, top: 0 }, { input: b, left: 320, top: 0 }]).png().toFile(`${OUT}/shots/crop-light-2560-tile-repeat.png`);
  const da = await sharp(`${OUT}/shots/dark-1920-full.png`).extract({ left: 1780, top: 100, width: 130, height: 720 }).toBuffer();
  const db = await sharp(`${OUT}/shots/dark-1920-full.png`).extract({ left: 1780, top: 820, width: 130, height: 720 }).toBuffer();
  await sharp({ create: { width: 280, height: 720, channels: 3, background: '#fff' } }).composite([{ input: da, left: 0, top: 0 }, { input: db, left: 150, top: 0 }]).png().toFile(`${OUT}/shots/crop-dark-1920-tile-repeat.png`);
  // fibre on a drawing sheet (light 1440 mat shot: sheet interior around x 300..500, y 320..420) at 3x
  await sharp(`${OUT}/shots/light-1440-mat.png`).extract({ left: 300, top: 320, width: 200, height: 100 }).resize(600, 300, { kernel: 'nearest' }).toFile(`${OUT}/shots/crop-light-1440-fibre-sheet.png`);
  await sharp(`${OUT}/shots/dark-1440-mat.png`).extract({ left: 300, top: 320, width: 200, height: 100 }).resize(600, 300, { kernel: 'nearest' }).toFile(`${OUT}/shots/crop-dark-1440-fibre-sheet.png`);
  // fibre on the contributions sheet (blank area to the right of the writing)
  await sharp(`${OUT}/shots/light-1440-contrib.png`).extract({ left: 950, top: 250, width: 200, height: 100 }).resize(600, 300, { kernel: 'nearest' }).toFile(`${OUT}/shots/crop-light-1440-fibre-contrib.png`);
  await sharp(`${OUT}/shots/dark-1440-contrib.png`).extract({ left: 950, top: 250, width: 200, height: 100 }).resize(600, 300, { kernel: 'nearest' }).toFile(`${OUT}/shots/crop-dark-1440-fibre-contrib.png`);
  // fibre statistics: stddev of luminance in a blank patch of drawing sheet and of contributions sheet, per theme
  for (const theme of ['light', 'dark', 'arctic', 'dark-forest']) {
    const stat = async (file, left, top) => { const { data, info } = await sharp(`${OUT}/shots/${file}`).extract({ left, top, width: 120, height: 60 }).greyscale().raw().toBuffer({ resolveWithObject: true }); const n = data.length; const m = data.reduce((a, b) => a + b, 0) / n; const sd = Math.sqrt(data.reduce((a, b) => a + (b - m) ** 2, 0) / n); return { mean: +m.toFixed(1), sd: +sd.toFixed(2) }; };
    report.fibre[theme] = { drawingSheet: await stat(`${theme}-1440-mat.png`, 320, 330), contribSheet: await stat(`${theme}-1440-contrib.png`, 960, 260), mat: await stat(`${theme}-1440-mat.png`, 200, 820), desk: await stat(`${theme}-1440-top.png`, 1300, 500) };
  }
  // 1280 folio close-up, all four themes
  for (const theme of ['light', 'dark', 'arctic', 'dark-forest']) {
    await sharp(`${OUT}/shots/${theme}-1280-top.png`).extract({ left: 0, top: 20, width: 120, height: 110 }).resize(480, 440, { kernel: 'nearest' }).toFile(`${OUT}/shots/crop-${theme}-1280-folio.png`);
  }
  // callout title at 1024 vs 1440 (font check by eye)
  await sharp(`${OUT}/shots/light-1024-mat.png`).extract({ left: 40, top: 130, width: 320, height: 80 }).resize(960, 240).toFile(`${OUT}/shots/crop-light-1024-callout-title.png`);
  await sharp(`${OUT}/shots/light-1440-mat.png`).extract({ left: 240, top: 130, width: 320, height: 80 }).resize(960, 240).toFile(`${OUT}/shots/crop-light-1440-callout-title.png`);
}
writeFileSync(`${OUT}/measure4.json`, JSON.stringify(report, null, 2));
console.log('done4');
