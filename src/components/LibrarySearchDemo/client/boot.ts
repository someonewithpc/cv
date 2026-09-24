export async function boot(host: HTMLElement) {
  switch (host.dataset.librarySearch) {
    case 'search': {
      const root = host.querySelector<HTMLElement>('.library-search[data-live]');
      if (!root) return;
      const { initLibrarySearch } = await import('./librarySearch');
      initLibrarySearch(host, root);
      return;
    }
    case 'relevance':
    case 'sql': {
      const { initQuerySheet } = await import('./querySheet');
      initQuerySheet(host);
      return;
    }
  }
}
