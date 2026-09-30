import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';
import { launch } from 'chrome-launcher';
import lighthouse, { type Config } from 'lighthouse';
import desktopConfig from 'lighthouse/core/config/desktop-config.js';

import { systemChrome } from '../playwright.config';

// Floors under where the site already is, not targets. Performance keeps the slack: it
// is the only score that reads the machine.
//
// The server is wrangler dev (playwright.audit.config.ts), so the document arrives
// brotli-compressed at 243 KiB, not the 1,518 KiB it is on disk. One run of each on
// 2026-09-30, main a9774c0f, other suites sharing the box: astro preview gave desktop
// 0.76 and mobile 0.55 with 2,464 KiB and 2,377 KiB transferred; wrangler dev gave 0.98
// and 0.68 with 701 KiB and 648 KiB. Mobile is the lower one because Lighthouse's
// simulated slow 4G still spends 4.1 s reaching the first paint, and a 4x CPU slowdown
// on the boot scripts does the rest.
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
