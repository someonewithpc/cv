// Draws a compose file's depends_on graph as SVG markup. The server renders the opening state
// with it and the island redraws with it on every toggle, so there is one drawing, not two.
//
// Layout, top to bottom: nginx, one column per configured instance (app over its installer), and
// the shared data services along the bottom. Every edge comes out of depends_on. An app's edges
// to the data services leave by the gutters beside its column and meet the service on a bus,
// the way a schematic joins wires, so shared services read as one box however many ask for it.
// Mastodon runs three processes where GNU social runs one: its box keeps the server's name and
// says how many, and their edges are the app's own.
//
// The drawing comes in two widths, with the same rows. Every box puts its small print one part
// a line and splits its names at the hyphen, so the type can stay at 8px or more on the sheet.
// The landscape one fills the column beside the config panel on a wide sheet. The portrait one
// is laid out near a phone's sheet width, so scaling it barely shrinks the type.

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
};

const ROWS = {
  row: { web: 4, app: 62, install: 144, data: 248 },
  lane: { db: 203, redis: 217, mariadb: 231 },
};

const METRICS: Record<Layout, Metrics> = {
  landscape: { w: 528, h: 290, column: 128, box: 118, web: 140, gutter: 62, ...ROWS },
  portrait: { w: 400, h: 290, column: 98, box: 92, web: 120, gutter: 47.5, ...ROWS },
};

/** The services a recipe runs beside its app; the app's box counts them. */
const COMPANIONS: Record<string, readonly string[]> = {
  mastodon: ['streaming', 'sidekiq'],
};

const DATA = [
  { id: 'db', image: 'postgres:alpine' },
  { id: 'redis', image: 'redis:alpine' },
  { id: 'mariadb', image: 'mariadb:10.3' },
] as const;

/** A line of a box's text: the name, or the small print under it. */
const LINE = { label: 11, sub: 10.5 };

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

  const instances = Object.values(config.instances);
  const columnX = (index: number) => (m.w - instances.length * m.column) / 2 + m.column / 2 + index * m.column;
  const webX = m.w / 2;

  /** The lines in a box: its names, an installer's split at its last hyphen, then the small print, one part a line. */
  const linesOf = (kind: Kind, names: string[], sub: string) => {
    const split = kind === 'install' && names[0].lastIndexOf('-') > 0
      ? [names[0].slice(0, names[0].lastIndexOf('-')), names[0].slice(names[0].lastIndexOf('-'))]
      : names;
    const subs = sub.split(' · ');
    return [...split.map((text) => ({ text, kind: 'label' as const })), ...subs.map((text) => ({ text, kind: 'sub' as const }))];
  };

  /** A box's height from the lines it carries when emitted, so a ghost keeps its size. */
  const heightOf = (lines: { kind: keyof typeof LINE }[]) => lines.reduce((total, line) => total + LINE[line.kind], 8);

  const box = (
    id: string,
    kind: Kind,
    x: number,
    y: number,
    label: string | string[],
    sub: string,
    { emitted, fresh: isNew, also = [] }: { emitted: boolean; fresh: boolean; also?: string[] },
  ) => {
    const w = kind === 'web' ? m.web : m.box;
    const names = Array.isArray(label) ? label : [label];
    const classes = ['node', kind, emitted ? 'emitted' : 'ghost', isNew && emitted ? 'fresh' : ''].filter(Boolean).join(' ');
    const height = heightOf(linesOf(kind, names, sub));
    const lines = linesOf(kind, names, emitted ? sub : 'not emitted');
    let baseline = y + 12.5;
    const text = lines.map((line) => {
      const markup = `<text class="${line.kind}" x="${x}" y="${baseline}">${escape(line.text)}</text>`;
      baseline += LINE[line.kind];
      return markup;
    });
    const companions = also.length ? ` data-also="${escape(also.join(' '))}"` : '';
    return `<g class="${classes}" data-service="${escape(id)}"${companions}>`
      + `<rect x="${x - w / 2}" y="${y}" width="${w}" height="${height}" rx="3" />`
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

  const appX = new Map(instances.map((instance, index) => [instance.instance_id, columnX(index)]));
  const installX = new Map(instances.map((instance, index) => [`${instance.instance_id}-install`, columnX(index)]));
  // The data services sit centred under the columns, one column apart.
  const dataSlot = new Map(DATA.map((data, index) => [data.id as string, { ...data, lane: m.lane[data.id], x: webX + (index - 1) * m.column }]));

  /** Each instance's services beside its app, and the height of its app's box. */
  const companionsOf = (instance: (typeof instances)[number]) =>
    (COMPANIONS[instance.software] ?? []).map((suffix) => `${instance.instance_id}-${suffix}`);
  const appSub = (instance: (typeof instances)[number]) => {
    const companions = companionsOf(instance).length;
    return [instance.software, instance.hostname, ...(companions ? [`${companions + 1} processes`] : [])].join(' · ');
  };
  const appNames = (instance: (typeof instances)[number]) => [instance.instance_id];
  const appHeight = new Map(instances.map((instance) => [instance.instance_id, heightOf(linesOf('app', appNames(instance), appSub(instance)))]));
  const webHeight = heightOf(linesOf('web', ['nginx'], 'nginx:alpine · 8080 8443'));
  const installHeight = heightOf(linesOf('install', ['x-install'], 'one-shot · restart: no'));

  // nginx fans out to every app it waits on.
  const web = services.nginx;
  const webBottom = m.row.web + webHeight;
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

  const installBottom = m.row.install + installHeight;

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
        if (x === undefined || app === undefined) return;
        const appBottom = m.row.app + appHeight.get(name)!;
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
      // Half way down a one-name app box, the same height on every column.
      const y = m.row.app + 20;
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

  nodes.push(box('nginx', 'web', webX, m.row.web, 'nginx', 'nginx:alpine · 8080 8443', {
    emitted: Boolean(web),
    fresh: isFresh('nginx'),
  }));

  instances.forEach((instance) => {
    const id = instance.instance_id;
    const x = appX.get(id)!;
    const install = `${id}-install`;
    nodes.push(box(id, 'app', x, m.row.app, appNames(instance), appSub(instance), {
      emitted: Boolean(services[id]),
      fresh: isFresh(id),
      also: companionsOf(instance),
    }));
    nodes.push(box(install, 'install', x, m.row.install, install, 'one-shot · restart: no', {
      emitted: Boolean(services[install]),
      fresh: isFresh(install),
    }));
  });

  const arrow = (name: string) =>
    `<marker id="${marker(name)}" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0 8 4 0 8z" /></marker>`;

  return `<svg class="service-graph ${layout}" viewBox="0 0 ${m.w} ${m.h}" preserveAspectRatio="xMidYMid meet" role="img" aria-labelledby="fediverse-graph-title-${layout}">`
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
