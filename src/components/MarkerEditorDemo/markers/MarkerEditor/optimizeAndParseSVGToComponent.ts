import { createElement, type ReactNode } from 'react';
import camelCase from 'lodash-es/camelCase';
import cx from 'classnames';

function parseInlineStyle(rawStyle: string | null): Record<string, string> {
  if (!rawStyle) return {};
  return Object.fromEntries(
    rawStyle
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const colon = part.indexOf(':');
        if (colon === -1) return null;
        const key = camelCase(part.slice(0, colon).trim());
        const value = part.slice(colon + 1).trim();
        return [key, value] as const;
      })
      .filter((entry): entry is readonly [string, string] => entry !== null),
  );
}

function attributeNameToProp(name: string) {
  if (name === 'class') return 'className';
  if (name === 'xlink:href') return 'xlinkHref';
  return camelCase(name.replace(':', '-'));
}

/** Trusted demo / store SVGs — DOMParser avoids shipping svgo/browser (~768KiB) in the editor chunk. */
function domNodeToReact(
  node: Node,
  { key, props }: { key: string; props?: React.SVGProps<SVGSVGElement> },
): ReactNode {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent;
    return text?.trim() ? text : null;
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return null;

  const el = node as Element;
  const { style: propsStyle, className: propsClassName, ...otherProps } = props ?? {};
  const attributes: Record<string, unknown> = {};

  for (const attr of Array.from(el.attributes)) {
    if (attr.name === 'style') {
      attributes.style = {
        ...parseInlineStyle(attr.value),
        ...(propsStyle as object),
      };
      continue;
    }
    if (attr.name === 'class') {
      attributes.className = cx(attr.value, propsClassName);
      continue;
    }
    attributes[attributeNameToProp(attr.name)] = attr.value;
  }

  if (propsStyle && !attributes.style) {
    attributes.style = propsStyle;
  }
  if (propsClassName && !attributes.className) {
    attributes.className = propsClassName;
  }

  const children = Array.from(el.childNodes)
    .map((child, i) => domNodeToReact(child, { key: `${key}${el.tagName}${i}`, props: undefined }))
    .filter((child) => child != null);

  return createElement(
    el.tagName,
    {
      ...attributes,
      ...otherProps,
      key: key + el.tagName,
    },
    children.length > 0 ? children : undefined,
  );
}

export function parseSVGDocument(svgData: string): SVGSVGElement {
  const parsed = new DOMParser().parseFromString(svgData, 'image/svg+xml');
  const root = parsed.documentElement;

  if (!(root instanceof SVGSVGElement) || root.querySelector('parsererror')) {
    throw new Error('Failed to parse SVG');
  }

  return root;
}

export function optimizeAndParseSVGToComponent(
  svgData: string,
  props: Record<string, any> = {},
): ReactNode {
  return domNodeToReact(parseSVGDocument(svgData), { key: '', props });
}
