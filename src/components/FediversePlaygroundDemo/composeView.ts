// The compose file as the sheet prints it: what makes the network, and a `# ...` line for each
// run of what does not. Kept are each image or app build, what each service waits on, an
// installer's `restart: no` and script, the ports nginx listens on, the hostname each node is
// told it has, and the per-node nginx config and certificate web mounts. Cut are tty, the
// always-restart policies, passwords and database settings, source mounts, commands that only
// start a daemon, and the named volumes. The line count beside the file is the whole file's.

import type { ComposeFile, Service } from './compose';
import { composeYaml, ELIDED, Elision } from './yaml';

/** The environment line that tells a node its hostname. */
const IDENTITY = /^CONFIG_DOMAIN=/;

const more = (count: number, what: string) => `${count} more ${what}`;

function trimService(name: string, service: Service): Record<string, unknown> {
  const kept: Record<string, unknown> = {};
  const cut: string[] = [];
  const oneShot = service.restart === 'no';

  Object.entries(service).forEach(([key, value]) => {
    switch (key) {
      case 'build':
        // An installer builds the same image as its app, one box down.
        if (oneShot) cut.push(key);
        else kept[key] = value;
        return;
      case 'image':
      case 'ports':
      case 'depends_on':
        kept[key] = value;
        return;
      case 'restart':
        if (oneShot) kept[key] = value;
        else cut.push(key);
        return;
      case 'command':
        if (oneShot) kept[key] = value;
        else cut.push(key);
        return;
      case 'environment': {
        const all = value as string[];
        const identity = oneShot ? [] : all.filter((line) => IDENTITY.test(line));
        if (!identity.length) {
          cut.push(key);
          return;
        }
        kept[key] = identity.length < all.length ? [...identity, new Elision(more(all.length - identity.length, 'settings'))] : identity;
        return;
      }
      case 'volumes': {
        // web's per-node mounts are how one nginx answers for every hostname; the rest are files.
        const all = value as string[];
        const perNode = name === 'web' ? all.filter((line) => line.endsWith('.nginx.conf') || line.includes('/live/')) : [];
        if (!perNode.length) {
          cut.push(key);
          return;
        }
        kept[key] = [new Elision(more(all.length - perNode.length, 'mounts')), ...perNode];
        return;
      }
      default:
        cut.push(key);
    }
  });

  if (cut.length) kept[ELIDED] = cut.join(', ');
  return kept;
}

/** The trimmed document, ready for composeYaml or composeHtml. */
export function composeView(compose: ComposeFile): Record<string, unknown> {
  const services = Object.fromEntries(
    Object.entries(compose.services).map(([name, service]) => [name, trimService(name, service)]),
  );

  return {
    version: compose.version,
    name: compose.name,
    services: Object.keys(services).length ? services : {},
    [ELIDED]: `volumes: ${Object.keys(compose.volumes).join(', ')}`,
  };
}

/** The whole file's length, and how much of it the sheet prints. */
export function lineCount(compose: ComposeFile): string {
  const count = (text: string) => text.split('\n').length - 1;
  return `${count(composeYaml(compose))} lines, ${count(composeYaml(composeView(compose)))} shown`;
}
