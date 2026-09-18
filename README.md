# Hugo Sales's CV and Portfolio

## Audits

`npm run test:audit` builds the site, serves the build on port 4311 and runs four checks
over it. It takes about a minute and a half, so run it when you want it rather than on
every change. `AUDIT_PORT` moves the server if 4311 is taken.

- HTML, with [html-validate](https://html-validate.org/) over `dist/client`. It stands in
  for the W3C Nu checker, which needs Java. It reads content models, attribute values and
  duplicate ids. It does not look inside `<svg>`, and it checks each `<noscript>` block as
  a document of its own, so an id the no-JS fallback shares with the markup around it goes
  unreported.
- CSS, with [stylelint](https://stylelint.io/)'s recommended rules over the built
  stylesheets and the inline `<style>` blocks. It catches parse errors, unknown properties
  and unknown at-rules. It does not check a property's value against its grammar.
- Accessibility, with axe-core through Playwright: 1440x900 and 390x844, each of the four
  themes, no violations.
- Performance, with Lighthouse driving the system Chrome over the same build. Performance,
  accessibility, best practices and SEO each have a floor measured on main. The report
  lands in `audit-report/lighthouse.html`.

The rules those two linters have switched off, and why, are at the top of
`audit/markup.ts`.

`npm run test:e2e` runs the HTML and CSS checks as well. They take under a second and read
the build that suite already makes. The axe and Lighthouse runs stay out of it.
