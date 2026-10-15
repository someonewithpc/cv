import { installReactRefresh } from '@/client/reactRefresh';

export async function boot(host: HTMLElement) {
  await installReactRefresh();

  const [{ createElement }, { createRoot }, { default: HeldControlsApp }] = await Promise.all([
    import('react'),
    import('react-dom/client'),
    import('../picker/HeldControlsApp'),
  ]);

  host.querySelector('.boot-placeholder')?.remove();
  createRoot(host).render(createElement(HeldControlsApp));
}
