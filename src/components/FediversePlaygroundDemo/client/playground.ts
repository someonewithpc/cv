import { exampleConfig, initiallyEnabled, withEnabled } from '../config';
import { buildComposeFile } from '../compose';
import { renderGraphs, summary } from '../graph';
import { composeYaml } from '../yaml';

/**
 * Each toggle flips its instance's `enabled`, and the builder runs again from the config.
 * Returns what puts the page back the way it opens: the opening toggles, the file closed.
 */
export function initPlayground(host: HTMLElement) {
  const form = host.querySelector<HTMLElement>('.config');
  const graph = host.querySelector<HTMLElement>('[data-graph]');
  const file = host.querySelector<HTMLDetailsElement>('details.yaml');
  const yaml = host.querySelector<HTMLElement>('[data-yaml]');
  const lines = host.querySelector<HTMLElement>('[data-lines]');
  const status = host.querySelector<HTMLElement>('[data-status]');
  if (!form || !graph || !file || !yaml || !lines || !status) return null;

  const inputs = [...form.querySelectorAll<HTMLInputElement>('input[type=checkbox]')];
  const enabled = () => Object.fromEntries(inputs.map((input) => [input.name, input.checked]));

  let previous = new Set(Object.keys(buildComposeFile(withEnabled(exampleConfig, enabled())).services));

  const rebuild = () => {
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
  };

  form.addEventListener('change', rebuild);

  return () => {
    file.open = false;
    const changed = inputs.filter((input) => input.checked !== Boolean(initiallyEnabled[input.name]));
    changed.forEach((input) => {
      input.checked = Boolean(initiallyEnabled[input.name]);
    });
    if (changed.length) rebuild();
  };
}
