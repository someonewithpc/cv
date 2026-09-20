const IDLE_BORDER_COLOR = '#bbb'; // Keep in sync with $status-border-idle in src/scss/_statusBorder.scss

/** The status-border mixin's three properties; a conic gradient only animates through
    registered ones. Registered from JS so every island that draws the ring shares one
    registration, and safe to call more than once. */
export function registerStatusBorderProperties() {
  [
    {
      name: '--status-border-colored-width',
      syntax: '<angle>',
      inherits: false,
      initialValue: '1turn',
    },
    {
      name: '--status-border-color',
      syntax: '<color>',
      inherits: false,
      initialValue: IDLE_BORDER_COLOR,
    },
    {
      name: '--status-border-start',
      syntax: '<angle>',
      inherits: false,
      initialValue: '0turn',
    },
  ].forEach((property) => {
    try {
      CSS.registerProperty(property as PropertyDefinition);
    } catch {
      // Already registered
    }
  });
}
