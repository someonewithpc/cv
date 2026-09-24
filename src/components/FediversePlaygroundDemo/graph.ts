// Draws a compose file's depends_on graph as SVG markup. The server renders the opening state
// with it and the island redraws with it on every toggle, so there is one drawing, not two.
//
// Layout, top to bottom: web, one column per configured instance (app over its installer), and
// the shared data services along the bottom. Every edge comes out of depends_on. An app's edges
// to the data services leave by the gutters beside its column and meet the service on a bus,
// the way a schematic joins wires, so shared services read as one box however many ask for it.

import type { PlaygroundConfig } from './config';
import { dependenciesOf, type ComposeFile, type Service } from './compose';

const W = 518;
const H = 292;
const COLUMN = 166;
const BOX = { w: 140, h: 30 };
const WEB = { x: W / 2, y: 8, w: 170 };
const ROW = { app: 76, install: 132, data: 252 };
const GUTTER = 78;
/** Where each data service's bus runs, and the service itself. */
const DATA = [
  { id: 'db', image: 'postgres:alpine', lane: 186 },
  { id: 'redis', image: 'redis:alpine', lane: 204 },
  { id: 'mariadb', image: 'mariadb:10.3', lane: 222 },
] as const;

type Condition = 'service_healthy' | 'service_started' | 'service_completed_successfully' | 'listed';

const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const columnX = (index: number) => 10 + COLUMN / 2 + index * COLUMN;

function conditionOf(service: Service, dependency: string): Condition {
  const dependsOn = service.depends_on;
  if (Array.isArray(dependsOn)) return 'listed';
  const entry = (dependsOn as Record<string, { condition?: Condition }>)[dependency];
  return entry?.condition ?? 'listed';
}

function box(
  id: string,
  x: number,
  y: number,
  w: number,
  label: string,
  sub: string,
  { emitted, fresh, kind }: { emitted: boolean; fresh: boolean; kind: string },
) {
  const classes = ['node', kind, emitted ? 'emitted' : 'ghost', fresh && emitted ? 'fresh' : ''].filter(Boolean).join(' ');
  return `<g class="${classes}" data-service="${escape(id)}">`
    + `<rect x="${x - w / 2}" y="${y}" width="${w}" height="${BOX.h}" rx="3" />`
    + `<text class="label" x="${x}" y="${y + 12.5}">${escape(label)}</text>`
    + `<text class="sub" x="${x}" y="${y + 23.5}">${escape(emitted ? sub : 'not emitted')}</text>`
    + '</g>';
}

/** A line that paints a gap into whatever it crosses, then itself. `halo` trims the gap short
    of the far end, so the wire it lands on stays whole at the junction. */
function wire(d: string, condition: Condition, { halo, arrow }: { halo?: string; arrow?: boolean } = {}) {
  const under = halo ? `<path class="halo" d="${halo}" />` : '';
  const head = arrow ? ` marker-end="url(#${condition === 'service_completed_successfully' ? 'fediverse-gate' : 'fediverse-arrow'})"` : '';
  return `${under}<path class="edge ${condition}" d="${d}"${head} />`;
}

export type GraphOptions = {
  /** Services to play in, because this redraw is the one that added them. */
  fresh?: ReadonlySet<string>;
};

export function renderGraph(config: PlaygroundConfig, compose: ComposeFile, { fresh = new Set() }: GraphOptions = {}): string {
  const { services } = compose;
  const isFresh = (id: string) => fresh.has(id);
  const nodes: string[] = [];
  const wires: string[] = [];
  const buses: string[] = [];
  const labels: string[] = [];

  const instances = Object.values(config.instances);
  const appX = new Map(instances.map((instance, index) => [instance.instance_id, columnX(index)]));
  const installX = new Map(instances.map((instance, index) => [`${instance.instance_id}-install`, columnX(index)]));
  const dataSlot = new Map(DATA.map((data, index) => [data.id as string, { ...data, x: columnX(index) }]));

  // Web fans out to every app it waits on.
  const web = services.web;
  const webBottom = WEB.y + BOX.h;
  dependenciesOf(web ?? {}).forEach((dependency) => {
    const x = appX.get(dependency);
    if (x === undefined) return;
    const mid = (webBottom + ROW.app) / 2;
    wires.push(wire(`M${WEB.x} ${webBottom} C${WEB.x} ${mid} ${x} ${mid} ${x} ${ROW.app - 2}`, 'listed', { arrow: true }));
  });

  // Every bus, keyed by the data service it feeds: the x of each wire that drops onto it.
  const drops = new Map<string, { x: number; condition: Condition }[]>();
  const addDrop = (dependency: string, x: number, condition: Condition) => {
    drops.set(dependency, [...(drops.get(dependency) ?? []), { x, condition }]);
  };

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
        wires.push(wire(`M${x} ${ROW.app + BOX.h} V${ROW.install - 2}`, condition, { arrow: true }));
        labels.push(`<text class="gate" x="${x + 4}" y="${(ROW.app + BOX.h + ROW.install) / 2 + 3}">completed</text>`);
        return;
      }

      if (installer !== undefined) {
        const end = slot.lane;
        wires.push(wire(`M${installer} ${ROW.install + BOX.h} V${end}`, condition, {
          halo: `M${installer} ${ROW.install + BOX.h + 2} V${end - 4}`,
        }));
        addDrop(dependency, installer, condition);
        return;
      }

      // An app leaves by its left gutter for its first data service and its right for the next.
      const side = dataDependencies.indexOf(dependency) === 0 ? -1 : 1;
      const edge = app! + side * (BOX.w / 2);
      const gutter = app! + side * GUTTER;
      const y = ROW.app + BOX.h / 2;
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
      buses.push(wire(`M${slot.x} ${slot.lane} V${ROW.data - 2}`, condition, { arrow: true }));
      onBus.forEach(({ x }) => buses.push(`<circle class="junction" cx="${x}" cy="${slot.lane}" r="2" />`));
    }
    const sub = emitted ? `${data.image} · ×1` : '';
    nodes.push(box(data.id, slot.x, ROW.data, BOX.w, data.id, sub, { emitted, fresh: isFresh(data.id), kind: 'shared' }));
  });

  nodes.push(box('web', WEB.x, WEB.y, WEB.w, 'web', 'nginx:alpine · 8080 8443', {
    emitted: Boolean(web),
    fresh: isFresh('web'),
    kind: 'shared',
  }));

  instances.forEach((instance) => {
    const id = instance.instance_id;
    const x = appX.get(id)!;
    const install = `${id}-install`;
    nodes.push(box(id, x, ROW.app, BOX.w, id, `${instance.software} · ${instance.hostname}`, {
      emitted: Boolean(services[id]),
      fresh: isFresh(id),
      kind: 'app',
    }));
    nodes.push(box(install, x, ROW.install, BOX.w, install, 'one-shot · restart: no', {
      emitted: Boolean(services[install]),
      fresh: isFresh(install),
      kind: 'install',
    }));
  });

  return `<svg class="service-graph" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMinYMid meet" role="img" aria-labelledby="fediverse-graph-title">`
    + `<title id="fediverse-graph-title">${escape(describe(compose))}</title>`
    + '<defs>'
    + '<marker id="fediverse-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0 8 4 0 8z" /></marker>'
    + '<marker id="fediverse-gate" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0 8 4 0 8z" /></marker>'
    + '</defs>'
    + `<g class="buses">${buses.join('')}</g>`
    + `<g class="wires">${wires.join('')}</g>`
    + `<g class="gates">${labels.join('')}</g>`
    + `<g class="nodes">${nodes.join('')}</g>`
    + '</svg>';
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
