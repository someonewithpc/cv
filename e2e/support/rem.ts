import type { Page } from '@playwright/test';

/** The root font size in px: nothing declares one, so it is the reader's own default. */
export const readRem = (page: Page): Promise<number> =>
  page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
