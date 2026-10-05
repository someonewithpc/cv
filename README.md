# Hugo Sales's CV and Portfolio

The source for **[hsal.es](https://hsal.es)**, my CV and portfolio. It's laid out like a set of
technical drawings on a cutting mat, with demos you can use in the browser. Some come from my
work at Visrez, like the 3D space builder and the map marker editor, and others from my open
source work, like the Fediverse playground. It's an Astro site, deployed to Cloudflare Workers.

## The demos

| | Demo | From | Built with | In `src/components/` |
| --- | --- | --- | --- | --- |
| A | Space builder | Visrez | Vue, Three.js | `SpaceBuilderDemo` |
| B | Marker editor | Visrez | React, Leaflet, Redux | `MarkerEditorDemo` |
| C | Drag and drop | Visrez | Vue, Three.js | `DragDropDemo` |
| D | Font picker | Visrez | React | `FontPickerDemo` |
| E | Loading logo | Visrez | SVG, CSS animation | `VisrezLogoAnimation` |
| F | Theme picker | This site | Astro, CSS, View Transitions | `ThemePickerDemo` |
| G | Object variants | Visrez | Vue, Sass | `VariantsDemo` |
| H | Tagging tool | Visrez | CSS, JavaScript | `TaggingToolDemo` |
| I | Paper stack | This site | CSS, TypeScript | `PaperStackDemo` |
| J | Event bus | GNU social | PHP, Symfony | `EventBusDemo` |
| K | Fediverse playground | Open source | TypeScript, Docker | `FediversePlaygroundDemo` |
| L | Library search | Visrez | Rails, MariaDB | `LibrarySearchDemo` |
| M | Synthetic properties | Visrez | Rails, MariaDB | `SyntheticPropertiesDemo` |
| N | Schema driver | GNU social | PHP, Symfony, Doctrine | `SchemaDefDemo` |
| O | web-ts-mode | Open source | Emacs Lisp, tree-sitter | `WebTsModeDemo` |

The "Built with" column names what the original used. The demos themselves run on Astro,
React, Vue and plain TypeScript.

## How it's built

Astro renders the whole page to HTML at build time, and a Cloudflare Worker serves it. The
demos are islands that load their script when you scroll to them. Without JavaScript the page
still reads start to finish, and the paper stacks fall back to a row you scroll sideways.

There are four themes, and a print stylesheet for the paper version.

## Running it

You need Node 22. The nix flake provides it: `nix develop` opens a shell with Node and installs
the dependencies, and direnv does the same when you enter the directory. Without nix, run
`npm install` yourself.

`npm run dev` starts the dev server.

## Tests

`npm run check` runs `astro check`, which type-checks `src/` and the specs in `e2e/`. Playwright
strips types before it runs a spec, so a type error there never fails `npm run test:e2e`.

`npm run test:e2e` builds the site, serves it with `astro preview` on port 4310 and runs the
Playwright suite against it. If a preview is already on that port it reuses it and skips the
build. The suite drives the Chrome installed on your machine, and Firefox for the no-script
specs when it is on PATH.

## Audits

`npm run test:audit` checks the built site four ways: HTML with the W3C Nu checker, CSS with
stylelint, accessibility with axe-core in all four themes, and Lighthouse on desktop and
mobile. It takes about two minutes. [docs/AUDITS.md](docs/AUDITS.md) says what each check
covers, why there are two HTML checkers, and where the ignored messages are listed.

## Deploy

`npm run deploy` runs `npm run check`, then `npm run build`, then the e2e suite against that
`dist/`, then `wrangler deploy` of the same `dist/`. It stops at the first step that fails.
`E2E_PREBUILT=1` tells the suite to serve the existing `dist/` without building again, and to
refuse a server already on 4310 rather than test it.

The deploy goes to my Cloudflare account, so it only works with my credentials. To host a
fork, point `wrangler.jsonc` at a worker of your own.

## Where things are

- `src/pages/index.astro` is the page. It is one page.
- `src/components/` holds the demos, the paper stack and the drawing sheets.
- `src/scss/` holds the shared styles, and `src/themes.ts` the four themes.
- `e2e/` holds the Playwright specs, and `audit/` the audits.
- `plugins/` holds the Vite plugins the build uses, and `scripts/` the asset generators.
- [TODO.md](TODO.md) lists what is left to do.
- [docs/DEAD-ENDS.md](docs/DEAD-ENDS.md) lists approaches I tried and dropped, with the
  numbers.
