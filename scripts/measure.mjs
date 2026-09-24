import { chromium } from '/home/user/cv/node_modules/@playwright/test/index.mjs';
import { writeFileSync } from 'node:fs';

const OUT = '/tmp/claude-0/-home-user-cv/ad5a465e-e56e-531f-8e9f-f3d4970b9a55/scratchpad/design-review';
const BASE = 'http://localhost:4320/';
const THEMES = ['light', 'dark', 'arctic', 'dark-forest'];
const WIDTHS = [390, 1024, 1100, 1280, 1440, 1728, 1920, 2560];

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const report = { layout: {}, type: {}, contrast: {}, network: {}, paint: {}, baselines: {}, a11y: {} };

// ---------- helpers injected in page ----------
const helpers = `
  const px = (el, v) => { const p = document.createElement('div'); p.style.width = v; (el||document.body).append(p); const w = p.getBoundingClientRect().width; p.remove(); return w; };
  const rgb = (c) => { const cx = document.createElement('canvas').getContext('2d'); cx.fillStyle = '#000'; cx.fillStyle = c; cx.fillRect(0,0,1,1); return [...cx.getImageData(0,0,1,1).data]; };
  const lin = (v) => { v/=255; return v <= 0.04045 ? v/12.92 : ((v+0.055)/1.055)**2.4; };
  const lum = ([r,g,b]) => 0.2126*lin(r)+0.7152*lin(g)+0.0722*lin(b);
  const ratio = (a,b) => { const la=lum(a), lb=lum(b); return (Math.max(la,lb)+0.05)/(Math.min(la,lb)+0.05); };
  // composite rgba over base
  const over = (fg, bg) => { const a = fg[3]/255; return [0,1,2].map(i => Math.round(fg[i]*a + bg[i]*(1-a))); };
  const paint = (el, prop, pseudo) => getComputedStyle(el, pseudo||null)[prop];
  // effective background: walk up until an opaque background is found
  const bgOf = (el) => { let node = el; while (node) { const c = rgb(getComputedStyle(node).backgroundColor); if (c[3] === 255) return c; node = node.parentElement; } return [255,255,255,255]; };
  const box = (el) => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top + scrollY, bottom: r.bottom + scrollY, width: r.width, height: r.height }; };
  const fs = (el) => parseFloat(getComputedStyle(el).fontSize);
`;

for (const theme of THEMES) {
  for (const width of WIDTHS) {
    const height = width >= 2560 ? 1200 : 900;
    const context = await browser.newContext({ viewport: { width, height }, ignoreHTTPSErrors: true });
    await context.addInitScript((id) => { try { localStorage.setItem('cv-theme', id); } catch {} }, theme);
    const page = await context.newPage();
    await page.emulateMedia({ reducedMotion: 'reduce' });

    const requests = [];
    page.on('requestfinished', async (req) => {
      const url = req.request ? req.request().url() : req.url();
      if (/\/desk\/|paper-fibre|fonts\.gstatic|googleapis/.test(url)) {
        const res = await req.response().catch(() => null);
        let size = -1;
        try { const body = await res?.body(); size = body ? body.byteLength : -1; } catch {}
        requests.push({ url: url.replace(BASE, '/').replace(/^https:\/\/fonts\.gstatic\.com\/.*\/([^/]+)$/, 'gstatic:$1'), size });
      }
    });

    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1500);
    // scroll through the whole page so lazy things load, then back
    await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 900) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 60)); } window.scrollTo(0, 0); });
    await page.waitForTimeout(800);

    const key = `${theme}-${width}`;
    report.network[key] = requests;

    report.layout[key] = await page.evaluate(`(() => { ${helpers}
      const main = document.querySelector('main');
      const ms = getComputedStyle(main);
      const mat = document.querySelector('#demos .cutting-mat');
      const matBox = mat ? box(mat) : null;
      const matStyle = mat ? getComputedStyle(mat) : null;
      const stacks = [...document.querySelectorAll('article.technical-drawing-stack')].map(box);
      const cards = [...document.querySelectorAll('.callout-card')].filter(c => getComputedStyle(c).display !== 'none').map(box);
      const folios = [...document.querySelectorAll('.folio-rail')].filter(f => getComputedStyle(f).display !== 'none').map(f => ({ rail: box(f), numeral: box(f.querySelector('.folio-number')), label: box(f.querySelector('.folio-label')) }));
      const sheets = ['#profile', '#bill-of-materials', '#open-source .intro'].map(s => { const el = document.querySelector(s); return el ? { id: s, ...box(el) } : null; });
      const groups = [...document.querySelectorAll('#open-source section[data-group]')].map(box);
      const titleBlock = document.querySelector('#profile .title-block');
      const demosHeader = document.querySelector('#demos .cutting-mat > header');
      const views = [...document.querySelectorAll('.callout-view')].map(box);
      const bubbles = [...document.querySelectorAll('.callout-bubble')].map(box);
      return {
        viewport: { w: innerWidth, h: innerHeight, scrollWidth: document.documentElement.scrollWidth, docHeight: document.documentElement.scrollHeight },
        vars: {
          pageGap: px(main, ms.getPropertyValue('--page-gap')),
          folioLane: px(main, ms.getPropertyValue('--folio-lane')),
          typeFolio: px(main, ms.getPropertyValue('--type-folio')),
          matInset: px(main, ms.getPropertyValue('--mat-inset')),
          deskEdge: px(main, ms.getPropertyValue('--desk-edge')),
          deskGap: px(main, ms.getPropertyValue('--desk-gap') || '0px'),
          sheetPad: px(main, ms.getPropertyValue('--sheet-pad') || '0px'),
          cardLane: mat ? px(mat, matStyle.getPropertyValue('--card-lane')) : null,
          matMargin: mat ? px(mat, matStyle.getPropertyValue('--mat-margin')) : null,
          matRim: mat ? px(mat, matStyle.getPropertyValue('--mat-rim')) : null,
        },
        mainBg: { color: ms.backgroundColor, image: ms.backgroundImage.slice(0, 200), size: ms.backgroundSize, blend: ms.backgroundBlendMode },
        mat: matBox && { ...matBox, padding: parseFloat(matStyle.paddingLeft), gridCols: matStyle.gridTemplateColumns },
        stackFirst: stacks[0], stackSecond: stacks[1], stackCount: stacks.length,
        cards, folios, sheets, groups,
        titleBlock: titleBlock ? box(titleBlock) : null,
        demosHeader: demosHeader ? box(demosHeader) : null,
        viewFirst: views[0], viewSecond: views[1], bubbleFirst: bubbles[0],
        deskLeftOfMat: matBox ? matBox.left : null,
        deskLeftOfSheet: sheets[1] ? sheets[1].left : null,
      };
    })()`);

    report.type[key] = await page.evaluate(`(() => { ${helpers}
      const q = (s) => document.querySelector(s);
      const one = (s) => { const el = q(s); if (!el) return null; const st = getComputedStyle(el); return { size: parseFloat(st.fontSize), lh: st.lineHeight, family: st.fontFamily.split(',')[0], weight: st.fontWeight, ls: st.letterSpacing, tt: st.textTransform, color: st.color, display: st.display, width: el.getBoundingClientRect().width }; };
      return {
        name: one('#profile h1'),
        folioNumber: one('.folio-number'),
        folioLabel: one('.folio-label'),
        calloutLetter: one('.callout-letter'),
        calloutKind: one('.callout-kind'),
        calloutTitle: one('.callout-title'),
        calloutJa: one('.callout [lang=ja]'),
        cardTitleDt: one('.title-card dt'),
        cardTitleDd: one('.title-card .title-cell-wide dd.typewriter'),
        cardNotes: one('.title-card .title-cell-notes dd'),
        cardMedium: one('.title-card .title-cell:not(.title-cell-wide) dd'),
        demosHeading: one('#demos-heading .typewriter'),
        demosJa: one('#demos-heading [lang=ja]'),
        sheetCode: one('#demos .sheet-code'),
        osHeading: one('#open-source-heading .typewriter'),
        groupH3: one('#open-source section[data-group] h3 .typewriter'),
        groupCount: one('#open-source section[data-group] h3 data'),
        colHead: one('#open-source .lines > header > span'),
        rowCite: one('#open-source .row cite'),
        rowTitle: one('#open-source .row .title-text'),
        rowTitleLink: one('#open-source .row .title'),
        peelHint: one('.paper-flip-hint text, .paper-flip-hint'),
        billLabel: one('#tech-icon-cloud-label'),
        rulePitch: (() => { const s = q('#open-source section[data-group]'); return s ? px(s, getComputedStyle(s).getPropertyValue('--rule-pitch')) : null; })(),
        linesWidth: (() => { const s = q('#open-source .lines'); return s ? s.getBoundingClientRect().width : null; })(),
        titleColWidth: (() => { const s = q('#open-source .row .title'); return s ? s.parentElement.getBoundingClientRect().width : null; })(),
        titleCharsPerLine: (() => { const rows = [...document.querySelectorAll('#open-source .row .title-text')]; if (!rows.length) return null; const f = parseFloat(getComputedStyle(rows[0]).fontSize); const gridCol = q('#open-source .row'); const cols = getComputedStyle(gridCol).gridTemplateColumns.split(' ').map(parseFloat); return { cols, approxCh: cols[2] / (f * 0.6) }; })(),
        twoLineRows: (() => { const s = q('#open-source section[data-group]'); if (!s) return null; const p = px(s, getComputedStyle(s).getPropertyValue('--rule-pitch')); const rows = [...document.querySelectorAll('#open-source .row')].map(r => Math.round(r.getBoundingClientRect().height / p)); return { total: rows.length, two: rows.filter(n => n >= 2).length, more: rows.filter(n => n > 2).length }; })(),
      };
    })()`);

    // contrast measurement: text colours vs the surface they sit on
    report.contrast[key] = await page.evaluate(`(() => { ${helpers}
      const pairs = [];
      const add = (label, sel, bgSel, opts={}) => {
        const el = document.querySelector(sel); if (!el) return;
        if (getComputedStyle(el).display === 'none') return;
        let bg;
        if (bgSel === 'main') { bg = null; }
        else { const bgEl = bgSel ? document.querySelector(bgSel) : el; bg = bgOf(bgEl); }
        const fgRaw = rgb(getComputedStyle(el).color);
        let fg = fgRaw;
        // opacity chain
        let op = 1; let n = el; while (n) { op *= parseFloat(getComputedStyle(n).opacity); n = n.parentElement; }
        if (bg) { fg = over([fgRaw[0],fgRaw[1],fgRaw[2], Math.round(fgRaw[3]*op)], bg); }
        pairs.push({ label, fg: fg.slice(0,3), bg: bg ? bg.slice(0,3) : null, alpha: fgRaw[3]/255, ratio: bg ? +ratio(fg, bg).toFixed(2) : null, size: parseFloat(getComputedStyle(el).fontSize) });
      };
      add('folio numeral', '.folio-number', 'main');
      add('folio label', '.folio-label', 'main');
      add('callout kind (Detail A)', '.callout-kind', '#demos .cutting-mat');
      add('callout scale', '.callout-scale', '#demos .cutting-mat');
      add('callout title', '.callout-title', '#demos .cutting-mat');
      add('callout ja', '.callout [lang=ja]', '#demos .cutting-mat');
      add('callout letter', '.callout-letter', '.callout-bubble');
      add('card dt', '.title-card dt', '.title-cell');
      add('card dd title', '.title-card .title-cell-wide dd.typewriter', '.title-cell');
      add('card notes', '.title-card .title-cell-notes dd', '.title-cell');
      add('demos heading', '#demos-heading .typewriter', '#demos .cutting-mat');
      add('demos ja', '#demos-heading [lang=ja]', '#demos .cutting-mat');
      add('demos sheet code', '#demos .sheet-code', '#demos .cutting-mat');
      add('group heading', '#open-source section[data-group] h3 .typewriter', '#open-source section[data-group]');
      add('group count', '#open-source section[data-group] h3 data', '#open-source section[data-group]');
      add('column head', '#open-source .lines > header > span', '#open-source section[data-group]');
      add('row cite', '#open-source .row cite', '#open-source section[data-group]');
      add('row title', '#open-source .row .title', '#open-source section[data-group]');
      add('bill label', '#tech-icon-cloud-label', '#bill-of-materials');
      add('desktop hint', '.desktop-hint p', '.desktop-hint');
      // colours of surfaces and lines
      const main = document.querySelector('main');
      const ms = getComputedStyle(main);
      const mat = document.querySelector('#demos .cutting-mat');
      const matPaper = rgb(getComputedStyle(document.body).getPropertyValue('--mat-paper'));
      const matMinor = rgb(getComputedStyle(document.body).getPropertyValue('--mat-grid-minor'));
      const matMajor = rgb(getComputedStyle(document.body).getPropertyValue('--mat-grid-major'));
      const matEdge = rgb(getComputedStyle(document.body).getPropertyValue('--mat-edge'));
      const sheet = document.querySelector('#open-source section[data-group]');
      const ss = sheet ? getComputedStyle(sheet) : null;
      const paper = sheet ? rgb(ss.getPropertyValue('--paper')) : null;
      const ruleInk = sheet ? rgb(ss.getPropertyValue('--rule-ink')) : null;
      const marginInk = sheet ? rgb(ss.getPropertyValue('--margin-ink')) : null;
      const line = rgb(ms.getPropertyValue('--line'));
      const lineStrong = rgb(ms.getPropertyValue('--line-strong'));
      const surfacePage = rgb(ms.getPropertyValue('--surface-page'));
      const surfaceSunken = rgb(ms.getPropertyValue('--surface-sunken'));
      const ink = rgb(ms.getPropertyValue('--ink'));
      const inkMuted = rgb(ms.getPropertyValue('--ink-muted'));
      const inkFaint = rgb(ms.getPropertyValue('--ink-faint'));
      const desk = rgb(ms.getPropertyValue('--theme-desk'));
      const deskBase = rgb(ms.backgroundColor);
      const callLine = document.querySelector('.callout') ? rgb(getComputedStyle(document.querySelector('.callout')).getPropertyValue('--callout-line')) : null;
      const surfaces = {
        desk, deskBase, surfacePage, surfaceSunken, matPaper: over(matPaper, [255,255,255]), ink, inkMuted, inkFaint, line, lineStrong,
        matMinorOverMat: over(matMinor, matPaper), matMajorOverMat: over(matMajor, matPaper), matEdgeOverDesk: over(matEdge, desk),
        paper, ruleOverPaper: paper && over(ruleInk, paper), marginOverPaper: paper && over(marginInk, paper),
        calloutLineOverMat: callLine && over(callLine, matPaper),
      };
      const r = {};
      r['mat minor rule vs mat'] = +ratio(surfaces.matMinorOverMat, matPaper).toFixed(2);
      r['mat major rule vs mat'] = +ratio(surfaces.matMajorOverMat, matPaper).toFixed(2);
      r['mat edge vs desk'] = +ratio(surfaces.matEdgeOverDesk, desk).toFixed(2);
      r['mat vs desk'] = +ratio(matPaper, desk).toFixed(2);
      r['sheet paper vs desk'] = +ratio(surfacePage, desk).toFixed(2);
      r['sheet edge (--line) vs paper'] = +ratio(over(line, surfacePage), surfacePage).toFixed(2);
      r['sheet edge (--line) vs desk'] = +ratio(over(line, desk), desk).toFixed(2);
      if (paper) r['ruled line vs paper'] = +ratio(surfaces.ruleOverPaper, paper).toFixed(2);
      if (paper) r['margin line vs paper'] = +ratio(surfaces.marginOverPaper, paper).toFixed(2);
      if (callLine) r['chain line vs mat'] = +ratio(surfaces.calloutLineOverMat, matPaper).toFixed(2);
      r['card cell (sunken) vs mat'] = +ratio(surfaceSunken, matPaper).toFixed(2);
      r['card hairline (line-strong) vs sunken'] = +ratio(over(lineStrong, surfaceSunken), surfaceSunken).toFixed(2);
      r['ink-faint vs paper'] = +ratio(inkFaint, surfacePage).toFixed(2);
      r['ink-muted vs paper'] = +ratio(inkMuted, surfacePage).toFixed(2);
      r['ink-faint vs sunken'] = +ratio(inkFaint, surfaceSunken).toFixed(2);
      return { pairs, surfaces, ratios: r };
    })()`);

    // baselines on the ruled sheets (same probe the spec uses), only at 1440 and 390
    if (width === 1440 || width === 390) {
      report.baselines[key] = await page.evaluate(`(() => { ${helpers}
        const out = [];
        for (const sheet of document.querySelectorAll('#open-source section[data-group]')) {
          const st = getComputedStyle(sheet);
          const pitch = px(sheet, st.getPropertyValue('--rule-pitch'));
          const shift = px(sheet, st.getPropertyValue('--rule-shift'));
          const paperTop = px(sheet, st.getPropertyValue('--paper-top'));
          const top = sheet.getBoundingClientRect().top + parseFloat(st.borderTopWidth) + scrollY;
          for (const [kind, sel] of [['head','.lines > header > span'],['group','h3 > span'],['repo','.row cite'],['title','.row .title .title-text']]) {
            for (const cell of sheet.querySelectorAll(sel)) {
              const m = document.createElement('span'); m.style.cssText='display:inline-block;width:0;height:0;vertical-align:baseline'; cell.append(m);
              const baseline = m.getBoundingClientRect().bottom + scrollY; m.remove();
              const n = Math.round((baseline - top - paperTop - shift)/pitch);
              const rule = top + paperTop + shift + n*pitch;
              out.push({ kind, off: +(baseline-rule).toFixed(2) });
            }
          }
        }
        const byKind = {};
        for (const o of out) { byKind[o.kind] ??= { n:0, max:0, sum:0 }; byKind[o.kind].n++; byKind[o.kind].max = Math.max(byKind[o.kind].max, Math.abs(o.off)); byKind[o.kind].sum += o.off; }
        return { total: out.length, byKind, supportsTrim: CSS.supports('text-box-trim: trim-both') };
      })()`);
    }

    // accessibility bits at 1440 only
    if (width === 1440 || width === 1728) {
      report.a11y[key] = await page.evaluate(`(() => {
        const hidden = (s) => [...document.querySelectorAll(s)].map(el => ({ ariaHidden: el.getAttribute('aria-hidden'), display: getComputedStyle(el).display, inTree: !el.closest('[aria-hidden="true"]') && getComputedStyle(el).display !== 'none' }));
        return {
          folios: hidden('.folio-rail'),
          cards: hidden('.callout-card'),
          bubbles: hidden('.callout-bubble'),
          cardsHaveHeadings: [...document.querySelectorAll('.title-card')].map(c => c.querySelectorAll('h1,h2,h3,h4').length),
          h3Text: [...document.querySelectorAll('#demos h3')].map(h => h.textContent.replace(/\\s+/g,' ').trim()),
          sheetCodesHidden: [...document.querySelectorAll('.sheet-code')].map(p => p.getAttribute('aria-hidden')),
          tunerInDom: !!document.getElementById('paper-tuner'),
          tunerHidden: document.getElementById('paper-tuner')?.hidden,
          tunerBytes: document.getElementById('paper-tuner')?.outerHTML.length,
          inlineScripts: [...document.querySelectorAll('script:not([src])')].map(s => s.textContent.length),
          styleBytes: [...document.querySelectorAll('style')].reduce((a,s)=>a+s.textContent.length,0),
          htmlBytes: document.documentElement.outerHTML.length,
        };
      })()`);
    }

    // paint cost: scroll 60 frames at this width
    if (width === 1440 || width === 2560 || width === 390) {
      const paint = await page.evaluate(async () => {
        const frames = [];
        const total = document.body.scrollHeight - innerHeight;
        const step = total / 60;
        let last = performance.now();
        for (let i = 0; i < 60; i++) {
          window.scrollTo(0, i * step);
          await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
          const now = performance.now(); frames.push(now - last); last = now;
        }
        window.scrollTo(0, 0);
        frames.sort((a,b)=>a-b);
        return { median: +frames[30].toFixed(2), p90: +frames[54].toFixed(2), max: +frames[59].toFixed(2) };
      });
      report.paint[key] = paint;
    }

    await context.close();
    console.log('measured', key);
  }
}

// image weights on disk vs what each theme fetches
await browser.close();
writeFileSync(`${OUT}/measure.json`, JSON.stringify(report, null, 2));
console.log('done');
