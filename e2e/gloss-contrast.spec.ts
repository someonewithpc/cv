import { expect, test } from '@playwright/test';

/**
 * Every Japanese gloss against the flat colour behind it: the first opaque background up its
 * ancestors, with any translucent ones over it. The paper grain paints on pseudo-elements and is
 * left out, which is also why axe reports these as incomplete on the paper sheets.
 */
function glossContrasts() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const g = canvas.getContext('2d', { willReadFrequently: true })!;
  const pixel = () => Array.from(g.getImageData(0, 0, 1, 1).data.slice(0, 3));
  const luminance = (rgb: number[]) => {
    const [r, gr, b] = rgb.map((v) => {
      const c = v / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * gr + 0.0722 * b;
  };

  return [...document.querySelectorAll<HTMLElement>('[lang="ja"]')]
    .filter((el) => el.getClientRects().length > 0)
    .map((el) => {
      const layers: string[] = [];
      for (let node: HTMLElement | null = el; node; node = node.parentElement) {
        const background = getComputedStyle(node).backgroundColor;
        if (background === 'rgba(0, 0, 0, 0)') continue;
        layers.unshift(background);
        g.clearRect(0, 0, 1, 1);
        g.fillStyle = background;
        g.fillRect(0, 0, 1, 1);
        if (g.getImageData(0, 0, 1, 1).data[3] === 255) break;
      }
      g.fillStyle = '#fff';
      g.fillRect(0, 0, 1, 1);
      for (const layer of layers) {
        g.fillStyle = layer;
        g.fillRect(0, 0, 1, 1);
      }
      const back = luminance(pixel());
      g.fillStyle = getComputedStyle(el).color;
      g.fillRect(0, 0, 1, 1);
      const ink = luminance(pixel());
      const [light, dark] = [back, ink].sort((a, b) => b - a);
      return { text: el.textContent!.trim(), ratio: (light + 0.05) / (dark + 0.05) };
    });
}

for (const width of [390, 1440]) {
  test(`the Japanese glosses clear 4.5:1 in every theme at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');

    for (const theme of ['light', 'dark', 'arctic', 'dark-forest']) {
      await page.evaluate((name) => localStorage.setItem('cv-theme', name), theme);
      await page.reload();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);

      const glosses = await page.evaluate(glossContrasts);
      expect(glosses.length, theme).toBeGreaterThan(0);
      const low = glosses.filter(({ ratio }) => ratio < 4.5).map(({ text, ratio }) => `${text} ${ratio.toFixed(2)}`);
      expect(low, theme).toEqual([]);
    }
  });
}
