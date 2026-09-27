import { onAutoplayCommand, reportAutoplayState, type AutoplayState } from '@/client/autoplayStatus';
import { demoGate } from '@/client/frontPage';
import { pathDataToString, transformPath } from '@/client/svg-utils';
import { watchHandover } from '@/client/walkthroughHandover';
import { THEME_IDS, type ThemeId } from '@/themes';

/** The picker's own timing: the wipe is 500 ms, ease-in. */
const WIPE_MS = 500;
/** How long the stage rests on a theme before the walkthrough picks the next. */
const HOLD_MS = 2800;
const FIRST_HOLD_MS = 1400;

/** One loop of the walkthrough: every theme, then nothing picked, so the OS decides again. */
const STEPS: Array<ThemeId | null> = [...THEME_IDS, null];

let pathDataPolyfill: Promise<void> | null = null;
function ensurePathData() {
  if ('getPathData' in SVGPathElement.prototype) return Promise.resolve();
  pathDataPolyfill ??= import('path-data-polyfill').then(() => undefined);
  return pathDataPolyfill;
}

/** Browsers without declarative shadow DOM leave the template in place; attach it by hand. */
function adoptTemplate(stage: HTMLElement): ShadowRoot | null {
  const template = stage.querySelector<HTMLTemplateElement>('template[shadowrootmode]');
  if (!template) return null;
  const root = stage.attachShadow({ mode: 'open' });
  root.append(template.content);
  template.remove();
  return root;
}

/**
 * The stage: a page of its own inside a shadow root, with the picker in its corner. A pick
 * here does what a pick in the corner does, to the stage alone: the incoming page is laid
 * over the old one and cut out along the picked icon, the icon's own path mapped from its
 * box in the corner to a square the stage's diagonal times the theme's factor each side,
 * then the screen is stamped with the theme. The stamp is `data-demo-theme` on the screen,
 * never `data-theme` on the document, and nothing is kept.
 *
 * Left alone, the walkthrough picks each theme in turn and then lets the OS decide again.
 * It runs on the page's gate, so it stands still off screen, under another page, through
 * a turn and in a hidden tab, and never under reduced motion.
 */
export function initThemePickerDemo(host: HTMLElement) {
  const stage = host.querySelector<HTMLElement>('[data-stage]');
  const root = stage?.shadowRoot ?? (stage ? adoptTemplate(stage) : null);
  const screen = root?.querySelector<HTMLElement>('[data-screen]');
  const under = root?.querySelector<HTMLElement>('[data-paper="under"]');
  const over = root?.querySelector<HTMLElement>('[data-paper="over"]');
  if (!stage || !root || !screen || !under || !over) return;

  const osDark = matchMedia('(prefers-color-scheme: dark)');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const gate = demoGate(host);

  const shown = (): ThemeId => (screen.dataset.demoTheme as ThemeId | undefined) ?? (osDark.matches ? 'dark' : 'light');

  const press = (paper: HTMLElement, id: ThemeId | null) => {
    paper.querySelectorAll<HTMLElement>('[data-pick]').forEach((key) => {
      const on = key.dataset.pick === id;
      key.toggleAttribute('data-on', on);
      if (key instanceof HTMLButtonElement) key.setAttribute('aria-pressed', String(on));
    });
  };

  const stamp = (id: ThemeId | null) => {
    if (id) screen.dataset.demoTheme = id;
    else delete screen.dataset.demoTheme;
    press(under, id);
  };

  /* The two clip paths, in the over layer's own box: the icon where it sits, and the icon
     grown to a square centred there, the diagonal times the factor each side. */
  function clipFrames(id: ThemeId) {
    const svg = over!.querySelector<SVGSVGElement>(`[data-pick="${id}"] svg.checked`);
    const path = svg?.querySelector<SVGPathElement>('path');
    if (!svg || !path || typeof path.getPathData !== 'function') return null;
    const viewBox = svg.viewBox.baseVal;
    if (!viewBox.width) return null;

    const box = over!.getBoundingClientRect();
    const rect = svg.getBoundingClientRect();
    const pathData = path.getPathData({ normalize: true });
    const factor = +(svg.dataset.factor ?? '1');
    const size = Math.hypot(box.width, box.height) * factor;
    const cx = rect.x - box.x + rect.width / 2;
    const cy = rect.y - box.y + rect.height / 2;
    const at = (to: { x: number; y: number; width: number; height: number }) => (
      `path("${pathDataToString(transformPath(pathData, viewBox, to))}")`
    );
    return {
      start: at({ x: rect.x - box.x, y: rect.y - box.y, width: rect.width, height: rect.height }),
      end: at({ x: cx - size, y: cy - size, width: size * 2, height: size * 2 }),
    };
  }

  let wipe: Animation | null = null;

  async function pick(id: ThemeId) {
    if (id === shown()) return;
    /* A second pick mid-wipe skips the first, as the picker does. */
    wipe?.finish();
    if (reducedMotion.matches || document.visibilityState !== 'visible') {
      stamp(id);
      return;
    }

    over!.dataset.demoTheme = id;
    press(over!, id);
    over!.hidden = false;

    let frames: ReturnType<typeof clipFrames> = null;
    try {
      await ensurePathData();
      frames = clipFrames(id);
    } catch {
      frames = null;
    }

    const settle = () => {
      over!.hidden = true;
      delete over!.dataset.demoTheme;
      stamp(id);
    };

    if (!frames) {
      settle();
      return;
    }

    const animation = over!.animate(
      [{ clipPath: frames.start }, { clipPath: frames.end }],
      { duration: WIPE_MS, easing: 'ease-in' },
    );
    wipe = animation;
    await animation.finished.catch(() => undefined);
    if (wipe === animation) wipe = null;
    settle();
  }

  let playToken = 0;
  let playing = 0;
  let step = 0;
  let held = false;

  const report = (state: AutoplayState) => reportAutoplayState(host, state);

  async function play() {
    const token = ++playToken;
    playing = token;
    try {
      while (token === playToken) {
        await gate.wait(step === 0 ? FIRST_HOLD_MS : HOLD_MS);
        if (token !== playToken) return;
        const id = STEPS[step % STEPS.length] ?? null;
        step += 1;
        if (id) await pick(id);
        else stamp(null);
      }
    } finally {
      if (playing === token) playing = 0;
    }
  }

  const stop = () => {
    playToken += 1;
  };

  const handover = watchHandover(stage, {
    listening: () => gate.running,
    takeOver() {
      report('user');
      stop();
    },
    handBack() {
      if (held || reducedMotion.matches) return false;
      report('playing');
      void play();
      return true;
    },
  });

  const canPlay = () => !held && !handover.userControl && !reducedMotion.matches;

  under.querySelectorAll<HTMLButtonElement>('button[data-pick]').forEach((key) => {
    key.addEventListener('click', () => {
      const id = key.dataset.pick as ThemeId | undefined;
      if (id) void pick(id);
    });
  });

  onAutoplayCommand(host, (command) => {
    if (reducedMotion.matches) return;
    if (command === 'pause') {
      held = true;
      handover.takeOver();
      return;
    }
    const wasPlaying = !handover.userControl && playing !== 0;
    held = false;
    handover.release();
    report('playing');
    if (command === 'play' && wasPlaying) return;
    if (command === 'reset') {
      stop();
      step = 0;
      stamp(null);
    }
    if (canPlay()) void play();
  });

  reducedMotion.addEventListener('change', () => {
    if (reducedMotion.matches) {
      stop();
      report('off');
      return;
    }
    report(handover.userControl ? 'user' : 'playing');
    if (canPlay()) void play();
  });

  report(reducedMotion.matches ? 'off' : 'playing');
  if (canPlay()) void play();
}
