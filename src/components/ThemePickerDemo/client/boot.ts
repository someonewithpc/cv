export async function boot(host: HTMLElement) {
  const { initThemePickerDemo } = await import('./themePickerDemo');
  initThemePickerDemo(host);
}
