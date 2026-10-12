/**
 * Modules under markers/, hooks/, and lib/ are ported from interactive-map and
 * must only load on the client (via MockMapApp's dynamic import).
 */
if (import.meta.env.SSR) {
  throw new Error('MarkerEditorDemo ported modules are client-only');
}
