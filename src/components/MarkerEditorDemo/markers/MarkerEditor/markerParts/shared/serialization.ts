import '../../../client-only';

import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { camelCase, snakeCase, partition } from 'lodash';

import { dataUrlToSvg, svgToDataUrl } from '@/store';
import type { MarkerType, SpaceType } from '@/store';

import { parseSVGDocument } from '../../optimizeAndParseSVGToComponent';
import { markers } from '..';
import type { StateType } from '..';

import { Point } from './Point';

class Json {
  #value: object | undefined = undefined;

  constructor(data: string) {
    try {
      this.#value = JSON.parse(data);
    } catch (_) {}
  }

  valueOf() {
    return this.#value;
  }
}

const serializableConstructors: Record<string, new (data: string) => any> = {
  Point,
  Number,
  String,
  Json,
};

/** The bundler renames classes, so read the name back off the table that deserializes it. */
function serializableConstructorName(value: object): string {
  const entry = Object.entries(serializableConstructors)
    .find(([, constructor]) => value.constructor === constructor);
  return entry?.[0] ?? value.constructor.name;
}

export function serializeKeyValue(property: string, name: string, value: any): [string, string] {
  // We need to store the properties without uppercase letters, as that's technically not allowed by
  // the HTML spect and thus React warns us about it. See https://react.dev/warnings/unknown-prop
  const key = `data-${snakeCase(property)}-${snakeCase(name)}`;

  if (typeof value === 'string') {
    return [key, `String:${value}`];
  } else if (typeof value === 'number') {
    return [key, `Number:${value.toFixed(3)}`];
  } else if ('serialize' in value) {
    return [key, `${serializableConstructorName(value)}:${value.serialize()}`];
  } else if (value instanceof Object && value !== null) {
    return [key, `Json:${JSON.stringify(value)}`];
  } else {
    throw new Error(`Unknown type ${typeof value} in serializeKeyValue: ${property}, ${name}, ${value}`);
  }
}

export function deserializeKeyValue(key: string, value: string): [string, string | [string, any]] | null {
  const [prefix, property, ...nameParts] = key.split('-');
  if (prefix !== 'data') return null;

  if (nameParts.length === 0) return [camelCase(property), value];

  const name = nameParts.length > 0 ? nameParts.join('-') : property;

  const [constructorName, ...rest] = value.split(':');
  if (rest.length === 0) return null;
  const data = rest.join(':');

  if (!(constructorName in serializableConstructors)) throw new Error(`Unknown constructor ${constructorName}`);

  const boxed = new serializableConstructors[constructorName](data);
  const unboxed = 'valueOf' in boxed ? boxed.valueOf() : boxed;

  return [
    camelCase(property),
    [camelCase(name), unboxed],
  ];
}

let serializationRootEl: SVGSVGElement | null = null;
let serializationRoot: Root | null = null;

function ensureSerializationRoot() {
  if (serializationRootEl && serializationRoot) {
    return { serializationRootEl, serializationRoot };
  }
  if (typeof document === 'undefined') {
    throw new Error('serializeMarker requires a browser environment');
  }
  serializationRootEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  serializationRootEl.setAttribute('viewBox', '-1 -1 2 2');
  serializationRootEl.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  serializationRoot = createRoot(serializationRootEl);
  return { serializationRootEl, serializationRoot };
}

export function serializeMarker(state: StateType, space: SpaceType): string {
  if (!space.markerId) {
    throw new Error('space.markerId must be set before serializing');
  }

  const { serializationRootEl: rootEl, serializationRoot: root } = ensureSerializationRoot();
  rootEl.setAttribute('id', `marker-${space.markerId}`);

  flushSync(() => {
    root.render(
      Object.entries(state.active)
        .map(([step, partName]) => {
          const part = (markers as any)[step][partName];
          const SerializeContent = part.SerializeContent.bind(part);
          return createElement(SerializeContent, { space, key: `${step}-${partName}` });
        }),
    );
  });

  return svgToDataUrl(rootEl.outerHTML);
}

export function deserializeMarker(storeMarker: MarkerType | undefined) {
  if (!storeMarker?.source) return null;

  const svg = storeMarker.resolvedSource ?? dataUrlToSvg(storeMarker.source);
  const doc = parseSVGDocument(svg);

  const activeState: Record<string, string> = {};

  Array.from(doc.children)
    .forEach((node) => {
      if (!(node instanceof Element)) return;

      const attributes = Array.from(node.attributes)
        .filter((attr) => attr.name.startsWith('data-'))
        .map((attr) => deserializeKeyValue(attr.name, attr.value))
        .filter((deserialized) => deserialized !== null);

      const [flatAttributes, nestedAttributes] = partition(attributes, ([, value]) => typeof value === 'string');

      console.assert(flatAttributes.length === 1 && flatAttributes[0][0] === 'kind', 'Unhandled attributes %o found when deserializing %o', flatAttributes, storeMarker);
      const [[, className]] = flatAttributes;

      Object.entries(markers)
        .forEach(([step, options]) => {
          const found = Object.entries(options)
            .find(([, part]) => part.kind === className);

          if (!found) return;

          const [name, part] = found;

          // TODO for large format markers, allow multiple
          activeState[step] = name;

          nestedAttributes.forEach(([entry, [key, value]]) => {
            if (entry === 'state' && key in part.controlPoints) {
              // Write into state directly — controlPoints setters run constrain/snap
              // and would pull a saved nudge back onto the shape center on re-open.
              const current = (part.state as Record<string, unknown>)[key];
              if (current instanceof Point && value instanceof Point) {
                current.x = value.x;
                current.y = value.y;
              } else {
                (part.state as Record<string, unknown>)[key] = value;
              }
            } else {
              part[entry][key] = value;
            }
          });
        });
    });

  return activeState as StateType['active'];
}
