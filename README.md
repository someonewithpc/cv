# Hugo Sales's CV and Portfolio

## Audits

`npm run test:audit` builds the site, serves the build on port 4311 and runs four checks
over it. It takes about a minute and a half, so run it when you want it rather than on
every change. `AUDIT_PORT` moves the server if 4311 is taken, `AUDIT_CHROME_PORT` the
browser Lighthouse drives.

- HTML, with the [W3C Nu checker](https://validator.w3.org/nu/) over `dist/client`. `vnu`
  comes from the nix dev shell, and the audit falls back to `nix develop --command vnu`
  when it is not already on PATH. Content models, attribute values, duplicate ids, and it
  descends into `<svg>`.
- CSS, with [stylelint](https://stylelint.io/) over the built stylesheets and the inline
  `<style>` blocks, which are the ones no build step looks at.
- Accessibility, with axe-core through Playwright: 1440x900 and 390x844, each of the four
  themes, no violations.
- Lighthouse, driving the system Chrome over the same build, once on the desktop profile
  and once on the mobile one. Every category is in the report, performance included, and
  each has a floor measured here. The reports land in `audit-report/lighthouse-desktop.html`
  and `audit-report/lighthouse-mobile.html`, and both are attached to the Playwright
  report.

`npm run test:e2e` runs the HTML and CSS checks as well, against the build that suite
already makes. The axe and Lighthouse runs stay out of it.

### Two HTML checkers, and which runs where

`npm run test:audit:html-validate` runs the HTML check through
[html-validate](https://html-validate.org/) instead of Nu. Over the same `dist/client`,
three runs each, Nu takes 1.1 to 1.4 s and html-validate 0.24 to 0.46 s.

Nu is the slower one and it is the one the audit runs, because the two are not equally
accurate. html-validate never looks inside `<svg>`. Both duplicate ids fixed on this
branch were inside one, and html-validate reported neither. html-validate also checks each
`<noscript>` block as a document of its own, so an id the no-JS fallback shares with the
markup around it goes unreported; Nu reads the page whole and catches it.

html-validate keeps the seat in `npm run test:e2e`, where the check runs on every change
and should not need Java or nix.

### Never bend the site to a linter

Hugo's rule, in his words: never downgrade or remove a progressive enhancement because a
tool says it is not valid.

Every message these checks ignore is listed with a reason, in `NU_IGNORED` and the two
configs at the top of `audit/markup.ts`. If a check ever flags something the site does on
purpose, add a line there saying why. Do not change the page or the stylesheet to satisfy
a tool.

Nu's CSS half is the old W3C CSS validator and it is years behind: it calls `anchor-name`
a parse error. All of its `CSS:` messages are ignored for that reason and stylelint checks
the CSS instead.

stylelint earns its place. Version 17.15, September 2026, reads properties and values
through css-tree 3.2 and mdn-data 2.27 with the csstools syntax patches on top. Measured
against this build it flags none of `anchor()`, `sign()`, `::scroll-marker`, `@container`,
`@property`, `:has()`, `text-wrap: balance`, `light-dark()`, `@starting-style`,
`overflow: clip`, relative colours, nesting, `field-sizing`, view transitions or
scroll-driven animations, and it still catches misspelt properties, bad units, invalid hex
and duplicate declarations. The one rule that misfires, `selector-type-no-unknown` reading
`::scroll-button(right)` as an element called `right`, is off. Keep stylelint current and
rerun that list after an upgrade.
