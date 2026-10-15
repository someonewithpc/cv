import { installReactRefresh } from '@/client/reactRefresh';

export async function boot(host: HTMLElement) {
  const mount = host.querySelector<HTMLElement>('[data-mock-map-island]');
  if (!mount) return;

  await installReactRefresh();

  const [{ createElement }, { createRoot }, { default: MockMapApp }] = await Promise.all([
    import('react'),
    import('react-dom/client'),
    import('./MockMapApp'),
  ]);

  createRoot(mount).render(createElement(MockMapApp));
}
