import { exampleConfig, withEnabled } from '../config';
import { buildComposeFile } from '../compose';
import { renderGraphs, summary } from '../graph';
import { composeYaml } from '../yaml';

/** Each toggle flips its instance's `enabled`, and the builder runs again from the config. */
export function initPlayground(host: HTMLElement) {
  const form = host.querySelector<HTMLElement>('.config');
  const graph = host.querySelector<HTMLElement>('[data-graph]');
  const yaml = host.querySelector<HTMLElement>('[data-yaml]');
  const lines = host.querySelector<HTMLElement>('[data-lines]');
  const status = host.querySelector<HTMLElement>('[data-status]');
  if (!form || !graph || !yaml || !lines || !status) return;

  const enabled = () => Object.fromEntries(
    [...form.querySelectorAll<HTMLInputElement>('input[type=checkbox]')].map((input) => [input.name, input.checked]),
  );

  let previous = new Set(Object.keys(buildComposeFile(withEnabled(exampleConfig, enabled())).services));

  form.addEventListener('change', () => {
    const config = withEnabled(exampleConfig, enabled());
    let compose;
    try {
      compose = buildComposeFile(config);
    } catch (error) {
      // validateCompose refused the file; the tool would not write it either.
      status.textContent = (error as Error).message;
      return;
    }

    const services = new Set(Object.keys(compose.services));
    const fresh = new Set([...services].filter((name) => !previous.has(name)));
    previous = services;

    const text = composeYaml(compose);
    graph.innerHTML = renderGraphs(config, compose, { fresh });
    yaml.textContent = text;
    lines.textContent = `${text.split('\n').length - 1} lines`;
    status.textContent = summary(compose);
  });
}
