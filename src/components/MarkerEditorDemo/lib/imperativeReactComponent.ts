import '../markers/client-only';

import { createElement, createRef, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';

/**
 * Runs `updates` so every root they render commits in the same task.
 *
 * React commits each root in its own task once a time slice runs out. The marker parts render
 * `<style>` elements, and WebKit restyles the whole page for every sheet added ahead of the
 * page's last one, about 330 ms each in Safari 27. An editor opening its seven parts' sheets
 * one task at a time ran at 3 fps for two seconds there. Committed together they cost one
 * restyle. It waits for a microtask because flushSync can't flush from inside an effect.
 */
export function renderTogether(updates: () => void) {
  queueMicrotask(() => flushSync(updates));
}

/**
 * Use React for templating while bypassing its render loop for MarkerEditor
 * control-point updates.
 */
export function imperativeReactComponent<
  Tag extends keyof React.JSX.IntrinsicElements,
  Namespace extends Parameters<typeof document.createElementNS>[0],
>(
  element: Tag | [Namespace, Tag],
  key: string,
  props?: React.JSX.IntrinsicElements[Tag],
) {
  const createElementArgs: Parameters<typeof document.createElementNS> = !Array.isArray(element)
    ? ['http://www.w3.org/1999/xhtml', element]
    : element;

  let el: Element | null = null;
  let root: Root | null = null;
  const ref = createRef<Element>();

  const ensureDom = () => {
    if (el && root) return;
    if (typeof document === 'undefined') {
      throw new Error('imperativeReactComponent requires a browser environment');
    }
    el = document.createElementNS(...createElementArgs);
    root = createRoot(el);
  };

  return {
    ...createElement(createElementArgs[1], { key, ref, ...(props ?? {}) }),
    update(children: ReactNode) {
      ensureDom();
      root!.render(children);
      if (!ref.current) return;

      const attributes = [...ref.current.attributes];
      ref.current.replaceWith(el!);
      attributes.forEach((attr: Attr) => {
        el!.setAttribute(attr.name, attr.value);
      });
    },
  };
}
