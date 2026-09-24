import { chromium } from '/home/user/cv/node_modules/@playwright/test/index.mjs';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true });
await context.addInitScript(() => { try { localStorage.setItem('cv-theme', 'light'); } catch {} });
const page = await context.newPage();
await page.goto('http://localhost:4320/', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
// 1. which repositories break inside a word (at a hyphen) rather than at a <wbr>
const breaks = await page.evaluate(() => {
  const out = [];
  for (const cite of document.querySelectorAll('#open-source .row cite')) {
    const range = document.createRange(); range.selectNodeContents(cite);
    const rects = [...range.getClientRects()].filter(r => r.width > 0);
    if (rects.length < 2) continue;
    // text of the first line: walk characters until the y changes
    const text = cite.textContent; let first = '';
    for (let i = 0; i < text.length; i++) { const r = document.createRange(); let node = cite.firstChild, off = i; while (node && off >= (node.textContent?.length ?? 0)) { off -= node.textContent.length; node = node.nextSibling; } if (!node) break; try { r.setStart(node, off); r.setEnd(node, off + 1); } catch { break; } const rr = r.getBoundingClientRect(); if (rr.top > rects[0].top + 2) break; first += text[i]; }
    out.push({ text, first, atHyphen: first.endsWith('-'), atSlash: first.endsWith('/') , beforeHash: text.slice(first.length).startsWith('#') });
  }
  return out;
});
console.log('wrapped repos', breaks.length, 'mid-word (hyphen)', breaks.filter(b => b.atHyphen).length, 'after slash', breaks.filter(b => b.atSlash).length, 'before #', breaks.filter(b => b.beforeHash).length);
for (const b of breaks) console.log('  ', JSON.stringify(b.first), '|', JSON.stringify(b.text.slice(b.first.length)));
// 2. with nowrap segments: how many still wrap and where
await page.evaluate(() => {
  for (const cite of document.querySelectorAll('#open-source .row cite')) {
    const html = cite.innerHTML.split('<wbr>').map(s => `<span style="white-space:nowrap">${s}</span>`).join('<wbr>');
    cite.innerHTML = html;
  }
});
await page.waitForTimeout(100);
const after = await page.evaluate(() => {
  const px = (v) => { const p = document.createElement('div'); p.style.width = v; document.body.append(p); const w = p.getBoundingClientRect().width; p.remove(); return w; };
  const pitch = 32; let citeWrap = 0, overflow = 0, two = 0; const rows = [...document.querySelectorAll('#open-source .row')];
  for (const row of rows) { const c = row.querySelector('cite'); const h = Math.round(c.getBoundingClientRect().height / pitch); if (h > 1) citeWrap++; if (c.scrollWidth > c.clientWidth + 1) overflow++; if (Math.round(row.getBoundingClientRect().height / pitch) >= 2) two++; }
  return { citeWrap, overflow, two, rows: rows.length };
});
console.log('after nowrap segments', JSON.stringify(after));
await browser.close();
