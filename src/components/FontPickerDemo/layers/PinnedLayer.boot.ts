export async function boot(host: HTMLElement) {
  if (import.meta.hot) {
    // Vite virtual module, dev only: the Fast Refresh runtime has to be on the page before
    // the app's modules register with it
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

  const [{ createElement }, { createRoot }, { default: HeldControlsApp }] = await Promise.all([
    import('react'),
    import('react-dom/client'),
    import('../picker/HeldControlsApp'),
  ]);

  host.querySelector('.boot-placeholder')?.remove();
  createRoot(host).render(createElement(HeldControlsApp));
}
