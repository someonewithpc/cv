/**
 * Rolldown splits the code the page's `<script>` entries share into one chunk per set of
 * importers, 17 small files on the home page, each its own request before first paint
 * (they are modulepreloaded). Every entry runs on page load, so the browser fetches all
 * of them anyway: this puts every module an entry statically imports, and that anything
 * besides that one entry also imports, into a single `shared` chunk. Code only one entry
 * uses stays in that entry, and code only the lazy demo chunks reach stays lazy.
 */
export const sharedChunk = () => {
  /** @type {Set<string>} */
  const shared = new Set();

  /** @type {import('vite').Plugin} */
  return {
    name: 'shared-chunk',
    apply: 'build',
    applyToEnvironment: (environment) => environment.name === 'client',
    configEnvironment(name) {
      if (name !== 'client') return;
      return { build: { rolldownOptions: { output: { codeSplitting: { groups: [{ name: 'shared', test: (id) => shared.has(id) }] } } } } };
    },
    buildEnd() {
      /** @type {Map<string, Set<string>>} script entry id -> modules it statically imports, transitively */
      const closures = new Map();
      for (const id of this.getModuleIds()) {
        if (!this.getModuleInfo(id)?.isEntry || !/[?&]type=script/.test(id)) continue;
        const seen = new Set();
        const walk = (module) => {
          for (const dep of this.getModuleInfo(module)?.importedIds ?? []) {
            if (seen.has(dep)) continue;
            seen.add(dep);
            walk(dep);
          }
        };
        walk(id);
        closures.set(id, seen);
      }
      for (const [entry, seen] of closures) {
        for (const module of seen) {
          if (shared.has(module)) continue;
          const info = this.getModuleInfo(module);
          const importers = [...(info?.importers ?? []), ...(info?.dynamicImporters ?? [])];
          if (importers.some((importer) => importer !== entry && !seen.has(importer))) shared.add(module);
        }
      }
      this.info(`${shared.size} modules in the shared chunk`);
    },
  };
};
