/**
 * Colour arithmetic for the demo's build-time tones: an oklch literal parsed, mixed the way
 * `color-mix(in oklch)` mixes, and measured for WCAG contrast, so a tone can be set to a
 * chosen ratio against the ground it paints on in every theme.
 */
export type Oklch = [number, number, number];

export const parseOklch = (css: string): Oklch => {
  const m = css.match(/oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)/);
  if (!m) throw new Error(`parseOklch: not a plain oklch() literal: ${css}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
};

export const oklchCss = ([l, c, h]: Oklch) => `oklch(${l.toFixed(4)} ${c.toFixed(4)} ${h.toFixed(2)})`;

const oklchToLinearSrgb = (l: number, c: number, hDeg: number): [number, number, number] => {
  const h = (hDeg * Math.PI) / 180;
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.2914855480 * b;
  const [ll, mm, ss] = [l_ ** 3, m_ ** 3, s_ ** 3];
  return [
    +4.0767416621 * ll - 3.3077115913 * mm + 0.2309699292 * ss,
    -1.2684380046 * ll + 2.6097574011 * mm - 0.3413193965 * ss,
    -0.0041960863 * ll - 0.7034186147 * mm + 1.7076147010 * ss,
  ];
};

const relativeLuminance = ([l, c, h]: Oklch) => {
  const clamp = (x: number) => Math.min(Math.max(x, 0), 1);
  const [r, g, b] = oklchToLinearSrgb(l, c, h).map(clamp);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

export const contrastRatio = (a: Oklch, b: Oklch) => {
  const [lum1, lum2] = [relativeLuminance(a), relativeLuminance(b)];
  const [lighter, darker] = lum1 > lum2 ? [lum1, lum2] : [lum2, lum1];
  return (lighter + 0.05) / (darker + 0.05);
};

const hueLerp = (h1: number, h2: number, t: number) => {
  const d = ((h2 - h1 + 540) % 360) - 180;
  return (h1 + d * t + 360) % 360;
};

export const mixOklch = (from: Oklch, to: Oklch, t: number): Oklch => [
  from[0] + (to[0] - from[0]) * t,
  from[1] + (to[1] - from[1]) * t,
  hueLerp(from[2], to[2], t),
];

/** `color-mix(in oklch, white <share>, colour)`: white has no hue, so the colour's stays. */
export const mixWhite = (colour: Oklch, share: number): Oklch => mixOklch(colour, [1, 0, colour[2]], share);

/** The mix of `from` toward `to` that lands on `ratio` against `ground`. */
const mixUntil = (from: Oklch, to: Oklch, ground: Oklch, ratio: number): Oklch => {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 40; i += 1) {
    const mid = (lo + hi) / 2;
    if (contrastRatio(ground, mixOklch(from, to, mid)) < ratio) lo = mid; else hi = mid;
  }
  return mixOklch(from, to, hi);
};

/** The mix of `ground` toward `ink` that lands on `ratio` against the ground. */
export const toneAt = (ground: Oklch, ink: Oklch, ratio: number): Oklch => mixUntil(ground, ink, ground, ratio);

/** `colour` as it is when it clears `ratio` against `ground`, else moved toward `ink` until it does. */
export const liftedTo = (colour: Oklch, ink: Oklch, ground: Oklch, ratio: number): Oklch => (
  contrastRatio(ground, colour) >= ratio ? colour : mixUntil(colour, ink, ground, ratio)
);
