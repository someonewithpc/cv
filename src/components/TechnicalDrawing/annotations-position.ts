/**
 * Anchors each callout of an Annotations overlay to the artwork, or to the element it
 * names.
 *
 * The overlay's stylesheet inscribes the unit square in the largest centred square of the
 * artwork (`viewBox="-2 -2 4 4"` with `meet` on a 200% box), so on a non-square artwork the
 * long axis's ±1 falls short of the edges, and by a factor that changes with the container
 * width wherever the artwork's aspect does. Stretching the overlay to fit would stretch the
 * text and arrowheads with it, so the overlay keeps its uniform unit and each callout is
 * moved instead. A `[data-tip="x y"]` group is translated so its tip lands at
 * (x · half width, y · half height) of the artwork. A group with `data-target` is redrawn
 * from its authored angle and length so its tip lands on the `data-anchor` point of that
 * element's box, or on the midpoint of a `segment` of the target's own SVG user space,
 * mapped through the target's screen matrix; a `normal` angle is that segment's outer
 * normal. The callout is mirrored across the tip's vertical axis (a normal one keeps its
 * geometry and swaps the label's side) when the label would leave the sheet's drawing
 * cell or lie over the target or the title block and the mirror image would not.
 *
 * The overlay itself is re-sized to that square around the artwork rather than around the
 * wrapping `.content`, which can be a line box taller than an inline artwork.
 *
 * Sizes come from the observer, which reports layout boxes untouched by the stack's splay
 * rotate. Every other box is read from client rects and turned back by the page's rotation
 * (taken from the overlay's screen matrix), so a page positioned while splayed at the back
 * of the stack is right when it turns to the front. The artwork is not expected to be
 * translated inside `.content`. A target whose position comes from an animation (the cube's
 * faces) is re-read when an animation on the artwork ends or is cancelled.
 */

type Point = { x: number; y: number };
type Box = { left: number; top: number; right: number; bottom: number };

type Callout = {
  group: SVGGElement;
  path: SVGPathElement;
  text: SVGTextElement;
  spans: SVGTSpanElement[];
  angle: number;
  normal: boolean;
  length: number;
  gap: number;
  side?: 1 | -1;
  offset: Point;
  target: Element[];
  anchor: Point;
  segment?: [number, number, number, number];
  /** Filled by read(): the drawing, in overlay units. */
  tip: Point;
  end: Point;
  sign: 1 | -1;
  underline: number;
  mirrored: boolean;
};

type Overlay = {
  svg: SVGSVGElement;
  content: HTMLElement;
  artwork: Element;
  callouts: SVGGElement[];
  targeted: Callout[];
  size: { left: number; top: number; side: number };
  anchor: Point;
};

const overlays = new Map<Element, Overlay>();
const boxes = new WeakMap<Element, [number, number]>();
const pending = new Set<Overlay>();
let frame = 0;

const numbers = (value: string | undefined) => (value ?? '').trim().split(/\s+/).map(Number);

/** The page's rotation and the overlay's scale, from its screen matrix. */
function frameOf(svg: SVGSVGElement) {
  const ctm = svg.getScreenCTM();
  const angle = ctm ? Math.atan2(ctm.b, ctm.a) : 0;
  return { cos: Math.cos(angle), sin: Math.sin(angle) };
}

/**
 * A client rect, as a box in overlay units around `centre`. The rect of a rotated box is
 * its axis-aligned bounds, so its size is solved back from the rotation and its centre,
 * which the rotation keeps, is turned back.
 */
function toOverlay(rect: DOMRect, centre: Point, unit: number, rot: { cos: number; sin: number }): Box {
  const { cos, sin } = rot;
  const c = Math.abs(cos);
  const s = Math.abs(sin);
  const det = c * c - s * s || 1;
  const width = Math.max(0, (rect.width * c - rect.height * s) / det) / unit;
  const height = Math.max(0, (rect.height * c - rect.width * s) / det) / unit;
  const dx = rect.left + rect.width / 2 - centre.x;
  const dy = rect.top + rect.height / 2 - centre.y;
  const x = (dx * cos + dy * sin) / unit;
  const y = (-dx * sin + dy * cos) / unit;
  return { left: x - width / 2, top: y - height / 2, right: x + width / 2, bottom: y + height / 2 };
}

/** A client point, in overlay units around `centre`, turned back by the page's rotation. */
function toOverlayPoint(point: Point, centre: Point, unit: number, rot: { cos: number; sin: number }): Point {
  const dx = point.x - centre.x;
  const dy = point.y - centre.y;
  return { x: (dx * rot.cos + dy * rot.sin) / unit, y: (-dx * rot.sin + dy * rot.cos) / unit };
}

/** A segment of the target's user space as overlay points, or nothing without a matrix. */
function segmentOf(callout: Callout, centre: Point, unit: number, rot: { cos: number; sin: number }): [Point, Point] | undefined {
  const [target] = callout.target;
  const ctm = callout.segment && target instanceof SVGGraphicsElement ? target.getScreenCTM() : null;
  if (!ctm || !callout.segment) return;
  const [x1, y1, x2, y2] = callout.segment;
  const map = (x: number, y: number) => toOverlayPoint(new DOMPoint(x, y).matrixTransform(ctm), centre, unit, rot);
  return [map(x1, y1), map(x2, y2)];
}

function union(rects: DOMRect[]): DOMRect {
  const left = Math.min(...rects.map((r) => r.left));
  const top = Math.min(...rects.map((r) => r.top));
  const right = Math.max(...rects.map((r) => r.right));
  const bottom = Math.max(...rects.map((r) => r.bottom));
  return new DOMRect(left, top, right - left, bottom - top);
}

const intersects = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
const within = (a: Box, b: Box) => a.left >= b.left && a.right <= b.right && a.top >= b.top && a.bottom <= b.bottom;

/** Whether the segment p–q passes through the box, by clipping its parameter to each slab. */
function crosses(p: Point, q: Point, box: Box) {
  let t0 = 0;
  let t1 = 1;
  for (const [d, lo, hi] of [
    [q.x - p.x, box.left - p.x, box.right - p.x],
    [q.y - p.y, box.top - p.y, box.bottom - p.y],
  ]) {
    if (Math.abs(d) < 1e-9) {
      if (lo > 0 || hi < 0) return false;
      continue;
    }
    const [a, b] = d > 0 ? [lo / d, hi / d] : [hi / d, lo / d];
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, b);
    if (t0 > t1) return false;
  }
  return true;
}

/** The label's box for a callout ending at `end` on `sign`'s side, text metrics from `text`. */
function labelBox(callout: Callout, end: Point, sign: 1 | -1, metrics: { width: number; ascent: number; descent: number }): Box {
  const start = end.x + sign * callout.offset.x;
  const baseline = end.y + callout.offset.y;
  return {
    left: Math.min(start, start + sign * metrics.width),
    right: Math.max(start, start + sign * metrics.width),
    top: baseline - metrics.ascent,
    bottom: baseline + metrics.descent,
  };
}

function readCallout(callout: Callout, centre: Point, unit: number, rot: { cos: number; sin: number }, cell: Box, sheet: Box, avoid: Box[]) {
  const targetBox = toOverlay(union(callout.target.map((el) => el.getBoundingClientRect())), centre, unit, rot);
  const bbox = callout.text.getBBox();
  const width = bbox.width;
  const authoredY = Number(callout.text.getAttribute('y')) || 0;
  const metrics = { width, ascent: authoredY - bbox.y, descent: bbox.y + bbox.height - authoredY };
  const segment = segmentOf(callout, centre, unit, rot);
  const fixed = Boolean(segment && callout.normal);
  let rad = (callout.angle * Math.PI) / 180;
  if (segment && fixed) {
    // The outer normal of a segment traced clockwise on screen, as a y-up angle.
    rad = Math.atan2(segment[1].x - segment[0].x, segment[1].y - segment[0].y);
  }
  const defaultSign: 1 | -1 = Math.cos(rad) < 0 && Math.sin(rad) < 0 ? -1 : 1;
  const short = Math.min(targetBox.right - targetBox.left, targetBox.bottom - targetBox.top);
  const clear = (label: Box) => [targetBox, ...avoid].every((box) => !intersects(label, box));

  const place = (mirror: boolean) => {
    const flip = mirror && !fixed ? -1 : 1;
    const fx = flip < 0 ? 1 - callout.anchor.x : callout.anchor.x;
    const anchor = segment
      ? { x: (segment[0].x + segment[1].x) / 2, y: (segment[0].y + segment[1].y) / 2 }
      : {
          x: targetBox.left + fx * (targetBox.right - targetBox.left),
          y: targetBox.top + callout.anchor.y * (targetBox.bottom - targetBox.top),
        };
    const cos = flip * Math.cos(rad);
    const sin = Math.sin(rad);
    const tip = { x: anchor.x + callout.gap * short * cos, y: anchor.y - callout.gap * short * sin };
    const end = { x: tip.x + callout.length * cos, y: tip.y - callout.length * sin };
    const sign = ((mirror ? -1 : 1) * (callout.side ?? defaultSign)) as 1 | -1;
    const label = labelBox(callout, end, sign, metrics);
    // The shaft may touch the label's corner; only a run through the glyphs counts.
    const inset = 0.01;
    const glyphs = { left: label.left + inset, top: label.top + inset, right: label.right - inset, bottom: label.bottom - inset };
    const fits =
      label.left >= cell.left && label.right <= cell.right && within(label, sheet) && clear(label) && !crosses(tip, end, glyphs);
    return { tip, end, sign, fits, mirror };
  };

  let placement = place(false);
  if (!placement.fits) {
    const mirrored = place(true);
    if (mirrored.fits) placement = mirrored;
  }
  callout.tip = placement.tip;
  callout.end = placement.end;
  callout.sign = placement.sign;
  callout.underline = width;
  callout.mirrored = placement.mirror;
}

function read(overlay: Overlay): boolean {
  const artwork = boxes.get(overlay.artwork);
  const content = boxes.get(overlay.content);
  if (!artwork || !content) return false;
  const [aw, ah] = artwork;
  const [cw, ch] = content;
  const unit = Math.min(aw, ah) / 2;
  if (unit <= 0) return false;

  const a = overlay.artwork.getBoundingClientRect();
  const c = overlay.content.getBoundingClientRect();
  const cx = cw / 2 + a.left + a.width / 2 - (c.left + c.width / 2);
  const cy = ch / 2 + a.top + a.height / 2 - (c.top + c.height / 2);

  overlay.size = { left: cx - 2 * unit, top: cy - 2 * unit, side: 4 * unit };
  overlay.anchor = { x: aw / (2 * unit), y: ah / (2 * unit) };

  if (overlay.targeted.length) {
    const rot = frameOf(overlay.svg);
    const centre = { x: a.left + a.width / 2, y: a.top + a.height / 2 };
    const section = overlay.svg.closest('section');
    const cellEl = section?.querySelector(':scope > .content') ?? section;
    const everywhere: Box = { left: -Infinity, top: -Infinity, right: Infinity, bottom: Infinity };
    const sheet = section ? toOverlay(section.getBoundingClientRect(), centre, unit, rot) : everywhere;
    const cell = cellEl ? toOverlay(cellEl.getBoundingClientRect(), centre, unit, rot) : sheet;
    const titleBlock = section?.querySelector(':scope > table');
    const avoid = titleBlock ? [toOverlay(titleBlock.getBoundingClientRect(), centre, unit, rot)] : [];
    for (const callout of overlay.targeted) {
      if (!callout.group.getClientRects().length) continue;
      readCallout(callout, centre, unit, rot, cell, sheet, avoid);
    }
  }
  return true;
}

function write(overlay: Overlay) {
  const { svg, size, anchor, callouts, targeted } = overlay;
  svg.style.left = `${size.left}px`;
  svg.style.top = `${size.top}px`;
  svg.style.width = `${size.side}px`;
  svg.style.height = `${size.side}px`;
  const drawn = new Set(targeted.map((callout) => callout.group));
  for (const callout of callouts) {
    if (drawn.has(callout)) continue;
    const [x = 0, y = 0] = numbers(callout.dataset.tip);
    const dx = x * (anchor.x - 1);
    const dy = y * (anchor.y - 1);
    callout.setAttribute('transform', `translate(${dx.toFixed(5)} ${dy.toFixed(5)})`);
  }
  for (const callout of targeted) {
    if (!callout.underline) continue;
    const { tip, end, sign, underline, mirrored } = callout;
    const f = (n: number) => n.toFixed(5);
    callout.group.removeAttribute('transform');
    callout.path.setAttribute('d', `M ${f(tip.x)} ${f(tip.y)} l ${f(end.x - tip.x)} ${f(end.y - tip.y)} l ${f(sign * underline)} 0`);
    const x = f(end.x + sign * callout.offset.x);
    callout.text.setAttribute('x', x);
    callout.text.setAttribute('y', f(end.y + callout.offset.y));
    for (const span of callout.spans) span.setAttribute('x', x);
    if (sign < 0) callout.text.setAttribute('text-anchor', 'end');
    else callout.text.removeAttribute('text-anchor');
    // Read by e2e/annotations-position.spec.ts, which otherwise assumes the authored
    // anchor side; the label falls back to the mirrored side when the authored one
    // would leave the cell or lie over the target or the title block.
    if (mirrored) callout.group.dataset.mirrored = 'true';
    else delete callout.group.dataset.mirrored;
  }
  svg.dataset.annotations = 'js';
}

function flush() {
  frame = 0;
  for (const overlay of pending) write(overlay);
  pending.clear();
}

function schedule(overlay: Overlay) {
  if (read(overlay)) pending.add(overlay);
  if (pending.size && !frame) frame = requestAnimationFrame(flush);
}

const observer = new ResizeObserver((entries) => {
  for (const entry of entries) {
    const [box] = entry.borderBoxSize;
    boxes.set(entry.target, box ? [box.inlineSize, box.blockSize] : [entry.contentRect.width, entry.contentRect.height]);
  }
  const touched = new Set(entries.map((entry) => overlays.get(entry.target)));
  for (const overlay of touched) {
    if (overlay) schedule(overlay);
  }
});

function calloutOf(group: SVGGElement, artwork: Element): Callout | undefined {
  const path = group.querySelector('path');
  const text = group.querySelector('text');
  const selector = group.dataset.target;
  if (!path || !text || !selector) return;
  const target = artwork.matches(selector) ? [artwork] : [...artwork.querySelectorAll(selector)];
  if (!target.length) return;
  const anchor = group.dataset.anchor ?? '';
  const segment = anchor.startsWith('segment') ? numbers(anchor.slice('segment'.length)) : undefined;
  const [ax = 0.5, ay = 0.5] = segment ? [] : numbers(anchor);
  const [ox = 0, oy = 0] = numbers(group.dataset.labelOffset);
  const side = group.dataset.side === 'left' ? -1 : group.dataset.side === 'right' ? 1 : undefined;
  const normal = group.dataset.angle === 'normal';
  if (segment?.length !== 4 && (segment || normal)) return;
  return {
    group,
    path,
    text,
    spans: [...text.querySelectorAll<SVGTSpanElement>('tspan[x]')],
    angle: normal ? 0 : Number(group.dataset.angle) || 0,
    normal,
    length: Number(group.dataset.length) || 0,
    gap: Number(group.dataset.gap) || 0,
    side,
    offset: { x: ox, y: oy },
    target,
    anchor: { x: ax, y: ay },
    segment: segment as [number, number, number, number] | undefined,
    tip: { x: 0, y: 0 },
    end: { x: 0, y: 0 },
    sign: 1,
    underline: 0,
    mirrored: false,
  };
}

/** Positions every Annotations overlay under `scope` and keeps it positioned on resize. */
export function positionAnnotations(scope: ParentNode) {
  for (const svg of scope.querySelectorAll<SVGSVGElement>('svg[data-annotations]')) {
    const content = svg.parentElement;
    const artwork = content && [...content.children].find((child) => child !== svg);
    if (!content || !artwork || overlays.has(svg)) continue;

    const callouts = [...svg.querySelectorAll<SVGGElement>('[data-tip]')];
    const overlay: Overlay = {
      svg,
      content,
      artwork,
      callouts,
      targeted: callouts.map((group) => calloutOf(group, artwork)).filter((callout): callout is Callout => Boolean(callout)),
      size: { left: 0, top: 0, side: 0 },
      anchor: { x: 1, y: 1 },
    };
    overlays.set(svg, overlay);
    overlays.set(content, overlay);
    overlays.set(artwork, overlay);
    observer.observe(content);
    observer.observe(artwork);
    if (overlay.targeted.length) {
      // Stack.astro cancels and restarts a page's animations as it turns; both events
      // arrive once the animation has settled where the faces will be read.
      for (const event of ['animationend', 'animationcancel']) {
        artwork.addEventListener(event, () => schedule(overlay));
      }
    }
  }
}
