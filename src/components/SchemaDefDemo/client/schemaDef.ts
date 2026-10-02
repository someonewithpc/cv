import { onAutoplayCommand, reducedMotion, reportAutoplayState } from '@/client/autoplayStatus';
import { documentGate, watchPageActive } from '@/client/frontPage';
import { watchHandover } from '@/client/walkthroughHandover';

/** How long the walk rests on each pair: long enough to read the rule under the panes. */
const STEP_MS = 2200;

/**
 * The two panes' cross-highlight. One key is lit at a time: the line on each side that
 * carries it, and the rule under the panes that says what happened between them. Hovering
 * or focusing a keyed line lights its key; the counterpart scrolls into its own pane, never
 * the page. Arrow keys move through the keyed lines, up and down within a pane and across
 * to the counterpart with left and right, with one tab stop per pane.
 *
 * While nobody is using it, the highlight walks the schema top to bottom. The walk only
 * runs while the page is the one on top and on screen, and never under reduced motion. The
 * visitor takes it over and hands it back as watchHandover decides, and the sheet's
 * transport deck holds it or hands it back at once.
 */
export function initSchemaDef(root: HTMLElement) {
  const keys = JSON.parse(root.dataset.keys ?? '[]') as string[];
  const panes = [...root.querySelectorAll<HTMLElement>('[data-pane]')];
  const rules = [...root.querySelectorAll<HTMLElement>('[data-rule]')];
  const fallbackRule = root.querySelector<HTMLElement>('[data-rule-default]');
  if (keys.length === 0 || panes.length === 0) return;

  // The :has() rules that stood in for this script stand down.
  root.dataset.enhanced = 'true';

  let lit: string | null = null;
  let playing = false;
  // Separate from `playing`: whether the walk should run once reduced motion stops forcing
  // it off, as opposed to `playing` itself, which reduced motion can override to false.
  let wanted = false;
  let active = false;
  let held = false;
  let step = -1;
  let cancelStep = () => {};

  const linesOf = (pane: HTMLElement) => [...pane.querySelectorAll<HTMLElement>('.line[data-key]')];

  /** Scrolls `line` into view inside its own pane only, the least distance that does it. */
  const reveal = (line: HTMLElement) => {
    const scroller = line.closest<HTMLElement>('[data-scroller]');
    if (!scroller) return;
    // The scroller is positioned, so it is the line's offset parent.
    const top = line.offsetTop;
    const bottom = top + line.offsetHeight;
    const pad = line.offsetHeight;
    let to: number | null = null;
    if (top - pad < scroller.scrollTop) to = top - pad;
    else if (bottom + pad > scroller.scrollTop + scroller.clientHeight) to = bottom + pad - scroller.clientHeight;
    if (to === null) return;
    scroller.scrollTo({ top: Math.max(0, to), behavior: reducedMotion(root) ? 'auto' : 'smooth' });
  };

  const light = (key: string | null, from?: HTMLElement) => {
    if (key === lit) return;
    lit = key;
    root.querySelectorAll('.line.lit').forEach((line) => line.classList.remove('lit'));
    rules.forEach((rule) => {
      rule.hidden = rule.dataset.rule !== key;
    });
    if (fallbackRule) fallbackRule.hidden = key !== null;
    if (!key) return;

    for (const pane of panes) {
      const matches = linesOf(pane).filter((line) => line.dataset.key === key);
      matches.forEach((line) => line.classList.add('lit'));
      // The pane being pointed at stays where the visitor put it.
      if (matches[0] && !pane.contains(from ?? null)) reveal(matches[matches.length - 1]);
    }
  };

  const schedule = () => {
    cancelStep();
    if (!playing || !active) return;
    cancelStep = documentGate().timeout(() => {
      step = (step + 1) % keys.length;
      light(keys[step]);
      schedule();
    }, step < 0 ? 600 : STEP_MS);
  };

  const setPlaying = (next: boolean) => {
    wanted = next;
    playing = next && !reducedMotion(root);
    reportAutoplayState(root, playing ? 'playing' : reducedMotion(root) ? 'paused' : 'user');
    schedule();
  };

  const handover = watchHandover(root, {
    listening: () => active,
    takeOver() {
      if (playing) setPlaying(false);
    },
    handBack() {
      if (held) return false;
      setPlaying(true);
      return true;
    },
  });

  root.addEventListener('pointerover', (event) => {
    const line = (event.target as Element).closest<HTMLElement>('.line[data-key]');
    if (line) light(line.dataset.key ?? null, line);
  });

  root.addEventListener('focusin', (event) => {
    const line = (event.target as Element).closest<HTMLElement>('.line[data-key]');
    if (!line) return;
    // Roving tab stop: the pane's one stop follows the line that last had focus.
    const pane = line.closest<HTMLElement>('[data-pane]');
    if (pane) linesOf(pane).forEach((other) => other.setAttribute('tabindex', other === line ? '0' : '-1'));
    light(line.dataset.key ?? null, line);
  });

  root.addEventListener('keydown', (event) => {
    const line = (event.target as Element).closest<HTMLElement>('.line[data-key]');
    const pane = line?.closest<HTMLElement>('[data-pane]');
    if (!line || !pane) return;

    const lines = linesOf(pane);
    const at = lines.indexOf(line);
    let next: HTMLElement | undefined;

    switch (event.key) {
      case 'ArrowDown':
        next = lines[Math.min(lines.length - 1, at + 1)];
        break;
      case 'ArrowUp':
        next = lines[Math.max(0, at - 1)];
        break;
      case 'Home':
        next = lines[0];
        break;
      case 'End':
        next = lines[lines.length - 1];
        break;
      case 'ArrowLeft':
      case 'ArrowRight': {
        const other = panes[(panes.indexOf(pane) + (event.key === 'ArrowRight' ? 1 : panes.length - 1)) % panes.length];
        next = linesOf(other).find((candidate) => candidate.dataset.key === line.dataset.key);
        break;
      }
      default:
        return;
    }

    event.preventDefault();
    if (!next || next === line) return;
    next.focus({ preventScroll: true });
    reveal(next);
  });

  onAutoplayCommand(root, (command) => {
    if (command === 'pause') {
      held = true;
      handover.takeOver();
      return;
    }
    held = false;
    handover.release();
    if (command === 'reset') {
      step = -1;
      light(null);
    }
    setPlaying(true);
  });

  watchPageActive(root, (next) => {
    active = next;
    schedule();
  });

  matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', () => setPlaying(wanted));

  setPlaying(true);
}
