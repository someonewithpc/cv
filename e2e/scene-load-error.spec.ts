import type { Locator, Page } from '@playwright/test';

import { demoStack, frontPage, frontPageIndex, turnToPage, waitForIslandMounted } from './support/paperStack';
import { expect, test } from './support/timeScale';

/** Every page that draws a WebGL scene, by stack. */
const SCENE_PAGES: Record<string, string[]> = {
  'Space Builder · Add Tool': ['Space Builder · Add Tool', 'Place Area', 'Edit Parameters', 'Layout Styles', 'Capacity Badge'],
  'Space Builder · Drag & Drop': ['Space Builder · Drag & Drop'],
};
/** The one scene page that never loads the chair. */
const NO_CHAIR = 'Place Area';

async function forEachScenePage(page: Page, check: (app: Locator, name: string) => Promise<void>) {
  for (const [title, names] of Object.entries(SCENE_PAGES)) {
    const stack = demoStack(page, title);
    await stack.scrollIntoViewIfNeeded();
    for (const name of names) {
      await turnToPage(stack, name);
      const front = frontPage(stack, await frontPageIndex(stack));
      await waitForIslandMounted(front);
      const app = front.locator('[data-ready]').first();
      await expect(app).toHaveAttribute('data-ready', 'true', { timeout: 20_000 });
      await check(app, name);
    }
  }
}

const unavailable = (app: Locator) => app.getByRole('status').filter({ hasText: '3D scene unavailable' });

test('a chair that fails to load puts up the scene unavailable cover', async ({ page }) => {
  await page.route(/\/chair(\.[\w-]+)?\.glb$/, (route) => route.abort());
  await page.goto('/');
  await forEachScenePage(page, async (app, name) => {
    if (name === NO_CHAIR) await expect(unavailable(app)).toHaveCount(0);
    else await expect(unavailable(app), name).toBeVisible();
  });
});

test('a lost WebGL context puts up the cover until the context comes back', async ({ page }) => {
  await page.goto('/');
  await forEachScenePage(page, async (app, name) => {
    await expect(unavailable(app)).toHaveCount(0);
    const canvas = app.locator('canvas[data-scene-canvas]');
    await canvas.evaluate((el: HTMLCanvasElement) => {
      const gl = el.getContext('webgl2');
      const ext = gl?.getExtension('WEBGL_lose_context');
      (el as HTMLCanvasElement & { lose?: WEBGL_lose_context | null }).lose = ext;
      ext?.loseContext();
    });
    await expect(unavailable(app), name).toBeVisible();
    await canvas.evaluate((el: HTMLCanvasElement & { lose?: WEBGL_lose_context | null }) => el.lose?.restoreContext());
    await expect(unavailable(app), name).toHaveCount(0);
  });
});
