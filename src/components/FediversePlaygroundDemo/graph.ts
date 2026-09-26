// Draws a compose file's depends_on graph as SVG markup. The server renders the opening state
// with it and the island redraws with it on every toggle, so there is one drawing, not two.
//
// Layout, top to bottom: nginx, one column per configured instance (app over its installer),
// and the shared services along the bottom. Every edge comes out of depends_on. nginx fans out
// to the apps it waits on, and each app waits on its installer. Under each column, one line
// runs to each shared service any of that server's containers waits on, so every line has
// one server at the top and one service at the bottom, and nothing joins on the way. A server's
// lines leave its column side by side and land on each service in column order, so two lines
// from one server never cross, and where two servers' lines do, the later one cuts a gap in
// the earlier. Mastodon runs three containers where GNU social runs one; its box is one server
// and says how many.
//
// The drawing comes in two widths, with the same rows. Every box puts its small print one part
// a line and splits its names at the hyphen, so the type can stay at 8px or more on the sheet.
// The landscape one fills the column beside the config panel on a wide sheet and sets the five
// shared services in one row. The portrait one is laid out near a phone's sheet width, so
// scaling it barely shrinks the type, and sets them three over two, the lower two in the gaps
// of the upper row, so their lines drop between boxes and never through one.

import type { PlaygroundConfig } from './config';
import { dependenciesOf, type ComposeFile, type Service } from './compose';

export type Layout = 'landscape' | 'portrait';

type Kind = 'web' | 'app' | 'install' | 'shared';

type SharedId = 'db' | 'redis' | 'media' | 'mariadb' | 'search';

type Metrics = {
  w: number;
  column: number;
  /** A column's box, nginx's wider one, and a shared service's. */
  box: number;
  web: number;
  shared: number;
  /** The shared services by row, left to right. A lower row sits in the gaps of the first. */
  sharedRows: SharedId[][];
  /** Where the first row of shared services starts: high enough to keep the type up, since
      the sheet scales a taller drawing down, and low enough for the lines to part. */
  data: number;
};

const ROW = { web: 4, app: 62, install: 132 };
/** Between the first row of shared services and the second. */
const ROW_GAP = 8;
/** How far apart the lines sit where they leave a column or land on a service. */
const SPREAD = 10;

const METRICS: Record<Layout, Metrics> = {
  landscape: { w: 528, column: 128, box: 118, web: 140, shared: 96, sharedRows: [['db', 'redis', 'media', 'mariadb', 'search']], data: 244 },
  portrait: { w: 400, column: 98, box: 92, web: 120, shared: 92, sharedRows: [['db', 'redis', 'media'], ['mariadb', 'search']], data: 236 },
};

/** The services a recipe runs beside its app; the app's box counts them. */
const COMPANIONS: Record<string, readonly string[]> = {
  mastodon: ['streaming', 'sidekiq'],
};

const IMAGES: Record<SharedId, string> = {
  db: 'postgres:alpine',
  redis: 'redis:alpine',
  media: 'darthsim/imgproxy',
  mariadb: 'mariadb:10.3',
  search: 'elasticsearch:7.17.4',
};

/** A line of a box's text: the name, or the small print under it. */
const LINE = { label: 11, sub: 10.5 };

/** The most characters of small print a shared box takes on one line. */
const SHARED_LINE = 15;

/** The word beside an install wire, and how far it sits from the wire on the side that has
    room. Monospace glyphs at .gate's size run under 6 units wide, so this clears the word with
    margin to spare; the rightmost column in the portrait drawing is the one that needs it. */
const GATE_LABEL = 'completed';
const GATE_GAP = 4;
const GATE_CLEARANCE = 60;

type Condition = 'service_healthy' | 'service_started' | 'service_completed_successfully' | 'listed';

const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function conditionOf(service: Service, dependency: string): Condition {
  const dependsOn = service.depends_on;
  if (Array.isArray(dependsOn)) return 'listed';
  const entry = (dependsOn as Record<string, { condition?: Condition }>)[dependency];
  return entry?.condition ?? 'listed';
}

/** An image too long for a shared box breaks before its tag, or after its namespace. */
function imageLines(image: string): string[] {
  if (image.length <= SHARED_LINE) return [image];
  const tag = image.lastIndexOf(':');
  if (tag > 0) return [image.slice(0, tag), image.slice(tag)];
  const slash = image.lastIndexOf('/');
  return slash > 0 ? [image.slice(0, slash + 1), image.slice(slash + 1)] : [image];
}

const SHARED_HEIGHT = 8 + LINE.label + 2 * LINE.sub;

/** Each server and the shared services its containers wait on, with the app's condition first. */
function uses(config: PlaygroundConfig, compose: ComposeFile, shared: ReadonlySet<string>) {
  return Object.values(config.instances).map((instance) => {
    const id = instance.instance_id;
    const own = [id, `${id}-install`, ...(COMPANIONS[instance.software] ?? []).map((suffix) => `${id}-${suffix}`)]
      .filter((name) => compose.services[name]);
    const found = new Map<string, Condition>();
    own.forEach((name) => {
      dependenciesOf(compose.services[name]).filter((dependency) => shared.has(dependency)).forEach((dependency) => {
        if (!found.has(dependency)) found.set(dependency, conditionOf(compose.services[name], dependency));
      });
    });
    return { id, services: found };
  });
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
  const links: string[] = [];
  const labels: string[] = [];
  const marker = (name: string) => `fediverse-${name}-${layout}`;

  const instances = Object.values(config.instances);
  const columnX = (index: number) => (m.w - instances.length * m.column) / 2 + m.column / 2 + index * m.column;
  const webX = m.w / 2;

  /** The lines in a box: its name, an installer's split at its last hyphen, then the small print, one part a line. */
  const linesOf = (kind: Kind, name: string, subs: string[]) => {
    const cut = name.lastIndexOf('-');
    const names = kind === 'install' && cut > 0 ? [name.slice(0, cut), name.slice(cut)] : [name];
    return [...names.map((text) => ({ text, kind: 'label' as const })), ...subs.map((text) => ({ text, kind: 'sub' as const }))];
  };

  /** A box's height from the lines it carries when emitted, so a ghost keeps its size. */
  const heightOf = (lines: { kind: keyof typeof LINE }[]) => lines.reduce((total, line) => total + LINE[line.kind], 8);

  const box = (
    id: string,
    kind: Kind,
    x: number,
    y: number,
    subs: string[],
    { emitted, fresh: isNew, also = [], height: fixed }: { emitted: boolean; fresh: boolean; also?: string[]; height?: number },
  ) => {
    const w = { web: m.web, shared: m.shared, app: m.box, install: m.box }[kind];
    const classes = ['node', kind, emitted ? 'emitted' : 'ghost', isNew && emitted ? 'fresh' : ''].filter(Boolean).join(' ');
    const height = fixed ?? heightOf(linesOf(kind, id, subs));
    const lines = linesOf(kind, id, emitted ? subs : ['not emitted']);
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

  const wire = (d: string, condition: Condition) => {
    const head = marker(condition === 'service_completed_successfully' ? 'gate' : 'arrow');
    return `<path class="edge ${condition}" d="${d}" marker-end="url(#${head})" />`;
  };

  const appX = new Map(instances.map((instance, index) => [instance.instance_id, columnX(index)]));

  const companionsOf = (instance: (typeof instances)[number]) =>
    (COMPANIONS[instance.software] ?? []).map((suffix) => `${instance.instance_id}-${suffix}`);
  const appSubs = (instance: (typeof instances)[number]) => {
    const companions = companionsOf(instance).length;
    return [instance.software, instance.hostname, ...(companions ? [`${companions + 1} processes`] : [])];
  };
  const appHeight = new Map(instances.map((instance) => [instance.instance_id, heightOf(linesOf('app', instance.instance_id, appSubs(instance)))]));
  const webSubs = ['nginx:alpine', '8080 8443'];
  const webHeight = heightOf(linesOf('web', 'nginx', webSubs));
  const installSubs = ['one-shot', 'restart: no'];
  const installBottom = ROW.install + heightOf(linesOf('install', 'x-install', installSubs));

  // The shared services: the first row spread evenly, a lower row centred in the first's gaps.
  const [first, ...lower] = m.sharedRows;
  const gap = (m.w - first.length * m.shared) / (first.length + 1);
  const firstX = first.map((_, index) => gap + m.shared / 2 + index * (m.shared + gap));
  const slots = new Map<string, { x: number; y: number; row: number }>();
  first.forEach((id, index) => slots.set(id, { x: firstX[index], y: m.data, row: 0 }));
  lower.forEach((row, rowIndex) => row.forEach((id, index) => slots.set(id, {
    x: (firstX[index] + firstX[index + 1]) / 2,
    y: m.data + (rowIndex + 1) * (SHARED_HEIGHT + ROW_GAP),
    row: rowIndex + 1,
  })));
  const height = m.data + m.sharedRows.length * SHARED_HEIGHT + (m.sharedRows.length - 1) * ROW_GAP + 4;

  // nginx fans out to every app it waits on.
  const web = services.nginx;
  const webBottom = ROW.web + webHeight;
  dependenciesOf(web ?? {}).forEach((dependency) => {
    const x = appX.get(dependency);
    if (x === undefined) return;
    const mid = (webBottom + ROW.app) / 2;
    wires.push(wire(`M${webX} ${webBottom} C${webX} ${mid} ${x} ${mid} ${x} ${ROW.app - 2}`, 'listed'));
  });

  // Each app waits on its installer: straight down the column.
  instances.forEach((instance) => {
    const id = instance.instance_id;
    const app = services[id];
    const installer = `${id}-install`;
    if (!app || !dependenciesOf(app).includes(installer)) return;
    const x = appX.get(id)!;
    const appBottom = ROW.app + appHeight.get(id)!;
    wires.push(wire(`M${x} ${appBottom} V${ROW.install - 2}`, conditionOf(app, installer)));
    // To the wire's right, unless that would run it past the sheet's edge, when it goes left.
    const fitsRight = x + GATE_GAP + GATE_CLEARANCE <= m.w;
    const gateX = fitsRight ? x + GATE_GAP : x - GATE_GAP;
    const anchor = fitsRight ? '' : ' text-anchor="end"';
    labels.push(`<text class="gate"${anchor} x="${gateX}" y="${(appBottom + ROW.install) / 2 + 3}">${GATE_LABEL}</text>`);
  });

  // One line from each server to each shared service it uses. Where a server's lines leave its
  // column and where a service's lines land are both spread in the order of the other end.
  const emittedShared = new Set([...slots.keys()].filter((id) => services[id]));
  const pairs = uses(config, compose, emittedShared).flatMap(({ id, services: used }) =>
    [...used].map(([shared, condition]) => ({ from: id, to: shared, condition })));
  const spread = (count: number, index: number) => (index - (count - 1) / 2) * SPREAD;
  const starts = new Map<string, number>();
  const ends = new Map<string, number>();
  const byTarget = (a: { to: string }, b: { to: string }) => slots.get(a.to)!.x - slots.get(b.to)!.x;
  const byColumn = (a: { from: string }, b: { from: string }) => appX.get(a.from)! - appX.get(b.from)!;
  instances.forEach(({ instance_id: id }) => {
    const own = pairs.filter((pair) => pair.from === id).sort(byTarget);
    own.forEach((pair, index) => starts.set(`${pair.from} ${pair.to}`, appX.get(id)! + spread(own.length, index)));
  });
  emittedShared.forEach((shared) => {
    const into = pairs.filter((pair) => pair.to === shared).sort(byColumn);
    into.forEach((pair, index) => ends.set(`${pair.from} ${pair.to}`, slots.get(shared)!.x + spread(into.length, index)));
  });

  const bend = (m.data + installBottom) / 2;
  pairs.sort(byColumn).forEach(({ from, to, condition }) => {
    const key = `${from} ${to}`;
    const sx = starts.get(key)!;
    const ex = ends.get(key)!;
    const slot = slots.get(to)!;
    // Above the first row the curve only descends, so it meets that row at its own end and
    // nowhere else; a lower row's line then drops straight through the gap.
    const curve = `M${sx} ${installBottom} C${sx} ${bend} ${ex} ${bend} ${ex} ${slot.row ? m.data : m.data - 2}`;
    const d = slot.row ? `${curve} V${slot.y - 2}` : curve;
    const head = marker('arrow');
    links.push(`<path class="halo" d="${d}" />`
      + `<path class="edge link ${condition}" data-from="${escape(from)}" data-to="${escape(to)}" d="${d}" marker-end="url(#${head})" />`);
  });

  slots.forEach((slot, id) => {
    const emitted = Boolean(services[id]);
    nodes.push(box(id, 'shared', slot.x, slot.y, imageLines(IMAGES[id as SharedId]), {
      emitted,
      fresh: isFresh(id),
      height: SHARED_HEIGHT,
    }));
  });

  nodes.push(box('nginx', 'web', webX, ROW.web, webSubs, { emitted: Boolean(web), fresh: isFresh('nginx') }));

  instances.forEach((instance) => {
    const id = instance.instance_id;
    const x = appX.get(id)!;
    const install = `${id}-install`;
    nodes.push(box(id, 'app', x, ROW.app, appSubs(instance), {
      emitted: Boolean(services[id]),
      fresh: isFresh(id),
      also: companionsOf(instance),
    }));
    nodes.push(box(install, 'install', x, ROW.install, installSubs, {
      emitted: Boolean(services[install]),
      fresh: isFresh(install),
    }));
  });

  const arrow = (name: string) =>
    `<marker id="${marker(name)}" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0 8 4 0 8z" /></marker>`;

  const titleId = `fediverse-graph-title-${layout}`;
  const descId = `fediverse-graph-desc-${layout}`;
  return `<svg class="service-graph ${layout}" viewBox="0 0 ${m.w} ${height}" preserveAspectRatio="xMidYMid meet" role="img" aria-labelledby="${titleId}" aria-describedby="${descId}">`
    + `<title id="${titleId}">${escape(title(config, compose))}</title>`
    + `<desc id="${descId}">${escape(describe(config, compose))}</desc>`
    + `<defs>${arrow('arrow')}${arrow('gate')}</defs>`
    + `<g class="wires">${wires.join('')}</g>`
    + `<g class="links">${links.join('')}</g>`
    + `<g class="gates">${labels.join('')}</g>`
    + `<g class="nodes">${nodes.join('')}</g>`
    + '</svg>';
}

/** Both drawings; the stylesheet shows the one the sheet's orientation asks for. */
export function renderGraphs(config: PlaygroundConfig, compose: ComposeFile, options: Omit<GraphOptions, 'layout'> = {}): string {
  return renderGraph(config, compose, { ...options, layout: 'landscape' }) + renderGraph(config, compose, { ...options, layout: 'portrait' });
}

const SHARED_ORDER: SharedId[] = ['db', 'redis', 'search', 'media', 'mariadb'];

const list = (names: string[]) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`);

/** The drawing's name, short enough for a tooltip: how many servers, and what they share. */
export function title(config: PlaygroundConfig, compose: ComposeFile): string {
  const servers = Object.values(config.instances).filter((instance) => compose.services[instance.instance_id]).length;
  if (!servers) return 'No servers switched on';
  const shared = SHARED_ORDER.filter((id) => compose.services[id]);
  return `${servers} server${servers === 1 ? '' : 's'} behind nginx, on ${list(shared)}`;
}

/** For a screen reader: which server uses which shared service. */
export function describe(config: PlaygroundConfig, compose: ComposeFile): string {
  const shared = new Set<string>(SHARED_ORDER.filter((id) => compose.services[id]));
  return uses(config, compose, shared)
    .filter(({ services }) => services.size)
    .map(({ id, services }) => `${id} uses ${list(SHARED_ORDER.filter((name) => services.has(name)))}.`)
    .join(' ');
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
