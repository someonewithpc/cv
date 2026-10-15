import { expect, type Locator, type Page } from '@playwright/test';

import { demoStack, frontPage, frontPageIndex, waitForIslandMounted } from './paperStack';

/** Every scene app marks its own root `data-ready="true"` once Three.js has finished loading. */
export async function waitForSceneReady(front: Locator, timeout = 30_000): Promise<Locator> {
  const island = await waitForIslandMounted(front);
  const app = island.locator('[data-ready]');
  await expect(app).toHaveAttribute('data-ready', 'true', { timeout });
  return app;
}

/** The Add tool's sidebar, open, with the walkthrough handed over to the test. */
export async function openCatalog(page: Page): Promise<Locator> {
  const stack = demoStack(page, 'Space Builder · Add Tool');
  await stack.scrollIntoViewIfNeeded();
  const app = await waitForSceneReady(frontPage(stack, await frontPageIndex(stack)));

  // Focusing the root takes the demo over from its auto-play loop (MockSceneApp.vue's
  // `@focus="yieldToUser"`), which otherwise keeps toggling the panel underneath us.
  await app.focus();
  if ((await app.getAttribute('data-panel')) !== 'catalog') {
    await app.getByRole('button', { name: 'Add object' }).click();
  }
  await expect(app).toHaveAttribute('data-panel', 'catalog');
  return app;
}
