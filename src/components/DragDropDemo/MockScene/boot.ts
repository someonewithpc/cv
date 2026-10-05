export async function boot(host: HTMLElement) {
  // Yield so other work can finish a frame before Vue+Three parse.
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });

  const [{ createApp }, { default: DragDropSceneApp }] = await Promise.all([
    import('vue'),
    import('./DragDropSceneApp.vue'),
  ]);

  const app = createApp(DragDropSceneApp);
  // useId() ids are per app; both scene apps share a page.
  app.config.idPrefix = 'drag-drop';
  app.mount(host);
  host.querySelector('.boot-placeholder')?.remove();
}
