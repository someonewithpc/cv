export async function boot(host: HTMLElement) {
  // Yield so other work can finish a frame before Vue+Three parse.
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });

  const [{ createApp }, { default: ParametersSceneApp }] = await Promise.all([
    import('vue'),
    import('../MockScene/ParametersSceneApp.vue'),
  ]);

  const app = createApp(ParametersSceneApp);
  app.mount(host);
  host.querySelector('.boot-placeholder')?.remove();
}
