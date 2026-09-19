/**
 * Anchors each callout of an Annotations overlay to the artwork's own box.
 *
 * The overlay's stylesheet inscribes the unit square in the largest centred square of the
 * artwork (`viewBox="-2 -2 4 4"` with `meet` on a 200% box), so on a non-square artwork the
 * long axis's ±1 falls short of the edges, and by a factor that changes with the container
 * width wherever the artwork's aspect does. Stretching the overlay to fit would stretch the
 * text and arrowheads with it, so the overlay keeps its uniform unit and each callout is
 * moved instead: a `[data-tip="x y"]` group is translated so its tip lands at
 * (x · half width, y · half height) of the artwork, while the rest of the callout keeps its
 * authored shape and size.
 *
 * The overlay itself is re-sized to that square around the artwork rather than around the
 * wrapping `.content`, which can be a line box taller than an inline artwork.
 *
 * Sizes come from the observer, which reports layout boxes untouched by the stack's splay
 * rotate. Positions are taken from the box centres, which a rotate or a centred `scale`
 * leaves in place; the artwork is not expected to be translated inside `.content`.
 */

type Overlay = {
  svg: SVGSVGElement;
  content: HTMLElement;
  artwork: Element;
  callouts: SVGGElement[];
  size: { left: number; top: number; side: number };
  anchor: { x: number; y: number };
};

const overlays = new Map<Element, Overlay>();
const boxes = new WeakMap<Element, [number, number]>();
const pending = new Set<Overlay>();
let frame = 0;

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
  return true;
}

function write(overlay: Overlay) {
  const { svg, size, anchor, callouts } = overlay;
  svg.style.left = `${size.left}px`;
  svg.style.top = `${size.top}px`;
  svg.style.width = `${size.side}px`;
  svg.style.height = `${size.side}px`;
  for (const callout of callouts) {
    const [x = 0, y = 0] = (callout.dataset.tip ?? '').trim().split(/\s+/).map(Number);
    const dx = x * (anchor.x - 1);
    const dy = y * (anchor.y - 1);
    callout.setAttribute('transform', `translate(${dx.toFixed(5)} ${dy.toFixed(5)})`);
  }
  svg.dataset.annotations = 'js';
}

function flush() {
  frame = 0;
  for (const overlay of pending) write(overlay);
  pending.clear();
}

const observer = new ResizeObserver((entries) => {
  for (const entry of entries) {
    const [box] = entry.borderBoxSize;
    boxes.set(entry.target, box ? [box.inlineSize, box.blockSize] : [entry.contentRect.width, entry.contentRect.height]);
  }
  const touched = new Set(entries.map((entry) => overlays.get(entry.target)));
  for (const overlay of touched) {
    if (overlay && read(overlay)) pending.add(overlay);
  }
  if (pending.size && !frame) frame = requestAnimationFrame(flush);
});

/** Positions every Annotations overlay under `scope` and keeps it positioned on resize. */
export function positionAnnotations(scope: ParentNode) {
  for (const svg of scope.querySelectorAll<SVGSVGElement>('svg[data-annotations]')) {
    const content = svg.parentElement;
    const artwork = content && [...content.children].find((child) => child !== svg);
    if (!content || !artwork || overlays.has(svg)) continue;

    const overlay: Overlay = {
      svg,
      content,
      artwork,
      callouts: [...svg.querySelectorAll<SVGGElement>('[data-tip]')],
      size: { left: 0, top: 0, side: 0 },
      anchor: { x: 1, y: 1 },
    };
    overlays.set(svg, overlay);
    overlays.set(content, overlay);
    overlays.set(artwork, overlay);
    observer.observe(content);
    observer.observe(artwork);
  }
}
