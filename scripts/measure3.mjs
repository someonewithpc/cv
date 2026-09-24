import { chromium } from '/home/user/cv/node_modules/@playwright/test/index.mjs';
import { writeFileSync } from 'node:fs';

const OUT = '/tmp/claude-0/-home-user-cv/ad5a465e-e56e-531f-8e9f-f3d4970b9a55/scratchpad/design-review';
const BASE = 'http://localhost:4320/';
const THEMES = ['light', 'dark', 'arctic', 'dark-forest'];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const report = { matContrast: {}, titleBlock: {}, outline: null, paintIsolation: {}, gaps: {}, cardCopy: null };

const open = async (theme, width, height = 900) => {
  const context = await browser.newContext({ viewport: { width, height }, ignoreHTTPSErrors: true });
  await context.addInitScript((id) => { try { localStorage.setItem('cv-theme', id); } catch {} }, theme);
  const page = await context.newPage();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1000);
  return { context, page };
};

// resolve any CSS colour (light-dark, color-mix, oklch) to rgba via a probe's computed style, then a canvas
const helpers = `
  const resolve = (value, host) => {
    const p = document.createElement('div'); p.style.backgroundColor = value; (host || document.body).append(p);
    const c = getComputedStyle(p).backgroundColor; p.remove();
    const cx = document.createElement('canvas').getContext('2d'); cx.fillStyle = '#ff00ff'; cx.fillStyle = c;
    const ok = cx.fillStyle !== '#ff00ff';
    cx.clearRect(0,0,1,1); cx.fillRect(0, 0, 1, 1);
    const d = [...cx.getImageData(0, 0, 1, 1).data];
    // un-premultiply is not needed: getImageData returns straight alpha
    return { rgba: d, computed: c, ok };
  };
  const lin = (v) => { v/=255; return v <= 0.04045 ? v/12.92 : ((v+0.055)/1.055)**2.4; };
  const lum = (c) => 0.2126*lin(c[0])+0.7152*lin(c[1])+0.0722*lin(c[2]);
  const ratio = (a,b) => { const la=lum(a), lb=lum(b); return +(((Math.max(la,lb)+0.05)/(Math.min(la,lb)+0.05)).toFixed(2)); };
  const over = (fg, bg) => { const a = fg[3]/255; return [0,1,2].map(i => Math.round(fg[i]*a + bg[i]*(1-a))); };
`;

for (const theme of THEMES) {
  const { context, page } = await open(theme, 1728);
  report.matContrast[theme] = await page.evaluate(`(() => { ${helpers}
    const body = document.body; const bs = getComputedStyle(body);
    const mat = document.querySelector('#demos .cutting-mat'); const ms = getComputedStyle(mat);
    const main = document.querySelector('main'); const mns = getComputedStyle(main);
    const v = (name, host, from) => resolve((from || getComputedStyle(host)).getPropertyValue(name), host);
    const matPaper = v('--mat-paper', body); const minor = v('--mat-grid-minor', body); const major = v('--mat-grid-major', body); const edge = v('--mat-edge', body);
    const desk = resolve(mns.backgroundColor, main); const themeDesk = v('--theme-desk', main);
    const callout = document.querySelector('.callout'); const line = v('--callout-line', callout);
    const sheet = document.querySelector('#open-source section[data-group]'); const ss = getComputedStyle(sheet);
    const paper = v('--paper', sheet); const rule = v('--rule-ink', sheet); const marginInk = v('--margin-ink', sheet); const fibre = v('--fibre', sheet);
    const surfacePage = v('--surface-page', main); const sunken = v('--surface-sunken', main); const lineTok = v('--line', main); const lineStrong = v('--line-strong', main);
    const inkFaint = v('--ink-faint', main); const inkMuted = v('--ink-muted', main); const ink = v('--ink', main); const accentText = v('--accent-text', main);
    const M = matPaper.rgba; const P = paper.rgba;
    const text = (label, sel, bg) => { const el = document.querySelector(sel); if (!el || getComputedStyle(el).display === 'none') return null; const c = resolve(getComputedStyle(el).color, el).rgba; let op = 1; let n = el; while (n) { op *= parseFloat(getComputedStyle(n).opacity); n = n.parentElement; } const fg = over([c[0],c[1],c[2],Math.round(c[3]*op)], bg); return { label, size: parseFloat(getComputedStyle(el).fontSize), ratio: ratio(fg, bg), fg, bg: bg.slice(0,3), alpha: +(c[3]/255*op).toFixed(2) }; };
    const pairs = [
      text('callout kind', '.callout-kind', M), text('callout scale', '.callout-scale', M), text('callout title', '.callout-title', M), text('callout ja', '.callout [lang=ja]', M),
      text('demos heading', '#demos-heading .typewriter', M), text('demos ja', '#demos-heading [lang=ja]', M), text('demos sheet code', '#demos .sheet-code', M),
      text('peel hint words', '.paper-flip-hint .hint-words, .flip-hint--fwd.hint-words', M),
      text('card dt', '.title-card dt', sunken.rgba), text('card dd', '.title-card .title-cell-wide dd.typewriter', sunken.rgba), text('card notes', '.title-card .title-cell-notes dd', sunken.rgba),
      text('os heading ja', '#open-source-heading [lang=ja]', surfacePage.rgba), text('bill label', '#tech-icon-cloud-label', surfacePage.rgba),
    ].filter(Boolean);
    const r = {};
    r['mat paper'] = M.slice(0,3); r['desk (main bg)'] = desk.rgba.slice(0,3); r['theme desk'] = themeDesk.rgba.slice(0,3);
    r['mat minor rule vs mat'] = ratio(over(minor.rgba, M), M); r['mat major rule vs mat'] = ratio(over(major.rgba, M), M);
    r['mat edge vs mat'] = ratio(over(edge.rgba, M), M); r['mat edge vs desk'] = ratio(over(edge.rgba, themeDesk.rgba), themeDesk.rgba);
    r['mat vs desk'] = ratio(M, themeDesk.rgba); r['sheet paper vs desk'] = ratio(surfacePage.rgba, themeDesk.rgba); r['sheet paper vs mat'] = ratio(surfacePage.rgba, M);
    r['chain line vs mat'] = ratio(over(line.rgba, M), M);
    r['ruled line vs paper'] = ratio(over(rule.rgba, P), P); r['margin line vs paper'] = ratio(over(marginInk.rgba, P), P); r['tear fibre vs paper'] = ratio(over(fibre.rgba, P), P);
    r['card cell vs mat'] = ratio(sunken.rgba, M); r['card hairline vs cell'] = ratio(over(lineStrong.rgba, sunken.rgba), sunken.rgba);
    r['sheet edge vs paper'] = ratio(over(lineTok.rgba, surfacePage.rgba), surfacePage.rgba);
    r['minor rule alpha'] = +(minor.rgba[3]/255).toFixed(3); r['major rule alpha'] = +(major.rgba[3]/255).toFixed(3); r['rule ink alpha'] = +(rule.rgba[3]/255).toFixed(3);
    r['parse ok'] = [matPaper.ok, minor.ok, rule.ok, line.ok, desk.ok].every(Boolean);
    r['computed samples'] = { matPaper: matPaper.computed, rule: rule.computed, desk: desk.computed };
    return { pairs, r };
  })()`);

  // title block: box vs content
  report.titleBlock[theme] = await page.evaluate(() => {
    const block = document.querySelector('#profile .title-block'); const b = block.getBoundingClientRect();
    const kids = [...block.children].map((el) => ({ tag: el.tagName, cls: el.className, top: el.getBoundingClientRect().top - b.top, bottom: el.getBoundingClientRect().bottom - b.top, h: el.getBoundingClientRect().height, vis: getComputedStyle(el).visibility, display: getComputedStyle(el).display }));
    const audio = block.querySelector('audio'); const a = audio.getBoundingClientRect();
    const label = block.querySelector('.note-row').getBoundingClientRect();
    const first = block.querySelector('.sheet-meta').getBoundingClientRect();
    return { height: b.height, width: b.width, padding: getComputedStyle(block).padding, topBlank: first.top - b.top, bottomBlankBelowCheckbox: b.bottom - label.bottom, audioBox: { top: a.top - b.top, h: a.height, vis: getComputedStyle(audio).visibility }, kids };
  });
  await context.close();
  console.log('mat', theme);
}

// heading outline at 1440 light
{
  const { context, page } = await open('light', 1440);
  report.outline = await page.evaluate(() => [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((h) => ({ level: h.tagName, text: h.textContent.replace(/\s+/g, ' ').trim().slice(0, 50), inCallout: !!h.closest('.callout'), inDrawing: !!h.closest('article.technical-drawing-stack') })).slice(0, 40));
  report.cardCopy = await page.evaluate(() => [...document.querySelectorAll('.title-card')].map((c) => ({ words: c.textContent.replace(/\s+/g, ' ').trim().split(' ').length, display: getComputedStyle(c.closest('.callout-card')).display })));
  // gaps between folio numeral and its sheet's paper at three widths
  await context.close();
}
for (const width of [1440, 1920, 2560]) {
  const { context, page } = await open('light', width);
  report.gaps[width] = await page.evaluate(() => {
    const rails = [...document.querySelectorAll('.folio-rail')];
    const papers = ['#profile .title-block', '#bill-of-materials', '#demos .cutting-mat', '#open-source .intro'];
    return rails.map((rail, i) => { const n = rail.querySelector('.folio-number').getBoundingClientRect(); const p = document.querySelector(papers[i]).getBoundingClientRect(); return { folio: i + 1, numeralRight: Math.round(n.right), paperLeft: Math.round(p.left), gap: Math.round(p.left - n.right) }; });
  });
  await context.close();
}

// paint isolation at 1440 light: as is / no veneer / no torn-sheet filter / no mask / none of them
const scrollCost = async (page) => page.evaluate(async () => {
  const frames = [];
  const total = document.body.scrollHeight - innerHeight; const step = total / 60;
  window.scrollTo(0, 0); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  let last = performance.now();
  for (let i = 0; i < 60; i++) { window.scrollTo(0, i * step); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); const now = performance.now(); frames.push(now - last); last = now; }
  window.scrollTo(0, 0);
  frames.sort((a, b) => a - b);
  return { median: +frames[30].toFixed(1), p90: +frames[54].toFixed(1) };
});
for (const width of [1440, 2560]) {
  const { context, page } = await open('light', width, width === 2560 ? 1200 : 900);
  const variants = {
    'as is': '',
    'no veneer': 'main { background-image: none !important; }',
    'no torn-sheet drop-shadow': '#open-source .sheet { filter: none !important; }',
    'no torn-sheet mask': '#open-source section[data-group] { mask-image: none !important; }',
    'no paper fibre': '#open-source section[data-group]::before, #open-source .intro::before, article.technical-drawing-stack section::before, article.technical-drawing-stack table::before { display: none !important; }',
    'no sheet lift shadow': 'main { --sheet-lift: none !important; }',
  };
  const results = {};
  for (let round = 0; round < 3; round++) {
    for (const [name, css] of Object.entries(variants)) {
      await page.evaluate((c) => { let s = document.getElementById('probe-css'); if (!s) { s = document.createElement('style'); s.id = 'probe-css'; document.head.append(s); } s.textContent = c; }, css);
      await page.waitForTimeout(150);
      const cost = await scrollCost(page);
      (results[name] ??= []).push(cost.median);
    }
  }
  report.paintIsolation[width] = Object.fromEntries(Object.entries(results).map(([k, v]) => [k, { medians: v, best: Math.min(...v) }]));
  await context.close();
  console.log('paint', width);
}

await browser.close();
writeFileSync(`${OUT}/measure3.json`, JSON.stringify(report, null, 2));
console.log('done3');
