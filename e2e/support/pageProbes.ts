import type { Page } from '@playwright/test';

declare global {
  interface Window {
    e2eProbes?: {
      /** The width a CSS length resolves to, in px, measured on a hidden box inside `within`. `var()` works. */
      px(length: string, within?: Element): number;
      /** Any CSS colour as sRGBA bytes, the way a canvas paints it; `var()` resolves inside `within`. */
      srgba(colour: string, within?: Element): number[];
    };
  }
}

const define = () => {
  if (window.e2eProbes) return;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  window.e2eProbes = {
    px(length, within = document.body) {
      const probe = document.createElement('div');
      probe.style.cssText = `position:absolute;visibility:hidden;width:${length}`;
      within.append(probe);
      const width = probe.getBoundingClientRect().width;
      probe.remove();
      return width;
    },
    srgba(colour, within) {
      let value = colour;
      if (within) {
        const probe = document.createElement('span');
        probe.style.color = colour;
        within.append(probe);
        value = getComputedStyle(probe).color;
        probe.remove();
      }
      context.clearRect(0, 0, 1, 1);
      // A colour the canvas cannot parse keeps the old style; transparent makes that read as alpha 0.
      context.fillStyle = 'transparent';
      context.fillStyle = value;
      context.fillRect(0, 0, 1, 1);
      return [...context.getImageData(0, 0, 1, 1).data];
    },
  };
};

/**
 * Puts `window.e2eProbes` into the page now and into every page it loads after, for use inside
 * `evaluate`. The themes name their colours in oklch and the sheets write lengths as
 * expressions, which no string work turns into pixels or sRGB; the browser already knows how.
 */
export async function installProbes(page: Page): Promise<void> {
  await page.addInitScript(define);
  await page.evaluate(define);
}
