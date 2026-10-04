import path from 'node:path';

/**
 * Rolldown splits the code the page's `<script>` entries share into one chunk per set of
 * importers, 17 small files on the home page, each its own request before first paint
 * (they are modulepreloaded). Every entry runs on page load, so the browser fetches all
 * of them anyway: this puts every module an entry statically imports, and that anything
 * besides that one entry also imports, into a single `shared` chunk. Code only one entry
 * uses stays in that entry, and code only the lazy demo chunks reach stays lazy.
 * Rolldown keeps its CommonJS interop runtime out of every group, so once the bundle is
 * written this moves it into `shared` too and points its importers there.
 */
export const sharedChunk = () => {
  /** @type {Set<string>} */
  const shared = new Set();
  let runtimeCode = '';

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
    renderChunk(code, chunk) {
      if (chunk.name === 'rolldown-runtime') runtimeCode = code;
    },
    augmentChunkHash(chunk) {
      if (chunk.name === 'shared') return runtimeCode;
    },
    generateBundle(_options, bundle) {
      const chunks = Object.values(bundle).filter((item) => item.type === 'chunk');
      const runtime = chunks.find((chunk) => chunk.name === 'rolldown-runtime');
      const host = chunks.find((chunk) => chunk.name === 'shared');
      if (!runtime || !host) return;
      if (host.imports.length > 0) {
        this.warn(`the shared chunk imports ${host.imports.join(', ')}, so the rolldown runtime stays its own chunk`);
        return;
      }
      const exported = runtime.code.match(/export\s*\{([^}]*)\};?\s*$/);
      if (!exported) {
        this.warn('no export list at the end of the rolldown runtime chunk, so it stays its own chunk');
        return;
      }
      const alias = (name) => `__rolldown_runtime_${name}`;
      const pairs = exported[1].split(',').map((spec) => spec.trim().split(/\s+as\s+/)).map(([local, name = local]) => [local, name]);
      const body = runtime.code.slice(0, exported.index);
      const returned = pairs.map(([local, name]) => `${name}:${local}`).join(',');
      const bound = pairs.map(([, name]) => `${name}:${alias(name)}`).join(',');
      const reexported = pairs.map(([, name]) => alias(name)).join(',');
      host.code += `\nconst{${bound}}=(()=>{${body}return{${returned}}})();export{${reexported}};\n`;
      const runtimeBase = path.basename(runtime.fileName);
      const hostBase = path.basename(host.fileName);
      const named = new RegExp(`import\\s*\\{([^}]*)\\}\\s*from\\s*(["'])\\./${escape(runtimeBase)}\\2`, 'g');
      for (const chunk of chunks) {
        if (chunk === runtime) continue;
        chunk.code = chunk.code
          .replace(named, (_, specs, quote) => {
            const renamed = specs.split(',').map((spec) => spec.trim().split(/\s+as\s+/)).map(([name, local = name]) => `${alias(name)} as ${local}`);
            return `import{${renamed.join(',')}}from${quote}./${hostBase}${quote}`;
          })
          .replaceAll(`./${runtimeBase}`, `./${hostBase}`)
          .replaceAll(runtime.fileName, host.fileName);
        if (chunk.imports.includes(runtime.fileName)) {
          chunk.imports = [...new Set(chunk.imports.map((name) => (name === runtime.fileName ? host.fileName : name)))];
        }
      }
      delete bundle[runtime.fileName];
    },
  };
};

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
