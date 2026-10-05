# Audits

`npm run test:audit` builds the site, serves the build on port 4311 through `wrangler dev`
and runs four checks over it. The run takes about two minutes, so it stays out of the
everyday test loop.

wrangler runs the same worker and static-assets setup that `wrangler deploy` ships, offline
in workerd. Lighthouse therefore sees the responses a reader gets: brotli on the document and
the stylesheets, `_astro/` files immutable, `public/_headers` applied. `astro preview` sends
every file uncompressed, which on Lighthouse's simulated slow 4G put the mobile first paint at
12 s for a download nobody makes.

`AUDIT_PORT` moves the server if 4311 is taken. `AUDIT_CHROME_PORT` moves the browser
Lighthouse drives.

## The four checks

- HTML, with the [W3C Nu checker](https://validator.w3.org/nu/) over `dist/client`. It checks
  content models, attribute values and duplicate ids, and it descends into `<svg>`. `vnu`
  comes from the nix dev shell, and the audit falls back to `nix develop --command vnu` when
  it is not already on PATH.
- CSS, with [stylelint](https://stylelint.io/) over the built stylesheets and the inline
  `<style>` blocks, which no build step looks at.
- Accessibility, with axe-core through Playwright: 1440x900 and 390x844, each of the four
  themes, no violations.
- Lighthouse, driving the system Chrome over the same build, once on the desktop profile and
  once on the mobile one. Every category is in the report, performance included, and each has
  a floor measured on this site. The reports land in `audit-report/lighthouse-desktop.html`
  and `audit-report/lighthouse-mobile.html`, and both are attached to the Playwright report.

`npm run test:e2e` runs the HTML and CSS checks as well, against the build that suite already
makes. The axe and Lighthouse runs stay out of it.

## Two HTML checkers, and which runs where

`npm run test:audit:html-validate` runs the HTML check through
[html-validate](https://html-validate.org/) instead of Nu. Over the same `dist/client`, three
runs each, Nu takes 1.1 to 1.4 s and html-validate 0.24 to 0.46 s.

Nu is slower and it is the one the audit runs, because the two are not equally accurate.
html-validate never looks inside `<svg>`. The site once shipped two duplicate ids inside one,
and html-validate reported neither. html-validate also checks each `<noscript>` block as a
document of its own, so an id the no-JS fallback shares with the markup around it goes
unreported. Nu reads the page whole and catches it.

html-validate keeps the seat in `npm run test:e2e`, where the check runs on every change and
should not need Java or nix.

## Ignored messages

Every message these checks ignore is listed with a reason, in `NU_IGNORED` and the two configs
at the top of `audit/markup.ts`. When a check flags something the site does on purpose, the
fix is a line there saying why. The page and the stylesheet stay as they are.

Nu's CSS half is the old W3C CSS validator and it is years behind: it calls `anchor-name` a
parse error. All of its `CSS:` messages are ignored for that reason and stylelint checks the
CSS instead.

stylelint 17.16, from October 2026, reads properties and values through css-tree 3.2 and
mdn-data 2.27 with the csstools syntax patches on top. Measured against this build it flags
none of `anchor()`, `sign()`, `::scroll-marker`, `@container`, `@property`, `:has()`,
`text-wrap: balance`, `light-dark()`, `@starting-style`, `overflow: clip`, relative colours,
nesting, `field-sizing`, view transitions or scroll-driven animations. It still catches
misspelt properties, bad units, invalid hex and duplicate declarations. The one rule that
misfires is `selector-type-no-unknown`, which reads `::scroll-button(right)` as an element
called `right`, so it is off. Keep stylelint current and rerun that list after an upgrade.
