const IDLE_BORDER_COLOR = '#bbb'; // Keep in sync with $idle-border-color in _fontSettingsFieldset.scss

// Registered from JS rather than with @property so the picker island and the
// blueprint layer that reuses the border animation share one registration path
export function registerFontSettingsProperties() {
  [
    {
      name: '--font-settings-border-colored-width',
      syntax: '<angle>',
      inherits: false,
      initialValue: '1turn',
    },
    {
      name: '--font-settings-border-color',
      syntax: '<color>',
      inherits: false,
      initialValue: IDLE_BORDER_COLOR,
    },
    {
      name: '--font-settings-border-start',
      syntax: '<angle>',
      inherits: false,
      initialValue: '0turn',
    },
  ].forEach((p) => {
    try {
      CSS.registerProperty(p as PropertyDefinition);
    } catch {
      // Already registered — this runs once per module that imports it
    }
  });
}
