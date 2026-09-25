// The compose file as the sheet prints it: each service with what it runs, the ports nginx
// listens on, and what it waits on, which is how the servers reach each other. Everything else
// is left out without a mark, and one line under the file says so: volumes, environment, and
// the restart, tty, command and healthcheck settings. The line count beside the file is the
// whole file's.

import type { ComposeFile, Service } from './compose';
import { composeYaml } from './yaml';

const KEPT = ['build', 'image', 'ports', 'depends_on'];

function trimService(service: Service): Record<string, unknown> {
  return Object.fromEntries(Object.entries(service).filter(([key]) => KEPT.includes(key)));
}

/** The trimmed document, ready for composeYaml or composeHtml. */
export function composeView(compose: ComposeFile): Record<string, unknown> {
  const services = Object.fromEntries(
    Object.entries(compose.services).map(([name, service]) => [name, trimService(service)]),
  );

  return { version: compose.version, name: compose.name, services };
}

/** What the sheet leaves out of every service, for the line under the file. */
export const LEFT_OUT = 'Left out here: volumes, environment, restart, tty, command and healthcheck.';

/** The whole file's length, and how much of it the sheet prints. */
export function lineCount(compose: ComposeFile): string {
  const count = (text: string) => text.split('\n').length - 1;
  return `${count(composeYaml(compose))} lines, ${count(composeYaml(composeView(compose)))} shown`;
}
