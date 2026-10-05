import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { expect, test } from '@playwright/test';
import { HtmlValidate, type ConfigData } from 'html-validate';
import stylelint from 'stylelint';

const run = promisify(execFile);

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = join(root, 'dist/client');

// html-validate is the second HTML checker, the one npm run test:e2e runs. It is pure JS
// and four times faster than Nu, and it never looks inside <svg>, which is where both of
// the duplicate ids this branch fixes were. The rules switched off below are the ones Nu
// has no opinion on either: house style, or accessibility advice that a11y.spec.ts covers
// with axe against the rendered page.
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
    // The Event Bus listener mapping is a CSS grid whose rows and cells carry table
    // roles (DiscoveryLayer.astro); the cells are grid items, so no <table>.
    'prefer-native-element': 'off',
  },
};

// vnu, the W3C Nu HTML checker, comes from the nix dev shell (see flake.nix). It reads
// the same grammar validator.w3.org/nu does, it descends into <svg>, and it is the
// checker npm run test:audit runs.
//
// Never change markup that works to make a checker happy. Everything below is a message
// Nu reports about markup that is deliberate, or that Nu judges against an older spec
// than the browsers this site ships to. Add a line here with a reason; do not touch the
// page.
const NU_IGNORED: { message: RegExp; because: string }[] = [
  {
    // Nu's CSS half is the old W3C CSS validator. It calls anchor-name and half a dozen
    // other shipped properties parse errors. stylelint checks the CSS below instead.
    message: /^CSS: /,
    because: "Nu's CSS validator is years behind; stylelint checks the CSS",
  },
  {
    // The theme CSS the picker builds from its own table, and the no-JS paper stack
    // fallback. TODO.md's "Put CSS and JS out of line" covers moving them; #22 says the
    // theme block stays inline on purpose.
    message: /^Element “style” not allowed as child of element “(body|noscript)”/,
    because: 'both inline <style> blocks are deliberate',
  },
  {
    // SVG 2 gives offset a default of 0. Nu still reads SVG 1.1, where it is required.
    // Every one of these is inside a vendored iconify icon.
    message: /^Element “stop” is missing required attribute “offset”/,
    because: 'offset defaults to 0 in SVG 2, and the icons are vendored',
  },
  {
    // VisrezLogoAnimation puts the untouched Illustrator export on the page: the XML
    // declaration, the editor namespaces and the repeated stop ids are what the demo is
    // about, and the sheet prints the file's byte size. Cleaning it would rewrite the
    // exhibit.
    message:
      /^(Saw “<\?”|Attribute “xmlns:(svg|sodipodi|inkscape|i)” not allowed here|Attribute “(sodipodi|inkscape|i):[a-z]+” not allowed on element|Attribute “slot” not allowed on element “svg”|Duplicate ID “stop[1-9]”)/,
    because: 'the original logo is on the page as the unoptimised original',
  },
];

// Hugo's rule, and it outranks any linter: never downgrade or remove a progressive
// enhancement because a tool says it is not valid. If one of these rules ever flags
// something this site uses on purpose, switch the rule off here and write down why.
// Do not change the CSS.
//
// stylelint 17.16 (October 2026) reads properties and values through css-tree 3.2 and
// mdn-data 2.27, patched by @csstools/css-syntax-patches-for-csstree. Measured against
// this site's build it flags none of anchor(), sign(), ::scroll-marker, @container,
// @property, :has(), text-wrap: balance, light-dark(), @starting-style, overflow: clip,
// relative colours, nesting, field-sizing, view transitions or scroll-driven animations,
// and it still catches misspelt properties, bad units and invalid hex. So the list-driven
// rules stay on, with the two exceptions below.
const cssConfig = {
  extends: ['stylelint-config-recommended'],
  rules: {
    // The bundle concatenates every component's styles, so the order two selectors end
    // up in is not something any one stylesheet decides.
    'no-descending-specificity': null,
    'no-duplicate-selectors': null,
    // clip: rect(0, 0, 0, 0) is the visually-hidden idiom.
    'property-no-deprecated': [true, { ignoreProperties: ['clip'] }],
    // Off, not narrowed: stylelint's selector parser reads ::scroll-button(right) as an
    // element called right. An ignoreTypes list would have to grow with every new
    // pseudo-element argument, and it would hide a real unknown element on the way.
    'selector-type-no-unknown': null,
    // :target-current is the scroll marker pseudo-class (CSS Overflow 5); stylelint 17's
    // list does not have it yet.
    'selector-pseudo-class-no-unknown': [true, { ignorePseudoClasses: ['target-current'] }],
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

// A comment explains the <style> element it sits next to, quoting the tag as it goes,
// and this match is not a parser. Drop the comments before looking for the real ones.
const styleSheetsIn = (html: string): string[] =>
  [...html.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((match) => match[1]);

type NuMessage = { type: string; subType?: string; url?: string; lastLine?: number; firstColumn?: number; message: string };

// vnu is on PATH inside the dev shell. Outside it, nix builds it on the way in, which
// adds about a second to the first call and nothing after that.
const runNu = async (files: string[]): Promise<NuMessage[]> => {
  const flags = ['--format', 'json', '--stdout', '--exit-zero-always', '--skip-non-html', ...files];
  const options = { cwd: root, maxBuffer: 64 * 1024 * 1024 };

  const { stdout } = await run('vnu', flags, options).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') throw error;
    return run('nix', ['develop', '--command', 'vnu', ...flags], options);
  });

  return (JSON.parse(stdout) as { messages: NuMessage[] }).messages;
};

export const markupTests = ({ html }: { html: 'nu' | 'html-validate' }): void => {
  // Both checks read the production build the web server put there; a reused server
  // leaves nothing to read.
  test.beforeEach(() => {
    test.skip(!existsSync(dist), 'no build to check — run npm run build');
  });

  if (html === 'nu') {
    test('the built HTML is valid, by the W3C Nu checker', async () => {
      test.slow();

      const problems = (await runNu(await filesUnder(dist, '.html')))
        .filter((message) => message.type === 'error')
        .filter((message) => !NU_IGNORED.some(({ message: pattern }) => pattern.test(message.message)))
        .map((message) => {
          const where = message.url ? relative(root, fileURLToPath(message.url)) : 'the build';

          return `${where}:${message.lastLine}:${message.firstColumn} ${message.message}`;
        });

      expect(problems.join('\n')).toBe('');
    });
  }

  if (html === 'html-validate') {
    test('the built HTML is valid, by html-validate', async () => {
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
  }

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
