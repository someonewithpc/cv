// The Install sheet's sequence diagram, drawn as SVG so every lifeline, box and arrow sits on
// one grid: four lanes, one row per step, one stroke weight for the lines and one for the gate.
// It comes in the service graph's two widths and a third for a short landscape sheet; the
// stylesheet shows the one the sheet asks for. The type is set in the drawing's own units, sized so neither
// drawing puts it under 8px on the sheet.

export type Lane = { id: string; head: string[] };

export type Step =
  | { kind: 'self'; lane: number; text: string }
  | { kind: 'message'; from: number; to: number; text: string; gate?: boolean }
  | { kind: 'end'; lane: number; text: string };

type Metrics = {
  w: number;
  /** Space above the first lane and past the last, so an end lane's boxes can spread. */
  inset: number;
  headLine: number;
  headWidth: number;
  row: number;
  font: number;
  /** One monospace character's advance, as a fraction of the font size. */
  advance: number;
};

export type Layout = 'landscape' | 'short' | 'portrait';

const METRICS: Record<Layout, Metrics> = {
  landscape: { w: 640, inset: 10, headLine: 14, headWidth: 144, row: 27, font: 10.5, advance: 0.6 },
  // A short landscape sheet has the width and little height: bigger type on tighter rows.
  short: { w: 640, inset: 10, headLine: 15, headWidth: 144, row: 22, font: 11.5, advance: 0.6 },
  portrait: { w: 340, inset: 2, headLine: 12, headWidth: 80, row: 25, font: 9.25, advance: 0.6 },
};

const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function renderSequence(lanes: Lane[], steps: Step[], layout: Layout): string {
  const m = METRICS[layout];
  const column = (m.w - 2 * m.inset) / lanes.length;
  const laneX = (lane: number) => m.inset + column * (lane + 0.5);
  const textWidth = (text: string) => text.length * m.font * m.advance;
  const boxHeight = m.font + 8;

  const heads = Math.max(...lanes.map((lane) => lane.head.length));
  const headHeight = heads * m.headLine + 8;
  const top = headHeight + 10;
  const rowY = (index: number) => top + index * m.row;
  const h = rowY(steps.length) + 4;

  const parts: string[] = [];
  const ends = new Map<number, number>();

  steps.forEach((step, index) => {
    const y = rowY(index);
    const mid = y + m.row / 2;

    if (step.kind === 'message') {
      const [x1, x2] = [laneX(step.from), laneX(step.to)];
      const lineY = mid + 4;
      const dir = Math.sign(x2 - x1);
      parts.push(`<path class="message${step.gate ? ' gate' : ''}" d="M${x1} ${lineY} H${x2 - dir * 1}" marker-end="url(#install-${step.gate ? 'gate' : 'arrow'}-${layout})" />`);
      parts.push(`<text class="label${step.gate ? ' gate' : ''}" x="${(x1 + x2) / 2}" y="${lineY - 4}">${escape(step.text)}</text>`);
      return;
    }

    const x = laneX(step.lane);
    const width = textWidth(step.text) + 12;
    // Centred on its lane, and slid inwards where the lane is near the sheet's edge.
    const left = Math.min(Math.max(x - width / 2, 1), m.w - 1 - width);
    const boxY = mid - boxHeight / 2;

    if (step.kind === 'end') {
      ends.set(step.lane, boxY + boxHeight);
      parts.push(`<rect class="step end" x="${left}" y="${boxY}" width="${width}" height="${boxHeight}" rx="${boxHeight / 2}" />`);
    } else {
      parts.push(`<rect class="step" x="${left}" y="${boxY}" width="${width}" height="${boxHeight}" rx="2" />`);
    }
    parts.push(`<text class="step" x="${left + width / 2}" y="${mid + m.font * 0.35}">${escape(step.text)}</text>`);
  });

  const lifelines = lanes.map((_, lane) => {
    const x = laneX(lane);
    const end = ends.get(lane) ?? h - 2;
    return `<path class="lifeline" d="M${x} ${headHeight} V${end}" />`;
  });

  const headBoxes = lanes.map((lane, index) => {
    const x = laneX(index);
    const texts = lane.head.map((line, row) => {
      const cls = lane.head.length > 1 && row === 0 ? 'head prefix' : 'head';
      return `<text class="${cls}" x="${x}" y="${4 + m.headLine * (row + 0.5) + m.font * 0.35}">${escape(line)}</text>`;
    });
    return `<rect class="head" x="${x - m.headWidth / 2}" y="0" width="${m.headWidth}" height="${headHeight}" rx="3" />${texts.join('')}`;
  });

  const arrow = (name: string) =>
    `<marker id="install-${name}-${layout}" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 8 4 0 8z" /></marker>`;

  return `<svg class="sequence ${layout}" viewBox="0 0 ${m.w} ${h}" preserveAspectRatio="xMidYMin meet" font-size="${m.font}" aria-hidden="true">`
    + `<defs>${arrow('arrow')}${arrow('gate')}</defs>`
    + `<g class="lifelines">${lifelines.join('')}</g>`
    + `<g class="heads">${headBoxes.join('')}</g>`
    + parts.join('')
    + '</svg>';
}
