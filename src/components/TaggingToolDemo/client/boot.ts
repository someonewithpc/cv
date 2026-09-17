export async function boot(host: HTMLElement) {
  const root = host.querySelector<HTMLElement>('.tagging-tool[data-live]');
  if (!root) return;

  const { initTaggingTool } = await import('./taggingTool');
  initTaggingTool(root, host.dataset.autoplayValue ?? '');
}
