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
    // The build served through wrangler dev, offline in workerd, the same worker and
    // static-assets setup wrangler.jsonc deploys. That is what the reader gets: the
    // document brotli-compressed (1.5 MB down to 200 KB), _astro/ files immutable for a
    // year, public/_headers applied. astro preview sends every file uncompressed, and
    // Lighthouse's mobile profile simulates slow 4G, so on that server it timed a
    // download nobody makes. No wrangler login is involved: --local never talks to
    // Cloudflare. No reuse: the HTML and CSS checks read dist/, so the audit has to be
    // the thing that built it.
    command: `npm run build && npx wrangler dev --local --ip 127.0.0.1 --port ${PORT} --show-interactive-dev-session=false`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
