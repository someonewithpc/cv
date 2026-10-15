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
const base = {
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

// Sass and the <style lang="scss"> blocks in .astro and .vue are parsed with the syntax
// that reads them. The recommended rules take Sass at-rules and :global() for unknown, so
// those are named here instead of switching the rules off.
const sassAtRules = ['use', 'forward', 'mixin', 'include', 'function', 'return', 'if', 'else', 'each', 'for', 'while', 'at-root', 'content', 'debug', 'warn', 'error', 'extend'];

// These rules read the value, prelude or selector as plain CSS, so a Sass variable, a
// function call such as fs(0.5), an interpolation such as #{$id} or a mixin signature is
// "unknown" or "invalid" to them although it compiles to valid CSS. Stylelint cannot
// evaluate Sass, so these stay off for source files. Property
// names, units, hex colours and the rest of the recommended rules stay on.
const sassBlind = {
  'at-rule-prelude-no-invalid': null,
  'media-query-no-invalid': null,
  'declaration-property-value-no-unknown': null,
  // A partial is nested under its includer's selector, so the & has a root once compiled.
  'nesting-selector-no-missing-scoping-root': null,
};

export default {
  // postcss-html reads <style is:global set:html={css} /> and <style set:html={css}></style>
  // as a style element with no end, or an empty one, because the CSS is a build-time string
  // and not source in the file.
  ignoreFiles: ['src/pages/index.astro', 'src/components/ThemePickerDemo/layers/PickerLayer.astro'],
  ...base,
  rules: base.rules,
  overrides: [
    {
      files: ['**/*.scss'],
      customSyntax: 'postcss-scss',
      rules: {
        'at-rule-no-unknown': [true, { ignoreAtRules: sassAtRules }],
        'selector-pseudo-class-no-unknown': [true, { ignorePseudoClasses: ['target-current', 'global', 'deep'] }],
        ...sassBlind,
      },
    },
    {
      files: ['**/*.astro', '**/*.vue'],
      customSyntax: 'postcss-html',
      rules: {
        'at-rule-no-unknown': [true, { ignoreAtRules: sassAtRules }],
        'selector-pseudo-class-no-unknown': [true, { ignorePseudoClasses: ['target-current', 'global', 'deep'] }],
        ...sassBlind,
      },
    },
  ],
};
