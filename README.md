# Hugo Sales's CV and portfolio

This is the source for [hsal.es](https://hsal.es), my CV and portfolio. The page is drawn as a
set of technical drawing sheets lying on a cutting mat. Each demo is a stack of sheets you turn
by the dog-eared corner. The top sheet runs a working copy of something I built. The sheets
behind it show how it works.

## The demos

Most demos come from my work at Visrez, where I built a 3D planner for event spaces and tools
for venue maps. The rest come from GNU social, my own open source tools, or this site.

| | Demo | From | What it shows |
| --- | --- | --- | --- |
| A | Space builder | Visrez | Draw a rectangle on a 3D floor and it fills with chairs. Sliders set spacing, aisles and seat count |
| B | Marker editor | Visrez | A pin editor for venue maps. Shape, border, fill and decoration are separate parts |
| C | Drag and drop | Visrez | Drag an object off the catalogue and it lands in the 3D scene where you drop it |
| D | Font picker | Visrez | A font list built from `document.fonts`, with nothing hardcoded |
| E | Loading logo | Visrez | The animated Visrez logo, and the steps that turned an Illustrator export into one SVG path |
| F | Theme picker | This site | The control that switches between the four themes, and how its wipe is drawn |
| G | Object variants | Visrez | One catalogue card covers a whole family of finishes and sizes |
| H | Tagging tool | Visrez | One input tags a base object and every variant under it |
| I | Paper stack | This site | How the sheet stacks on this page fold and turn, and what they become without JavaScript |
| J | Event bus | GNU social | How plugins claim events, and what happens when you switch one off |
| K | Fediverse playground | My own tool | A CLI that runs a small federated network on one machine from one YAML file |
| L | Library search | Visrez | One search box over every property of a library object, scored by MariaDB |
| M | Synthetic properties | Visrez | A size stored once and found by a search for 5ft3in or 1.6m |
| N | Schema driver | GNU social | A Doctrine driver that turns one PHP array per table into the ORM mapping and the schema |
| O | web-ts-mode | My own tool | An Emacs major mode for Astro and Vue files, with one tree-sitter parser per language |

The originals were written in Vue, React, Rails, PHP and Emacs Lisp. The copies here run in
the browser on Astro, React, Vue and TypeScript. Each demo has its own folder under
`src/components/`.

## How it's built

The site is static. [Astro](https://astro.build) renders the page to HTML at build time and
Cloudflare serves the built files from its asset store. The demos are islands that load their
script when you scroll to them. Without JavaScript the page still reads from top to bottom, and
each stack of sheets becomes a row you scroll sideways.

A small Cloudflare Worker sits beside the files and only runs for two paths. One collects the
page's analytics events. The other is a proxy that lets the font picker load fonts from other
sites, with a daily byte limit.

The demos use React, Vue, Three.js, Leaflet and Redux. Styles are Sass. The fonts are
self-hosted: Poppins, Special Elite, Allerta Stencil and Permanent Marker. Icons come from
Lucide through astro-icon and from Font Awesome. The skills section draws its own SVG icons
from `src/icons/`.

There are four themes: Light, Dark, Arctic and Forest. The page follows your system's light or
dark setting until you pick one.

Printing the page gives a paper CV. The print stylesheet drops the desk, the theme picker and
the demos. It keeps the title block, the career, the bill of materials and the open source
contributions, in the light theme.

## What the site records about visitors

The page loads Cloudflare Web Analytics. It sets no cookie and stores nothing in the browser.

That script can't see what you do on the page, so the page also sends a few events of its own
to `/api/e`:

- the visit, with the referring site's host, a rough viewport size and the theme in use
- each section you reach
- each sheet you turn
- the first time you touch each demo
- each theme you pick
- printing
- clicks on the contact links
- how long the tab stayed open

The page makes a random session id when it loads. It lives only in memory and goes away when
you close the tab.

The worker turns your IP address and user agent into a visitor id by hashing them with a
random salt. A Durable Object keeps one salt per calendar month and deletes it a day after the
month ends. After that, nobody can tell which visits came from the same person, me included.
So the site recognises a return visit within the same month and not after. The method is wrong
both ways. A phone that changes network counts as two visitors, and an office behind one
address counts as one.

Each event also carries the country, region, city and time zone that Cloudflare reads off the
request. The worker never stores a postcode or coordinates.

The visit event carries three more fields that help tell people from bots:

- the browser family, such as chrome, firefox or safari, or bot for a known crawler. The worker
  never stores the full user agent or the version
- the name of the network's operator as Cloudflare gives it, such as an ISP or a cloud provider
- Cloudflare's category for a verified bot

The events go to Cloudflare Analytics Engine, which keeps them for 90 days.

The page sends nothing in these cases:

- your browser sends Global Privacy Control or Do Not Track. The worker also drops any event
  that arrives with a `Sec-GPC: 1` or `DNT: 1` header
- your browser reports `navigator.webdriver`, as Playwright, Puppeteer and safaridriver do
- the page runs on any host other than hsal.es, such as a local build

## Running it

You need Node 22 or later. With Nix, `nix develop` opens a shell with Node and installs the
dependencies, and the `.envrc` lets direnv do the same when you enter the folder. Without Nix,
run `npm install`.

- `npm run dev` starts the dev server
- `npm run build` builds the site into `dist/`
- `npm run preview` serves the last build

The dev and preview servers detach from the terminal and keep running. Stop them with
`npx astro dev stop` and `npx astro preview stop`.

## Tests

- `npm run check` type-checks `src/` and the Playwright specs with `astro check`
- `npm run lint:css` runs stylelint over the styles
- `npm run test:e2e` builds the site, serves it on port 4310 and runs the Playwright suite in
  `e2e/`
- `npm run test:audit` checks the built site's HTML and CSS, its accessibility in all four
  themes, and its Lighthouse scores. [docs/AUDITS.md](docs/AUDITS.md) explains each check

The suite drives the Chrome or Chromium on your `PATH`, not a browser Playwright downloads. A
few specs load the page without JavaScript in Firefox. They run when Firefox is on your `PATH`
or after `npx playwright install firefox`, and the suite warns when it skips them.

## Deploying

`npm run deploy` type-checks, builds, runs the Playwright suite against that build, then runs
`wrangler deploy`. It stops at the first step that fails.

The deploy goes to my Cloudflare account. To host a copy, point `wrangler.jsonc` at a worker
of your own.

## Layout

- `src/pages/index.astro` is the whole site. It is one page
- `src/components/` holds the demos, the sheet stacks and the drawing parts
- `src/scss/` holds the shared styles. `src/themes.ts` defines the themes
- `src/worker.ts` is the Cloudflare Worker. `src/server/` holds the analytics and font proxy
  code it runs
- `e2e/` holds the Playwright specs, and `audit/` the audits
- `scripts/` holds one-off generators for committed assets, such as the map and the link
  preview image
- [TODO.md](TODO.md) lists what is done and what is left
- [docs/DEAD-ENDS.md](docs/DEAD-ENDS.md) lists approaches I tried and dropped, with the numbers

## Contact

Email me at [contact@hsal.es](mailto:contact@hsal.es). I'm someonewithpc on
[GitHub](https://github.com/someonewithpc), [Codeberg](https://codeberg.org/someonewithpc) and
[LinkedIn](https://www.linkedin.com/in/someonewithpc/).
