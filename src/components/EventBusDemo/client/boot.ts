export async function boot(host: HTMLElement) {
  const root = host.querySelector<HTMLElement>('.event-bus[data-live]');
  if (!root) return;

  const { initEventBus } = await import('./eventBus');
  initEventBus(host, root);
}
