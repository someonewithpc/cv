export async function boot(host: HTMLElement) {
  const root = host.querySelector<HTMLElement>('.synthetic-tool[data-live]');
  if (!root) return;

  const { initSyntheticProperties } = await import('./syntheticProperties');
  initSyntheticProperties(host, root);
}
