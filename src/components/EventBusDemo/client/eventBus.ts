import { onAutoplayCommand, reportAutoplayState } from '@/client/autoplayStatus';
import { createCursorMover, type Point } from '@/client/cursorMotion';
import { watchDrawingNote } from '@/client/drawingNote';
import { watchPageActive } from '@/client/frontPage';
import { demoPress } from '@/components/TechnicalDrawing/demo-cursor-press';

import { defaultAttachment, dispatch, listeners } from '../events';

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

/** How long the token takes between two stops on the rail, and how long a listener holds it. */
const HOP_MS = 420;
const HEAR_MS = 360;
/** Past a stop, the token runs over the skipped listeners to the return at this pace. */
const SKIP_HOP_MS = 180;
/** How long the chain takes to close up around a module switched on or off. */
const RESORT_MS = 320;
/** A quiet spell after the visitor's pointer leaves, then the walkthrough picks up again. */
const RESUME_DELAY_MS = 6000;
/** The tip of the drawn arrow, as fractions of the cursor's box. */
const CURSOR_HOTSPOT = { x: 0.12, y: 0.08 };

type Bus = {
  root: HTMLElement;
  chain: HTMLOListElement;
  end: HTMLElement;
  tray: HTMLUListElement;
  unloaded: HTMLElement;
  frame: HTMLElement;
  token: HTMLElement;
  items: Map<string, HTMLElement>;
  attachmentButtons: HTMLButtonElement[];
  dispatchButton: HTMLButtonElement;
  branch: HTMLElement;
  branchNote: HTMLElement;
  returned: HTMLElement;
  attachment: string;
  enabled: Set<string>;
  /** Bumped by every dispatch, so a run that has been overtaken stops where it is. */
  run: number;
  /** The dispatch in flight, which the walkthrough waits on before its next step. */
  running: Promise<void>;
};

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/** What a listener answered, on its chip and in the tag under its port. A pending tag keeps
    its old word, hidden, so the row does not change height while the token is out. */
function answer(item: HTMLElement, result: string) {
  item.dataset.result = result;
  if (result === 'pending') return;
  item.querySelector<HTMLElement>('.result')!.textContent = result;
}

function loadSwitch(item: HTMLElement) {
  return item.querySelector<HTMLButtonElement>('.load')!;
}

/** The centre of a stop's node, in the rail frame's own pixels. */
function nodeAt(bus: Bus, item: HTMLElement): Point {
  const node = item.querySelector<HTMLElement>('.node')!.getBoundingClientRect();
  const frame = bus.frame.getBoundingClientRect();
  return { x: node.left + node.width / 2 - frame.left, y: node.top + node.height / 2 - frame.top };
}

function placeToken(bus: Bus, at: Point) {
  bus.token.getAnimations().forEach((animation) => animation.cancel());
  bus.token.style.translate = `${at.x}px ${at.y}px`;
}

async function hop(bus: Bus, to: Point, ms: number) {
  const from = bus.token.style.translate || `${to.x}px ${to.y}px`;
  const target = `${to.x}px ${to.y}px`;
  bus.token.style.translate = target;
  if (reducedMotion.matches) return;
  const animation = bus.token.animate([{ translate: from }, { translate: target }], {
    duration: ms,
    easing: 'cubic-bezier(0.45, 0, 0.25, 1)',
  });
  await animation.finished.catch(() => {});
}

/**
 * Moves every listener to where the dispatcher has it: loaded modules on the rail in
 * discovery order, the rest in the tray. The chips that move slide from where they were,
 * so the chain is seen closing up or making room.
 */
function placeListeners(bus: Bus) {
  const before = new Map([...bus.items].map(([module, item]) => [module, item.getBoundingClientRect()]));

  listeners.forEach(({ module }) => {
    const item = bus.items.get(module)!;
    const on = bus.enabled.has(module);
    if (on) bus.chain.insertBefore(item, bus.end);
    else bus.tray.append(item);
    const toggle = loadSwitch(item);
    toggle.setAttribute('aria-pressed', String(on));
    if (!on) answer(item, 'off');
  });
  bus.unloaded.dataset.empty = String(bus.enabled.size === listeners.length);

  if (reducedMotion.matches) return;
  bus.items.forEach((item, module) => {
    const was = before.get(module);
    const now = item.getBoundingClientRect();
    if (!was || (Math.abs(was.left - now.left) < 1 && Math.abs(was.top - now.top) < 1)) return;
    item.animate(
      [{ translate: `${was.left - now.left}px ${was.top - now.top}px` }, { translate: '0 0' }],
      { duration: RESORT_MS, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
    );
  });
}

function showOutcome(bus: Bus, outcome: ReturnType<typeof dispatch>) {
  const taken = String(outcome.result !== 'stop');
  bus.root.dataset.result = outcome.result;
  bus.root.dataset.rendered = outcome.rendered;
  bus.returned.textContent = outcome.result;
  bus.branch.dataset.taken = taken;
  bus.branchNote.dataset.taken = taken;
}

/**
 * One Event::handle: the token leaves the emitter, stops at each loaded listener in turn,
 * and each answers as it is reached. A stop turns the token and greys out everything
 * after it; the token runs on over them to the return, where the emitter's branch and
 * $res land. Reduced motion lands the whole answer at once.
 */
function runDispatch(bus: Bus): Promise<void> {
  const run = ++bus.run;
  const outcome = dispatch(bus.attachment, (module) => bus.enabled.has(module));
  const chain = listeners
    .map((listener, index) => ({ listener, index, item: bus.items.get(listener.module)! }))
    .filter(({ listener }) => bus.enabled.has(listener.module));

  bus.root.dataset.attachment = bus.attachment;
  bus.attachmentButtons.forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.attachment === bus.attachment));
  });

  const settle = () => {
    chain.forEach(({ item, index }) => {
      item.classList.remove('hearing');
      answer(item, outcome.results[index] ?? 'skipped');
    });
    bus.token.classList.toggle('stopped', outcome.result === 'stop');
    bus.token.hidden = false;
    placeToken(bus, nodeAt(bus, bus.end));
    showOutcome(bus, outcome);
  };

  if (reducedMotion.matches) {
    settle();
    bus.running = Promise.resolve();
    return bus.running;
  }

  bus.running = (async () => {
    chain.forEach(({ item }) => {
      item.classList.remove('hearing');
      answer(item, 'pending');
    });
    bus.root.dataset.rendered = 'pending';
    bus.root.dataset.result = 'pending';
    bus.returned.textContent = '…';
    bus.branch.dataset.taken = 'pending';
    bus.branchNote.dataset.taken = 'pending';
    bus.token.classList.remove('stopped');
    bus.token.hidden = false;
    placeToken(bus, nodeAt(bus, bus.chain.querySelector<HTMLElement>('.start')!));
    await wait(200);

    let stopped = false;
    for (const { item, index } of chain) {
      if (run !== bus.run) return;
      if (stopped) {
        answer(item, 'skipped');
        await hop(bus, nodeAt(bus, item), SKIP_HOP_MS);
        continue;
      }
      await hop(bus, nodeAt(bus, item), HOP_MS);
      if (run !== bus.run) return;
      item.classList.add('hearing');
      await wait(HEAR_MS);
      if (run !== bus.run) return;
      item.classList.remove('hearing');
      const result = outcome.results[index] ?? 'skipped';
      answer(item, result);
      if (result === 'stop') {
        stopped = true;
        bus.token.classList.add('stopped');
        // Everything after the stop greys out at once: none of it will hear this event.
        chain.filter((entry) => entry.index > index).forEach((entry) => {
          answer(entry.item, 'skipped');
        });
        await wait(HEAR_MS);
      }
    }
    if (run !== bus.run) return;
    await hop(bus, nodeAt(bus, bus.end), stopped ? SKIP_HOP_MS * 2 : HOP_MS);
    if (run !== bus.run) return;
    settle();
  })();
  return bus.running;
}

function setAttachment(bus: Bus, id: string) {
  bus.attachment = id;
  return runDispatch(bus);
}

function toggleModule(bus: Bus, module: string) {
  if (bus.enabled.has(module)) bus.enabled.delete(module);
  else bus.enabled.add(module);
  placeListeners(bus);
  return runDispatch(bus);
}

function restore(bus: Bus) {
  bus.attachment = defaultAttachment;
  listeners.forEach(({ module }) => bus.enabled.add(module));
  placeListeners(bus);
}

type Player = {
  setActive: (active: boolean) => void;
  setNoteOpen: (open: boolean) => void;
};

/**
 * The walkthrough: the JPEG goes down the chain and ImageEncoder claims it. ImageEncoder is
 * switched off and the same event falls through to core's plain link. The GIF goes next,
 * and VideoEncoder, which takes image/gif as well, claims it now that nothing ahead of it
 * does. ImageEncoder is switched back on and takes the GIF first, VideoEncoder greyed out
 * behind it. Every step is a control the visitor can press.
 *
 * A trusted pointer or focus on the demo hands it over at once; the loop picks up again
 * a quiet spell after the pointer has left, unless the deck's pause key was what stopped
 * it. The deck in the sheet's margin reads the state back from `data-autoplay-state`.
 */
function createPlayer(bus: Bus, host: HTMLElement): Player {
  const cursor = document.createElement('span');
  cursor.className = 'event-bus-cursor';
  cursor.setAttribute('aria-hidden', 'true');
  cursor.dataset.demoCursor = '';
  cursor.hidden = true;
  host.append(cursor);
  const mover = createCursorMover(cursor, { hotspot: CURSOR_HOTSPOT });

  let token = 0;
  let active = false;
  let noteOpen = false;
  let userControl = false;
  let pointerOver = false;
  /** The deck's pause key: no quiet spell brings the walkthrough back, only its play key. */
  let held = false;
  let resumeTimer: ReturnType<typeof setTimeout> | null = null;

  const live = (mine: number) => mine === token;

  const pointOn = (el: HTMLElement): Point => {
    const box = el.getBoundingClientRect();
    const hostBox = host.getBoundingClientRect();
    return { x: box.left + box.width / 2 - hostBox.left, y: box.top + box.height / 2 - hostBox.top };
  };

  /** Aims the drawn cursor at `el` and presses it, the way a hand would. */
  const press = async (mine: number, el: HTMLElement) => {
    const hopTo = mover.moveTo(pointOn(el));
    cursor.hidden = false;
    cursor.classList.remove('fading');
    await hopTo;
    if (!live(mine)) return false;
    await wait(220);
    if (!live(mine)) return false;
    const box = el.getBoundingClientRect();
    await demoPress(el, { x: box.left + box.width / 2, y: box.top + box.height / 2 });
    return live(mine);
  };

  const hold = async (mine: number, ms: number) => {
    await wait(ms);
    return live(mine);
  };

  const attachmentButton = (id: string) =>
    bus.attachmentButtons.find((button) => button.dataset.attachment === id)!;
  const imageEncoderSwitch = () => loadSwitch(bus.items.get('ImageEncoder')!);

  async function play() {
    const mine = ++token;
    reportAutoplayState(bus.root, 'playing');
    await wait(600);
    while (live(mine)) {
      restore(bus);
      await runDispatch(bus);
      if (!(await hold(mine, 2400))) return;

      if (!(await press(mine, imageEncoderSwitch()))) return;
      await bus.running;
      if (!(await hold(mine, 2400))) return;

      if (!(await press(mine, attachmentButton('gif')))) return;
      await bus.running;
      if (!(await hold(mine, 2400))) return;

      if (!(await press(mine, imageEncoderSwitch()))) return;
      await bus.running;
      if (!(await hold(mine, 2800))) return;

      if (!(await press(mine, attachmentButton('jpeg')))) return;
      await bus.running;
      if (!(await hold(mine, 1600))) return;
    }
  }

  function stop() {
    token += 1;
    mover.cancel();
    cursor.classList.add('fading');
    setTimeout(() => {
      if (cursor.classList.contains('fading')) cursor.hidden = true;
    }, 320);
  }

  const canPlay = () => active && !noteOpen && !userControl && !pointerOver && !reducedMotion.matches;

  function start() {
    if (reducedMotion.matches) {
      reportAutoplayState(bus.root, 'off');
      return;
    }
    if (!canPlay()) return;
    void play();
  }

  function clearResume() {
    if (resumeTimer) clearTimeout(resumeTimer);
    resumeTimer = null;
  }

  function yieldToUser(keepControl = false) {
    // Nothing plays under reduced motion, so there is nothing to take over.
    if (reducedMotion.matches) return;
    clearResume();
    if (!userControl) stop();
    userControl = true;
    reportAutoplayState(bus.root, 'user');
    if (keepControl) held = true;
    if (held) return;
    resumeTimer = setTimeout(() => {
      resumeTimer = null;
      if (pointerOver) return;
      userControl = false;
      start();
    }, RESUME_DELAY_MS);
  }

  // A finger on the demo is not yet a visitor taking over: on a phone the same touch
  // starts a page scroll, and the browser cancels the pointer once it does. Only a touch
  // that lifts, a tap, hands the demo over.
  function onTrustedPointer(event: PointerEvent) {
    if (!event.isTrusted || !active) return;
    const target = event.target;
    if (!(target instanceof Node) || !host.contains(target)) return;
    if (event.pointerType !== 'touch') {
      pointerOver = true;
      yieldToUser();
      return;
    }
    if (event.type !== 'pointerdown') return;
    const settle = (outcome: PointerEvent) => {
      if (outcome.pointerId !== event.pointerId) return;
      window.removeEventListener('pointerup', settle);
      window.removeEventListener('pointercancel', settle);
      if (outcome.type === 'pointerup') yieldToUser();
    };
    window.addEventListener('pointerup', settle);
    window.addEventListener('pointercancel', settle);
  }

  host.addEventListener('pointerleave', (event) => {
    if (!event.isTrusted || event.pointerType === 'touch') return;
    pointerOver = false;
    if (userControl && active) yieldToUser();
  });
  host.addEventListener('focusin', (event) => {
    if (event.isTrusted) yieldToUser();
  });
  window.addEventListener('pointerdown', onTrustedPointer);
  window.addEventListener('pointermove', onTrustedPointer, { passive: true });

  onAutoplayCommand(bus.root, (command) => {
    if (command === 'pause') {
      yieldToUser(true);
      return;
    }
    clearResume();
    stop();
    held = false;
    userControl = false;
    // Play is an ask for the walkthrough, so the pointer that pressed it is not in its way.
    pointerOver = false;
    start();
  });

  return {
    setActive(value) {
      active = value;
      if (!value) {
        stop();
        return;
      }
      start();
    },
    setNoteOpen(value) {
      noteOpen = value;
      if (value) stop();
      else start();
    },
  };
}

export function initEventBus(host: HTMLElement, root: HTMLElement) {
  const chain = root.querySelector<HTMLOListElement>('.chain');
  const token = root.querySelector<HTMLElement>('.token');
  if (!chain || !token) return;

  const items = new Map<string, HTMLElement>();
  root.querySelectorAll<HTMLElement>('.listener[data-module]').forEach((item) => {
    items.set(item.dataset.module!, item);
  });

  const bus: Bus = {
    root,
    chain,
    end: chain.querySelector<HTMLElement>('.end')!,
    tray: root.querySelector<HTMLUListElement>('.tray')!,
    unloaded: root.querySelector<HTMLElement>('.unloaded')!,
    frame: root.querySelector<HTMLElement>('.rail-frame')!,
    token,
    items,
    attachmentButtons: [...root.querySelectorAll<HTMLButtonElement>('.attachment')],
    dispatchButton: root.querySelector<HTMLButtonElement>('[data-dispatch]')!,
    branch: root.querySelector<HTMLElement>('.branch')!,
    branchNote: root.querySelector<HTMLElement>('.branch-note')!,
    returned: root.querySelector<HTMLElement>('.returned')!,
    attachment: root.dataset.attachment ?? defaultAttachment,
    enabled: new Set(listeners.map(({ module }) => module).filter((module) => {
      const item = items.get(module);
      return item?.querySelector('.load')?.getAttribute('aria-pressed') === 'true';
    })),
    run: 0,
    running: Promise.resolve(),
  };

  items.forEach((item, module) => {
    loadSwitch(item).addEventListener('click', () => void toggleModule(bus, module));
  });
  bus.attachmentButtons.forEach((button) => {
    button.addEventListener('click', () => void setAttachment(bus, button.dataset.attachment!));
  });
  bus.dispatchButton.addEventListener('click', () => void runDispatch(bus));

  // The token rests on the return between runs; a resized sheet moves the return.
  new ResizeObserver(() => {
    if (!bus.token.hidden && bus.root.dataset.result !== 'pending') placeToken(bus, nodeAt(bus, bus.end));
  }).observe(bus.frame);

  root.dataset.ready = 'true';
  const player = createPlayer(bus, host);
  const page = host.closest<HTMLElement>('article.technical-drawing-stack > * > section') ?? host;
  watchPageActive(page, (active) => player.setActive(active));
  watchDrawingNote(page, (open) => player.setNoteOpen(open));
  if (reducedMotion.matches) {
    reportAutoplayState(root, 'off');
    void runDispatch(bus);
  }
}
