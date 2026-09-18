import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';
import { HtmlValidate, type ConfigData } from 'html-validate';
import stylelint from 'stylelint';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = join(root, 'dist/client');

// html-validate is the pure-JS stand-in for the W3C Nu checker (which needs Java). The
// rules switched off below are the ones Nu has no opinion on either: house style, or
// accessibility advice that a11y.spec.ts covers with axe against the rendered page.
const htmlConfig: ConfigData = {
  extends: ['html-validate:recommended'],
  elements: [
    'html5',
    // Two <style> elements ship inside <body> on purpose: the theme CSS the picker
    // builds from its own table, and the no-JS paper stack fallback. Moving them to
    // <head> is TODO.md's "Put CSS and JS out of line"; until then they are checked as
    // CSS below rather than reported as misplaced metadata.
    { style: { flow: true } },
  ],
  rules: {
    // Layout state travels as inline custom properties: --page-index, --fold-x, the
    // anchor names the drawing sheets pin their notes to.
    'no-inline-style': 'off',
    // Whitespace inside generated markup.
    'no-trailing-whitespace': 'off',
    // An <aside> inside sectioning content is generic, not a complementary landmark,
    // so the per-sheet drawing notes need no names of their own.
    'unique-landmark': 'off',
    // The paper stacks are <article role="region"> so a screen reader announces each
    // one as a single turnable unit.
    'prefer-native-element': 'off',
  },
};

const cssConfig = {
  extends: ['stylelint-config-recommended'],
  rules: {
    // The bundle concatenates every component's styles, so the order two selectors end
    // up in is not something any one stylesheet decides.
    'no-descending-specificity': null,
    'no-duplicate-selectors': null,
    // clip: rect(0, 0, 0, 0) is the visually-hidden idiom.
    'property-no-deprecated': [true, { ignoreProperties: ['clip'] }],
    // stylelint's selector parser does not know ::scroll-button() yet and reads its
    // left/right arguments as element names.
    'selector-type-no-unknown': [true, { ignoreTypes: ['left', 'right'] }],
  },
};

const filesUnder = async (dir: string, extension: string): Promise<string[]> => {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(extension))
    .map((entry) => join(entry.parentPath, entry.name))
    .sort();
};

// A browser with scripting on parses <noscript> content as text, and one with scripting
// off never builds the stacks the fallback stands in for, so neither ever holds both
// copies of the markup at once and both are checked as documents of their own. The gap:
// an id the fallback shares with the markup around it, which only collides with JS off.
const documentsIn = (html: string): string[] => {
  const fallbacks: string[] = [];
  const scripted = html.replace(/<noscript>([\s\S]*?)<\/noscript>/g, (_match, inner: string) => {
    fallbacks.push(inner);
    return '<noscript></noscript>';
  });

  return [scripted, ...fallbacks];
};

const styleSheetsIn = (html: string): string[] =>
  [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((match) => match[1]);

export const markupTests = (): void => {
  // Both checks read the production build the web server put there; a reused server
  // leaves nothing to read.
  test.beforeEach(() => {
    test.skip(!existsSync(dist), 'no build to check — run npm run build');
  });

  test('the built HTML is valid', async () => {
    const htmlValidate = new HtmlValidate(htmlConfig);
    const problems: string[] = [];

    for (const file of await filesUnder(dist, '.html')) {
      const source = await readFile(file, 'utf8');

      for (const [index, document] of documentsIn(source).entries()) {
        const where = index === 0 ? file : `${file} (noscript ${index})`;
        const { results } = await htmlValidate.validateString(document, file);

        for (const result of results) {
          for (const message of result.messages) {
            problems.push(`${where}:${message.line}:${message.column} ${message.message} (${message.ruleId})`);
          }
        }
      }
    }

    expect(problems.join('\n')).toBe('');
  });

  test('the built CSS is valid', async () => {
    const sheets: { name: string; code: string }[] = [];

    for (const file of await filesUnder(dist, '.css')) {
      sheets.push({ name: file, code: await readFile(file, 'utf8') });
    }

    // The inline sheets reach the browser too, and they are the ones no build step
    // looks at: the theme CSS is a template string, the fallback CSS is hand-written
    // plain CSS that Astro deliberately leaves uncompiled.
    for (const file of await filesUnder(dist, '.html')) {
      const source = await readFile(file, 'utf8');
      styleSheetsIn(source).forEach((code, index) => {
        sheets.push({ name: `${file} (style ${index + 1})`, code });
      });
    }

    const problems: string[] = [];

    for (const sheet of sheets) {
      const { results } = await stylelint.lint({ code: sheet.code, config: cssConfig, configBasedir: root });

      for (const result of results) {
        for (const error of result.parseErrors) {
          problems.push(`${sheet.name}:${error.line}:${error.column} ${error.text}`);
        }
        for (const warning of result.warnings) {
          problems.push(`${sheet.name}:${warning.line}:${warning.column} ${warning.text}`);
        }
      }
    }

    expect(problems.join('\n')).toBe('');
  });
};
