import { demoStack, frontPage, frontPageIndex, turnToPage } from './support/paperStack';
import { expect, test } from './support/timeScale';

/**
 * Kept out of marker-editor.spec.ts: four other branches are editing that file, and a
 * test appended to its end conflicts with every one of them.
 */

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

function markerEditorStack(page: import('@playwright/test').Page) {
  return demoStack(page, 'Interactive map marker editor');
}

test('parts and store pages: the diagram fills the sheet it sits on', async ({ page }) => {
  const stack = markerEditorStack(page);
  await stack.scrollIntoViewIfNeeded();

  for (const name of ['Composable parts', 'Undoable store']) {
    await turnToPage(stack, name);
    const front = frontPage(stack, await frontPageIndex(stack));
    const diagram = front.locator('section .content > *').first();
    await expect(diagram).toBeVisible();

    const fit = await diagram.evaluate((el) => {
      const sheet = el.closest('section')!.getBoundingClientRect();
      const cell = el.parentElement!.getBoundingClientRect();
      const box = el.getBoundingClientRect();
      return {
        inside:
          box.left >= sheet.left - 1
          && box.right <= sheet.right + 1
          && box.top >= sheet.top - 1
          && box.bottom <= sheet.bottom + 1,
        widthShare: box.width / cell.width,
      };
    });

    // Both halves matter: these two diagrams used to stop around two thirds of the
    // artwork area while the pages either side filled theirs, and the type scale that
    // fixes that is the one thing that could push them off the sheet.
    expect(fit.inside).toBe(true);
    expect(fit.widthShare).toBeGreaterThan(0.8);
  }
});

/** Letter and number labels the walkthrough's presets put on a pin, in space order. */
const LABEL_SEQUENCES = [['A', 'B'], ['1', '2']];

test.describe(() => {
  test.use({ walkthroughRate: 4 });

  test('the second space a marker is placed on takes its own label', async ({ page }) => {
    // The walkthrough builds a marker, saves it, then assigns it to a second space; that
    // is about twenty seconds in at real time.
    test.setTimeout(60_000);

    const stack = markerEditorStack(page);
    // Scroll only: a mouse move hands control to the visitor and pauses the walkthrough.
    await stack.scrollIntoViewIfNeeded();

    const readPins = () => page.evaluate(() => {
      const byName: Record<string, string> = {};
      document.querySelectorAll('.space-pin').forEach((pin) => {
        const name = pin.getAttribute('aria-label')?.replace('Edit marker for ', '');
        const text = pin.querySelector('text')?.textContent?.trim();
        if (name && text) byName[name] = text;
      });
      return byName;
    });

    await expect
      .poll(async () => Object.keys(await readPins()).length, { timeout: 40_000, intervals: [400] })
      .toBeGreaterThan(1);

    const pins = await readPins();

    // The label belongs to the space, not to the marker: the same marker on Lobby and Cafe
    // reads A then B. It read A twice while the saved SVG named its decoration by a class
    // name the bundler had renamed, which is what the map matches on to relabel it.
    expect(pins.Lobby).not.toBe(pins.Cafe);
    expect(LABEL_SEQUENCES).toContainEqual([pins.Lobby, pins.Cafe]);
  });
});

/** Average distance between the stripe starts along a row and a column of the sample. */
async function stripePitch(page: import('@playwright/test').Page, sample: import('@playwright/test').Locator) {
  const shot = (await sample.screenshot()).toString('base64');
  return page.evaluate(async (data) => {
    const img = new Image();
    img.src = `data:image/png;base64,${data}`;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const { data: px } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const at = (x: number, y: number) => {
      const i = (canvas.width * y + x) << 2;
      return [px[i], px[i + 1], px[i + 2]];
    };
    const isStripe = (p: number[]) => p[1] > p[0] + 12 && p[1] > p[2] + 12;
    const starts = (count: number, read: (k: number) => number[]) => {
      const out: number[] = [];
      let inRun = false;
      for (let k = 4; k < count - 4; k += 1) {
        const hit = isStripe(read(k));
        if (hit && !inRun) out.push(k);
        inRun = hit;
      }
      return out;
    };
    const midY = Math.floor(canvas.height / 2);
    const midX = Math.floor(canvas.width / 2);
    const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
    const gaps = (a: number[]) => a.slice(1).map((v, i) => v - a[i]);
    const xs = starts(canvas.width, (x) => at(x, midY));
    const ys = starts(canvas.height, (y) => at(midX, y));
    return { columns: xs.length, rows: ys.length, x: mean(gaps(xs)), y: mean(gaps(ys)) };
  }, shot);
}

for (const [width, height] of [[1440, 900], [900, 760]]) {
  test(`preview background page: the failed grid is square at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height });

    const stack = markerEditorStack(page);
    await stack.scrollIntoViewIfNeeded();
    await turnToPage(stack, 'Preview background');

    const front = frontPage(stack, await frontPageIndex(stack));
    const samples = front.locator('.background-layer .fail-both.debug');
    const count = await samples.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i += 1) {
      const sample = samples.nth(i);
      if (!(await sample.isVisible())) continue;

      const pitch = await stripePitch(page, sample);
      expect(pitch.columns).toBeGreaterThan(2);
      expect(pitch.rows).toBeGreaterThan(2);
      // Both periods were percentages of the axis they ran along, so the cells came out
      // as wide as the sample box: 1.55 to 1 on the card, 1.22 to 1 on the minis.
      expect(pitch.x / pitch.y).toBeGreaterThan(0.93);
      expect(pitch.x / pitch.y).toBeLessThan(1.07);
    }
  });
}
