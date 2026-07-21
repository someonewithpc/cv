import { createElement, type ReactNode } from 'react';
import { optimize, type XastChild, type XastRoot } from 'svgo/browser';
import { camelCase } from 'lodash';
import cx from 'classnames';

function parseInlineStyle(rawStyle: string | undefined): Record<string, string> {
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

function svgoAstToReactNode(
  ast: XastRoot | XastChild,
  { key, props }: { key: string; props?: React.SVGProps<SVGSVGElement> },
): ReactNode {
  if (ast.type === 'root') {
    return ast.children
      .map((child, i) => svgoAstToReactNode(child, { key: key + ast.type + i, props }));
  } else if (ast.type === 'element') {
    const { style: rawStyle, class: attributesClassName, ...rawAttributes } = ast.attributes;
    const { style: propsStyle, className: propsClassName, ...otherProps } = props ?? { style: {}, className: '' };

    const style = parseInlineStyle(rawStyle);

    const attributes = Object.fromEntries(Object.entries(rawAttributes).map(([attrKey, value]) => [
      camelCase(attrKey.replace(':', '-')),
      value,
    ]));

    return createElement(
      ast.name,
      {
        ...attributes,
        ...otherProps,
        key: key + ast.type,
        style: { ...style, ...(propsStyle as object) },
        className: cx(attributesClassName, propsClassName),
      },
      ast.children.map((child, i) => svgoAstToReactNode(child, { key: key + ast.type + i, props: undefined })),
    );
  } else if (ast.type === 'text') {
    return ast.value;
  } else {
    throw new Error('Unsupported SVGO AST node');
  }
}

export function optimizeAndParseSVG(svgData: string): XastRoot {
  let ast: XastRoot | undefined;

  optimize(svgData, {
    floatPrecision: 3,
    plugins: [
      'removeScripts',
      'removeComments',
      'removeDoctype',
      'removeXMLProcInst',
      'removeMetadata',
      'removeTitle',
      'removeDesc',
      'removeEditorsNSData',
      'convertPathData',
      'convertTransform',
      'cleanupNumericValues',
      {
        name: 'captureAst',
        fn: (root) => {
          ast = root;
          return null;
        },
      },
    ],
  });

  if (!ast) {
    throw new Error('Failed to parse SVG');
  }

  return ast;
}

export function optimizeAndParseSVGToComponent(svgData: string, props: Record<string, any> = {}): ReactNode {
  const ast = optimizeAndParseSVG(svgData);

  return svgoAstToReactNode(ast, { key: '', props });
}
