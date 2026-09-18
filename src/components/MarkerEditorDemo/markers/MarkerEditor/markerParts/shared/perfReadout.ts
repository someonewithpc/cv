/**
 * `?perf=1` puts the picker-to-paint delay in the corner of the screen, so the number can be
 * read on the phone it is being judged on rather than inferred from a desktop trace.
 *
 * It measures the gap between a colour event and the first frame the browser runs after it,
 * which is the frame that shows the new colour: the live style rule is written inside the
 * event, so there is nothing between the two but the browser deciding to draw.
 *
 * Nothing here runs, and no element is created, unless the parameter is on the URL.
 */

let readout: HTMLElement | null = null;
let enabled: boolean | null = null;
let pending = false;
let sentAt = 0;
let count = 0;
let total = 0;
let worst = 0;

function isEnabled(): boolean {
  if (enabled === null) {
    enabled = typeof location !== 'undefined' && new URLSearchParams(location.search).get('perf') === '1';
  }
  return enabled;
}

function show(text: string) {
  if (!readout) {
    readout = document.createElement('div');
    readout.id = 'marker-editor-perf-readout';
    readout.style.cssText = [
      'position: fixed', 'inset: auto 0.5rem 0.5rem auto', 'z-index: 2147483647',
      'padding: 0.25rem 0.5rem', 'border-radius: 0.25rem', 'background: #000c', 'color: #fff',
      'font: 0.75rem/1.4 monospace', 'pointer-events: none', 'white-space: pre',
    ].join(';');
    document.body.appendChild(readout);
  }
  readout.textContent = text;
}

/** Call on every colour event. A no-op without `?perf=1`. */
export function markColorEvent(): void {
  if (!isEnabled() || pending) return;
  pending = true;
  sentAt = performance.now();
  requestAnimationFrame(() => {
    pending = false;
    const delay = performance.now() - sentAt;
    count += 1;
    total += delay;
    worst = Math.max(worst, delay);
    show(`event to paint\nlast ${delay.toFixed(1)} ms\nmean ${(total / count).toFixed(1)} ms\nworst ${worst.toFixed(1)} ms\nn ${count}`);
  });
}
