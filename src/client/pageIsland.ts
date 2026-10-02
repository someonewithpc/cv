import { bootWhenVisible } from './bootWhenVisible';
import { isFrontPage } from './frontPage';

type Boot = (host: HTMLElement) => void | Promise<void>;

/**
 * Boots every `selector` host on the page once a visitor can see it. A component's hoisted
 * script runs once per page however many times the component was rendered, so the component
 * names its hosts by a data attribute of its own and this finds them all.
 *
 * Every page of a PaperStack shares one grid cell, so the viewport observer sees all of them
 * at once when the stack scrolls in. Which one is on top is read from --page-index instead,
 * and a covered host waits for the stack's paper-flip events until its page comes to the
 * front. `data-mounted` marks a host handed to `boot`; the e2e helpers wait on it. It is `"pending"`
 * from registration until then.
 */
export function bootIslands(selector: string, boot: Boot) {
  document.querySelectorAll<HTMLElement>(selector).forEach((host) => bootIsland(host, boot));
}

function bootIsland(host: HTMLElement, boot: Boot) {
  if (host.dataset.mounted === 'true') return;
  host.dataset.mounted = 'pending';

  const mount = async () => {
    if (host.dataset.mounted === 'true') return;
    host.dataset.mounted = 'true';
    try {
      await boot(host);
    } catch (error) {
      console.debug('Island failed to boot', host, error);
      delete host.dataset.mounted;
    }
  };

  bootWhenVisible(host, () => {
    if (isFrontPage(host)) {
      mount();
      return;
    }
    const stack = host.closest<HTMLElement>('[data-paper-stack-root]')!;
    const onFlip = () => {
      if (!isFrontPage(host)) return;
      stack.removeEventListener('paper-flip', onFlip);
      mount();
    };
    stack.addEventListener('paper-flip', onFlip);
  });
}
