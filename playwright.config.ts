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
  // swipes with real waits). Chrome is not on software rendering here, whatever an earlier
  // version of this comment claimed: WebGL reports "ANGLE (AMD, Vulkan 1.4.354 (AMD Radeon
  // RX 7900 XTX (RADV NAVI31)), radv)", the box's own card. A worker still costs about a
  // core, and several specs measure the page's own frame timing (paper-stack-fold's 400 ms
  // dog-ear, flip-hint-arrow's settle), so once the browsers crowd each other out the page
  // really is slower and those specs fail on the product, not on a sloppy assertion.
  // Measured on the 32-core host against one prebuilt preview, nothing else running:
  //    4 workers  7.9 min, clean
  //    6 workers  5.5 min, clean twice
  //    8 workers  4.4 min, clean in five of six runs, the sixth losing the dog-ear budget
  //   16 workers  3.4 min, six to eight failures, five of them the same specs both runs
  // Four shards of four workers is the same sixteen browsers and slower again at 4.4 min,
  // since a static split idles the last shard while the others are still going. Sharding
  // buys nothing on one host; it is for spreading a suite over several.
  // On a box shared with other work, drop back to 4.
  workers: 8,
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
