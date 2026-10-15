import { installReactRefresh } from '@/client/reactRefresh';

export async function boot(host: HTMLElement) {
  await installReactRefresh();

  const [{ createElement }, { createRoot }, { default: EditorLayerApp }] = await Promise.all([
    import('react'),
    import('react-dom/client'),
    import('./EditorLayerApp'),
  ]);

  // Always mount the shell — visibility / singleton handoff live inside the app so we
  // don't depend on IntersectionObserver surviving async import latency.
  createRoot(host).render(createElement(EditorLayerApp));
}
