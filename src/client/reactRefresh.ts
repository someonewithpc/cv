/**
 * Vite's React Fast Refresh runtime, which exists only in dev. It has to be on the page before
 * an island's app modules load, so their registrations land on an already-instrumented root.
 */
export async function installReactRefresh() {
  if (!import.meta.hot) return;
  // @ts-expect-error Vite virtual module
  const RefreshRuntime = (await import('/@react-refresh')).default;
  RefreshRuntime.injectIntoGlobalHook(window);
  // @ts-expect-error Vite React refresh globals
  window.$RefreshReg$ = () => {};
  // @ts-expect-error Vite React refresh globals
  window.$RefreshSig$ = () => (type: unknown) => type;
  // @ts-expect-error Vite React refresh globals
  window.__vite_plugin_react_preamble_installed__ = true;
}
