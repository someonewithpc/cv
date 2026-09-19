import { expect, test } from '@playwright/test';

import site from '../src/components/OpenSourceContributions/site.json' with { type: 'json' };

const THEMES = ['light', 'dark', 'arctic', 'dark-forest'];

test('every theme lays the page on a desk with its own paper, tape and folder colours', async ({ page }) => {
  for (const theme of THEMES) {
    await page.addInitScript((id) => localStorage.setItem('cv-theme', id), theme);
    await page.goto('/');

    const surfaces = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      const main = getComputedStyle(document.querySelector('main')!);
      return {
        desk: root.getPropertyValue('--theme-desk').trim(),
        paper: root.getPropertyValue('--theme-paper').trim(),
        tape: root.getPropertyValue('--theme-tape').trim(),
        folder: root.getPropertyValue('--theme-folder').trim(),
        grain: main.backgroundImage.includes('data:image/svg+xml'),
        letterhead: getComputedStyle(document.querySelector('.letterhead')!).backgroundColor,
        folderBox: getComputedStyle(document.querySelector('#open-source .folder')!).backgroundColor,
      };
    });

    for (const token of ['desk', 'paper', 'tape', 'folder'] as const) {
      expect(surfaces[token], `${theme} --theme-${token}`).not.toBe('');
    }
    expect(surfaces.grain, `${theme} desk grain`).toBe(true);
    expect(surfaces.letterhead, `${theme} letterhead`).not.toBe(surfaces.folderBox);
  }
});

test('objects lie on the desk at an angle without widening a phone page', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  const tilted = ['.letterhead', '#demos-heading', '#open-source-heading', '#open-source article'];
  for (const selector of tilted) {
    await expect(page.locator(selector).first(), selector).not.toHaveCSS('rotate', 'none');
  }

  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(overflow.scrollWidth).toBe(overflow.clientWidth);
});

test('each contribution group is a folder whose tab counts the rows in its ledger', async ({ page }) => {
  await page.goto('/');

  for (const group of site.groups) {
    const section = page.locator(`#open-source section[data-group="${group.id}"]`);
    const tab = section.locator('h3.tab');
    await expect(tab).toContainText(group.label);
    await expect(tab.locator('data')).toHaveText(String(group.items.length));
    await expect(section.locator('.folder .ledger .row')).toHaveCount(group.items.length);
  }
});
