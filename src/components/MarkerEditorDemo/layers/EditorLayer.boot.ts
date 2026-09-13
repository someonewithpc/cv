export async function boot(host: HTMLElement) {
  if (import.meta.hot) {
    // Vite virtual module — only exists in dev. Needed before EditorLayerApp loads so its
    // Fast Refresh registrations land on an already-instrumented root.
    // @ts-expect-error
    const RefreshRuntime = (await import('/@react-refresh')).default;
    RefreshRuntime.injectIntoGlobalHook(window);
    // @ts-expect-error Vite React refresh globals
    window.$RefreshReg$ = () => {};
    // @ts-expect-error Vite React refresh globals
    window.$RefreshSig$ = () => (type: unknown) => type;
    // @ts-expect-error Vite React refresh globals
    window.__vite_plugin_react_preamble_installed__ = true;
  }

  const [{ createElement }, { createRoot }, { default: EditorLayerApp }] = await Promise.all([
    import('react'),
    import('react-dom/client'),
    import('./EditorLayerApp'),
  ]);

  // Always mount the shell — visibility / singleton handoff live inside the app so we
  // don't depend on IntersectionObserver surviving async import latency.
  createRoot(host).render(createElement(EditorLayerApp));
}
