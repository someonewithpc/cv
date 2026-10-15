import { installReactRefresh } from '@/client/reactRefresh';

export async function boot(host: HTMLElement) {
  await installReactRefresh();

  const [{ createElement }, { createRoot }, { default: EditStyleApp }] = await Promise.all([
    import('react'),
    import('react-dom/client'),
    import('../picker/EditStyleApp'),
  ]);

  host.querySelector('.boot-placeholder')?.remove();
  createRoot(host).render(createElement(EditStyleApp));
}
