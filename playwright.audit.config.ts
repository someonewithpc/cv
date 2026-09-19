import { defineConfig } from '@playwright/test';

import base from './playwright.config';

// Its own port, so an audit and the e2e suite (4310) can run side by side.
const PORT = Number(process.env.AUDIT_PORT ?? 4311);

export default defineConfig({
  ...base,
  testDir: './audit',
  // Lighthouse times a machine, not a page: anything else rendering on this one while it
  // runs lands in its numbers.
  workers: 1,
  timeout: 180_000,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-audit' }]],
  use: {
    ...base.use,
    baseURL: `http://localhost:${PORT}`,
  },
  webServer: {
    // No reuse: the HTML and CSS checks read dist/, so the audit has to be the thing
    // that built it.
    command: `npm run build && npm run preview -- --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      // See playwright.config.ts: astro preview backgrounds itself under a coding agent.
      ASTRO_PREVIEW_BACKGROUND: '1',
    },
  },
});
