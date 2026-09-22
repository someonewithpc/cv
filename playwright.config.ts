import { execFileSync } from 'node:child_process';

import { defineConfig, devices } from '@playwright/test';

const PORT = 4310;

// Playwright's own downloaded Chromium build doesn't run on NixOS (no FHS-compatible
// dynamic libs outside a nix-shell/`--with-deps` apt install, neither of which applies
// here). The system already has a working, nix-packaged Chrome — point at that instead
// of downloading a browser Playwright can't launch.
export function systemChrome(): string {
  for (const name of ['google-chrome-stable', 'google-chrome', 'chromium']) {
    try {
      return execFileSync('which', [name], { encoding: 'utf8' }).trim();
    } catch {
      continue;
    }
  }
  throw new Error(
    'No system Chrome/Chromium found on PATH. Playwright\'s own downloaded build does not ' +
      'run on NixOS — install one (e.g. via the system/home-manager config) rather than ' +
      '`playwright install --with-deps`.',
  );
}

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: true,
  // Every test here drives a real WebGL/React/Vue-heavy page (Three.js scenes, fold-drag
  // swipes with real waits), and this sandbox has no GPU passthrough — Chrome falls back
  // to software rendering (SwiftShader), so a handful of concurrent Chromes already
  // saturates a core each. Too many workers starves them all and turns genuine passes
  // into timeouts, regardless of the machine's core count. Measured on the 32-core host
  // under normal load: 2 workers 14 min clean, 4 workers 8 min clean, 8 workers 5 min with
  // three timing failures (two timeouts, one 400 ms assertion).
  workers: 4,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['html', { open: 'never' }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: { executablePath: systemChrome() },
      },
    },
  ],
  webServer: {
    // Tests run against a real production build, not `astro dev` — the dev server has its
    // own script-serving quirks (see the "dev-server-drops-demo-scripts" memory) unrelated
    // to what actually ships.
    command: `npm run build && npm run preview -- --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      // `astro preview` auto-detects a coding-agent environment (e.g. this one) and
      // silently backgrounds itself, which looks to Playwright like the launching process
      // exiting early. This is Astro's own escape hatch back to a normal foreground
      // server — see node_modules/astro/dist/cli/preview/index.js.
      ASTRO_PREVIEW_BACKGROUND: '1',
    },
  },
});
