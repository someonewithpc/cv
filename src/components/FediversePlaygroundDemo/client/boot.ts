export async function boot(host: HTMLElement) {
  const { initPlayground } = await import('./playground');
  initPlayground(host);
}
