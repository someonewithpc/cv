import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';
import { launch } from 'chrome-launcher';
import lighthouse, { type Config } from 'lighthouse';
import desktopConfig from 'lighthouse/core/config/desktop-config.js';

import { systemChrome } from '../playwright.config';

// Floors under where the site already is, not targets. Performance keeps the slack: it
// is the only score that reads the machine. Five runs here give desktop 0.96 to 0.97 and
// mobile 0.66 to 0.67, with every other category flat at 1.
//
// Mobile performance is low because of the first paint, not the demos: blocking time and
// layout shift both score 1, while first contentful paint lands at 5.3 s on a simulated
// slow 4G link. Lighthouse blames a 537 KiB uncompressed document and a 160 KiB
// render-blocking stylesheet. astro preview sends neither compressed and Cloudflare does,
// so the deployed number is better than this one.
const PROFILES = [
  {
    // Lighthouse's own desktop preset: no CPU throttling, a fast link, 1350x940.
    name: 'desktop',
    config: desktopConfig,
    thresholds: { performance: 0.9, accessibility: 1, 'best-practices': 1, seo: 1 },
  },
  {
    // No config is Lighthouse's default, which is the mobile one: a Moto G Power form
    // factor, 4x CPU slowdown and simulated slow 4G.
    name: 'mobile',
    config: undefined,
    thresholds: { performance: 0.6, accessibility: 1, 'best-practices': 1, seo: 1 },
  },
] satisfies { name: string; config: Config | undefined; thresholds: Record<string, number> }[];

const reportDir = fileURLToPath(new URL('../audit-report/', import.meta.url));

for (const { name, config, thresholds } of PROFILES) {
  // Lighthouse drives Chrome itself over CDP, so it gets its own browser rather than the
  // one Playwright hands the other tests.
  test(`lighthouse scores the home page above the ${name} thresholds`, async ({ baseURL }, testInfo) => {
    test.slow();

    const chrome = await launch({
      chromePath: systemChrome(),
      chromeFlags: ['--headless=new'],
      port: Number(process.env.AUDIT_CHROME_PORT ?? 0),
    });

    try {
      const run = await lighthouse(`${baseURL}/`, { port: chrome.port, output: ['html', 'json'], logLevel: 'error' }, config);
      expect(run, 'lighthouse returned no result').toBeTruthy();

      const [html, json] = run!.report as string[];
      await mkdir(reportDir, { recursive: true });
      await writeFile(join(reportDir, `lighthouse-${name}.html`), html);
      await writeFile(join(reportDir, `lighthouse-${name}.json`), json);
      await testInfo.attach(`lighthouse-${name}.html`, { body: html, contentType: 'text/html' });

      const scores = Object.fromEntries(
        Object.entries(run!.lhr.categories).map(([id, category]) => [id, category.score ?? 0]),
      );
      console.log(`lighthouse ${name} scores`, scores);

      for (const [id, floor] of Object.entries(thresholds)) {
        expect(scores[id], `${name} ${id} score`).toBeGreaterThanOrEqual(floor);
      }
    } finally {
      chrome.kill();
    }
  });
}
