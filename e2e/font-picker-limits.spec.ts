import { expect, test } from '@playwright/test';

import { cssString, unquoteCssString } from '../src/components/FontPickerDemo/picker/cssString';
import { render } from '../src/components/FontPickerDemo/picker/fontOverride';

// The picker's own modules, run in the test process: the CSS they write is parsed by the
// browser

const HOSTILE = [
  `Evil'; } body { display: none } .x { font-family: '`,
  `Evil"; } body { display: none } /*`,
  'Back\\slash {brace} ; semi',
  'Line\nbreak</style><style>body{display:none}',
];

test('a family name with quotes, braces and semicolons stays inside its font-family rule', async ({ page }) => {
  for (const family of HOSTILE) {
    expect(unquoteCssString(cssString(family))).toBe(family);

    const css = render({ family, style: 'normal', size: 1, weight: null }, {});
    const parsed = await page.evaluate((text) => {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(text);
      return [...sheet.cssRules].map((rule) => ({
        selector: (rule as CSSStyleRule).selectorText,
        fontFamily: (rule as CSSStyleRule).style.getPropertyValue('font-family'),
      }));
    }, css);

    expect(parsed).toHaveLength(1);
    expect(parsed[0].selector).toBe('[data-font-picker-island] .edit-style');
    expect(unquoteCssString(parsed[0].fontFamily.replace(/, sans-serif$/, ''))).toBe(family);
  }
});

