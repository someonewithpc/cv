import $store, { spaceGlobalOrderSelector } from '@/store';
import type { SpaceType } from '@/store';

const SPACE_TEXT_KINDS = new Set([
  'SpaceNumberMarkerDecoration',
  'UppercaseSpaceLetterMarkerDecoration',
  'LowercaseSpaceLetterMarkerDecoration',
]);

function spaceNumber(space: SpaceType, offset: number) {
  return (spaceGlobalOrderSelector($store.getState())[space.id] ?? 0) + 1 + offset;
}

function spaceLetter(space: SpaceType, offset: number, uppercase: boolean) {
  // spaceNumber is 1-based (lobby = 1); bijective base-26 expects that after n--.
  let remaining = spaceNumber(space, offset);
  const digits: number[] = [];

  while (remaining > 0) {
    remaining -= 1;
    digits.push(remaining % 26);
    remaining = Math.floor(remaining / 26);
  }

  const letter = digits
    .reverse()
    .map((digit) => String.fromCharCode('a'.charCodeAt(0) + digit))
    .join('');

  return uppercase ? letter.toUpperCase() : letter;
}

function readOffset(el: Element): number {
  const raw = el.getAttribute('data-reactive-state-space-number-offset');
  if (!raw) return 0;
  const [, value] = raw.split(':');
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function labelForKind(kind: string, space: SpaceType, offset: number): string | null {
  switch (kind) {
    case 'SpaceNumberMarkerDecoration':
      return String(spaceNumber(space, offset));
    case 'UppercaseSpaceLetterMarkerDecoration':
      return spaceLetter(space, offset, true);
    case 'LowercaseSpaceLetterMarkerDecoration':
      return spaceLetter(space, offset, false);
    default:
      return null;
  }
}

/** Recompute space-bound decoration text (number / letter) for the given space. */
export function resolveMarkerSvgForSpace(svgString: string, space: SpaceType): string {
  if (typeof DOMParser === 'undefined') return svgString;

  const doc = new DOMParser().parseFromString(svgString, 'image/svg+xml');
  if (doc.querySelector('parsererror')) return svgString;

  let changed = false;
  doc.querySelectorAll('[data-kind]').forEach((el) => {
    const kind = el.getAttribute('data-kind');
    if (!kind || !SPACE_TEXT_KINDS.has(kind)) return;

    const label = labelForKind(kind, space, readOffset(el));
    if (label == null) return;

    const textHost = el instanceof SVGTextElement
      ? el
      : el.querySelector('text');
    if (!textHost) return;

    const tspans = textHost.querySelectorAll('tspan');
    if (tspans.length > 0) {
      tspans.forEach((tspan, index) => {
        tspan.textContent = index === 0 ? label : '';
      });
    } else {
      textHost.textContent = label;
    }
    changed = true;
  });

  if (!changed) return svgString;

  const root = doc.documentElement;
  return root ? new XMLSerializer().serializeToString(root) : svgString;
}
