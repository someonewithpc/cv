// Draws a compose file's depends_on graph as SVG markup. The server renders the opening state
// with it and the island redraws with it on every toggle, so there is one drawing, not two.
//
// Layout, top to bottom: web, one column per configured instance (app over its installer), and
// the shared data services along the bottom. Every edge comes out of depends_on. An app's edges
// to the data services leave by the gutters beside its column and meet the service on a bus,
// the way a schematic joins wires, so shared services read as one box however many ask for it.
//
// The drawing comes in two sizes. The landscape one is 518 wide with every name on one line.
// A portrait sheet is about 340 wide, and that drawing scaled down put the small print near
// 4.5px, so the portrait one is laid out at that width instead: narrower columns, the long
// names wrapped onto a second line, and the type a size the reader can make out at 1:1.

import type { PlaygroundConfig } from './config';
import { dependenciesOf, type ComposeFile, type Service } from './compose';

export type Layout = 'landscape' | 'portrait';

type Kind = 'web' | 'app' | 'install' | 'shared';

type Metrics = {
  w: number;
  h: number;
  column: number;
  /** A column's box, and web's wider one. */
  box: number;
  web: number;
  /** How far off a column's centre its two gutters run. */
  gutter: number;
  row: { web: number; app: number; install: number; data: number };
  /** Where each data service's bus runs. */
  lane: Record<'db' | 'redis' | 'mariadb', number>;
  /** Box heights, from the lines each kind carries in this layout. */
  height: Record<Kind, number>;
  /** Wrap an installer's name and an app's sub-label onto two lines. */
  wrap: boolean;
};

const METRICS: Record<Layout, Metrics> = {
  landscape: {
    w: 518,
    h: 292,
    column: 166,
    box: 140,
    web: 170,
    gutter: 78,
    row: { web: 8, app: 76, install: 132, data: 252 },
    lane: { db: 186, redis: 204, mariadb: 222 },
    height: { web: 30, app: 30, install: 30, shared: 30 },
    wrap: false,
  },
  portrait: {
    w: 340,
    h: 296,
    column: 110,
    box: 104,
    web: 120,
    gutter: 55,
    row: { web: 8, app: 68, install: 138, data: 258 },
    lane: { db: 199, redis: 215, mariadb: 231 },
    height: { web: 30, app: 39, install: 41, shared: 30 },
    wrap: true,
  },
};

const DATA = [
  { id: 'db', image: 'postgres:alpine' },
  { id: 'redis', image: 'redis:alpine' },
  { id: 'mariadb', image: 'mariadb:10.3' },
] as const;

/** A line of a box's text: the name, or the small print under it. */
const LINE = { label: 11, sub: 9 };

type Condition = 'service_healthy' | 'service_started' | 'service_completed_successfully' | 'listed';

const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function conditionOf(service: Service, dependency: string): Condition {
  const dependsOn = service.depends_on;
  if (Array.isArray(dependsOn)) return 'listed';
  const entry = (dependsOn as Record<string, { condition?: Condition }>)[dependency];
  return entry?.condition ?? 'listed';
}

export type GraphOptions = {
  /** Services to play in, because this redraw is the one that added them. */
  fresh?: ReadonlySet<string>;
  layout?: Layout;
};

export function renderGraph(config: PlaygroundConfig, compose: ComposeFile, { fresh = new Set(), layout = 'landscape' }: GraphOptions = {}): string {
  const m = METRICS[layout];
  const { services } = compose;
  const isFresh = (id: string) => fresh.has(id);
  const nodes: string[] = [];
  const wires: string[] = [];
  const buses: string[] = [];
  const labels: string[] = [];
  const marker = (name: string) => `fediverse-${name}-${layout}`;

  const columnX = (index: number) => (m.w - 3 * m.column) / 2 + m.column / 2 + index * m.column;
  const webX = m.w / 2;

  /** The lines in a box: its name, then the small print, each wrapped as the layout asks. */
  const linesOf = (kind: Kind, label: string, sub: string) => {
    const names = m.wrap && kind === 'install' && label.lastIndexOf('-') > 0
      ? [label.slice(0, label.lastIndexOf('-')), label.slice(label.lastIndexOf('-'))]
      : [label];
    const subs = m.wrap && kind === 'app' ? sub.split(' · ') : [sub];
    return [...names.map((text) => ({ text, kind: 'label' as const })), ...subs.map((text) => ({ text, kind: 'sub' as const }))];
  };

  const box = (
    id: string,
    kind: Kind,
    x: number,
    y: number,
    label: string,
    sub: string,
    { emitted, fresh: isNew }: { emitted: boolean; fresh: boolean },
  ) => {
    const w = kind === 'web' ? m.web : m.box;
    const classes = ['node', kind, emitted ? 'emitted' : 'ghost', isNew && emitted ? 'fresh' : ''].filter(Boolean).join(' ');
    const lines = linesOf(kind, label, emitted ? sub : 'not emitted');
    let baseline = y + 12.5;
    const text = lines.map((line) => {
      const markup = `<text class="${line.kind}" x="${x}" y="${baseline}">${escape(line.text)}</text>`;
      baseline += LINE[line.kind];
      return markup;
    });
    return `<g class="${classes}" data-service="${escape(id)}">`
      + `<rect x="${x - w / 2}" y="${y}" width="${w}" height="${m.height[kind]}" rx="3" />`
      + text.join('')
      + '</g>';
  };

  /** A line that paints a gap into whatever it crosses, then itself. `halo` trims the gap short
      of the far end, so the wire it lands on stays whole at the junction. */
  const wire = (d: string, condition: Condition, { halo, arrow }: { halo?: string; arrow?: boolean } = {}) => {
    const under = halo ? `<path class="halo" d="${halo}" />` : '';
    const head = arrow ? ` marker-end="url(#${marker(condition === 'service_completed_successfully' ? 'gate' : 'arrow')})"` : '';
    return `${under}<path class="edge ${condition}" d="${d}"${head} />`;
  };

  const instances = Object.values(config.instances);
  const appX = new Map(instances.map((instance, index) => [instance.instance_id, columnX(index)]));
  const installX = new Map(instances.map((instance, index) => [`${instance.instance_id}-install`, columnX(index)]));
  const dataSlot = new Map(DATA.map((data, index) => [data.id as string, { ...data, lane: m.lane[data.id], x: columnX(index) }]));

  // Web fans out to every app it waits on.
  const web = services.web;
  const webBottom = m.row.web + m.height.web;
  dependenciesOf(web ?? {}).forEach((dependency) => {
    const x = appX.get(dependency);
    if (x === undefined) return;
    const mid = (webBottom + m.row.app) / 2;
    wires.push(wire(`M${webX} ${webBottom} C${webX} ${mid} ${x} ${mid} ${x} ${m.row.app - 2}`, 'listed', { arrow: true }));
  });

  // Every bus, keyed by the data service it feeds: the x of each wire that drops onto it.
  const drops = new Map<string, { x: number; condition: Condition }[]>();
  const addDrop = (dependency: string, x: number, condition: Condition) => {
    drops.set(dependency, [...(drops.get(dependency) ?? []), { x, condition }]);
  };

  const appBottom = m.row.app + m.height.app;
  const installBottom = m.row.install + m.height.install;

  Object.entries(services).forEach(([name, service]) => {
    const app = appX.get(name);
    const installer = installX.get(name);
    if (app === undefined && installer === undefined) return;

    const dataDependencies = dependenciesOf(service).filter((dependency) => dataSlot.has(dependency));
    dependenciesOf(service).forEach((dependency) => {
      const condition = conditionOf(service, dependency);
      const slot = dataSlot.get(dependency);

      if (!slot) {
        // The installer gate: straight down the column.
        const x = installX.get(dependency);
        if (x === undefined) return;
        wires.push(wire(`M${x} ${appBottom} V${m.row.install - 2}`, condition, { arrow: true }));
        labels.push(`<text class="gate" x="${x + 4}" y="${(appBottom + m.row.install) / 2 + 3}">completed</text>`);
        return;
      }

      if (installer !== undefined) {
        const end = slot.lane;
        wires.push(wire(`M${installer} ${installBottom} V${end}`, condition, {
          halo: `M${installer} ${installBottom + 2} V${end - 4}`,
        }));
        addDrop(dependency, installer, condition);
        return;
      }

      // An app leaves by its left gutter for its first data service and its right for the next.
      const side = dataDependencies.indexOf(dependency) === 0 ? -1 : 1;
      const edge = app! + side * (m.box / 2);
      const gutter = app! + side * m.gutter;
      const y = m.row.app + m.height.app / 2;
      wires.push(wire(`M${edge} ${y} H${gutter - side * 3} Q${gutter} ${y} ${gutter} ${y + 3} V${slot.lane}`, condition, {
        halo: `M${gutter} ${y + 6} V${slot.lane - 4}`,
      }));
      addDrop(dependency, gutter, condition);
    });
  });

  DATA.forEach((data) => {
    const slot = dataSlot.get(data.id)!;
    const onBus = drops.get(data.id) ?? [];
    const emitted = Boolean(services[data.id]);
    if (emitted && onBus.length) {
      const xs = [...onBus.map((drop) => drop.x), slot.x];
      const condition = onBus[0].condition;
      buses.push(wire(`M${Math.min(...xs)} ${slot.lane} H${Math.max(...xs)}`, condition));
      buses.push(wire(`M${slot.x} ${slot.lane} V${m.row.data - 2}`, condition, { arrow: true }));
      onBus.forEach(({ x }) => buses.push(`<circle class="junction" cx="${x}" cy="${slot.lane}" r="2" />`));
    }
    const sub = emitted ? `${data.image} · ×1` : '';
    nodes.push(box(data.id, 'shared', slot.x, m.row.data, data.id, sub, { emitted, fresh: isFresh(data.id) }));
  });

  nodes.push(box('web', 'web', webX, m.row.web, 'web', 'nginx:alpine · 8080 8443', {
    emitted: Boolean(web),
    fresh: isFresh('web'),
  }));

  instances.forEach((instance) => {
    const id = instance.instance_id;
    const x = appX.get(id)!;
    const install = `${id}-install`;
    nodes.push(box(id, 'app', x, m.row.app, id, `${instance.software} · ${instance.hostname}`, {
      emitted: Boolean(services[id]),
      fresh: isFresh(id),
    }));
    nodes.push(box(install, 'install', x, m.row.install, install, 'one-shot · restart: no', {
      emitted: Boolean(services[install]),
      fresh: isFresh(install),
    }));
  });

  const arrow = (name: string) =>
    `<marker id="${marker(name)}" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0 8 4 0 8z" /></marker>`;

  return `<svg class="service-graph ${layout}" viewBox="0 0 ${m.w} ${m.h}" preserveAspectRatio="xMinYMid meet" role="img" aria-labelledby="fediverse-graph-title-${layout}">`
    + `<title id="fediverse-graph-title-${layout}">${escape(describe(compose))}</title>`
    + `<defs>${arrow('arrow')}${arrow('gate')}</defs>`
    + `<g class="buses">${buses.join('')}</g>`
    + `<g class="wires">${wires.join('')}</g>`
    + `<g class="gates">${labels.join('')}</g>`
    + `<g class="nodes">${nodes.join('')}</g>`
    + '</svg>';
}

/** Both drawings; the stylesheet shows the one the sheet's orientation asks for. */
export function renderGraphs(config: PlaygroundConfig, compose: ComposeFile, options: Omit<GraphOptions, 'layout'> = {}): string {
  return renderGraph(config, compose, { ...options, layout: 'landscape' }) + renderGraph(config, compose, { ...options, layout: 'portrait' });
}

/** One sentence for a screen reader: what the file holds and what waits on what. */
export function describe(compose: ComposeFile): string {
  const names = Object.keys(compose.services);
  if (!names.length) return 'No instances enabled: the compose file has no services.';
  const edges = names.flatMap((name) => dependenciesOf(compose.services[name]).map((dependency) => `${name} on ${dependency}`));
  return `${names.length} services: ${names.join(', ')}. Depends on: ${edges.join('; ')}.`;
}

/** The line under the toggles: what the builder wrote, and that it checked. */
export function summary(compose: ComposeFile): string {
  const count = Object.keys(compose.services).length;
  if (!count) return 'No instances: services is empty';
  return `${count} services · ${countReferences(compose)} depends_on, all defined`;
}

/** How many depends_on references the file holds; validateCompose has checked every one. */
export function countReferences(compose: ComposeFile): number {
  return Object.values(compose.services).reduce((total, service) => total + dependenciesOf(service).length, 0);
}
