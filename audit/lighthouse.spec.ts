import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';
import { launch } from 'chrome-launcher';
import lighthouse from 'lighthouse';
import desktopConfig from 'lighthouse/core/config/desktop-config.js';

import { systemChrome } from '../playwright.config';

// A floor under where the site already is, not a target: main scores 0.95 / 1 / 1 / 1 on
// this desktop profile, four runs apart. Performance keeps the slack — it is the only
// score that reads the machine, and this one renders the demos' WebGL in software.
const THRESHOLDS: Record<string, number> = {
  performance: 0.9,
  accessibility: 1,
  'best-practices': 1,
  seo: 1,
};

const reportDir = fileURLToPath(new URL('../audit-report/', import.meta.url));

// Lighthouse drives Chrome itself over CDP, so it gets its own browser rather than the
// one Playwright hands the other tests.
test('lighthouse scores the home page above the thresholds', async ({ baseURL }, testInfo) => {
  test.slow();

  const chrome = await launch({
    chromePath: systemChrome(),
    chromeFlags: ['--headless=new'],
    port: Number(process.env.AUDIT_CHROME_PORT ?? 0),
  });

  try {
    const run = await lighthouse(
      `${baseURL}/`,
      { port: chrome.port, output: ['html', 'json'], logLevel: 'error' },
      desktopConfig,
    );
    expect(run, 'lighthouse returned no result').toBeTruthy();

    const [html, json] = run!.report as string[];
    await mkdir(reportDir, { recursive: true });
    await writeFile(join(reportDir, 'lighthouse.html'), html);
    await writeFile(join(reportDir, 'lighthouse.json'), json);
    await testInfo.attach('lighthouse.html', { body: html, contentType: 'text/html' });

    const scores = Object.fromEntries(
      Object.entries(run!.lhr.categories).map(([id, category]) => [id, category.score ?? 0]),
    );
    console.log('lighthouse scores', scores);

    for (const [id, floor] of Object.entries(THRESHOLDS)) {
      expect(scores[id], `${id} score`).toBeGreaterThanOrEqual(floor);
    }
  } finally {
    chrome.kill();
  }
});
