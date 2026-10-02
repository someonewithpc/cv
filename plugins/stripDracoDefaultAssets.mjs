// SpaceBuilderScene always calls DRACOLoader#setDecoderPath() with the public/
// copy before any decode runs (see MockScene/scene/SpaceBuilderScene.ts), so
// three's own default decoder paths never serve a request. Those defaults are
// still built from `new URL('../libs/draco/...', import.meta.url)` at module
// scope, and Vite's asset-url plugin bundles whatever such a call points at
// whether or not the value is read. Left alone that ships five dead files: the
// JS-only decoder fallback (719 KB) and two wasm/wrapper pairs, one of them
// byte-identical to the public/ copy (issue #220 P2).
//
// This swaps the five `new URL(...)` calls for empty strings before Vite's
// own transform runs, so nothing is left for it to pick up. The match is
// exact so a three.js upgrade that reshapes this file fails the build loudly
// instead of quietly letting the dead assets back in.

const TARGET = 'examples/jsm/loaders/DRACOLoader.js';

const OLD = `const WASM_BIN_URL = new URL( '../libs/draco/draco_decoder.wasm', import.meta.url ).toString();
const WASM_JS_URL = new URL( '../libs/draco/draco_wasm_wrapper.js', import.meta.url ).toString();
const JS_URL = new URL( '../libs/draco/draco_decoder.js', import.meta.url ).toString();

const DRACO_GLTF_CONFIG = {
	js: new URL( '../libs/draco/gltf/draco_wasm_wrapper.js', import.meta.url ).toString(),
	wasm: new URL( '../libs/draco/gltf/draco_decoder.wasm', import.meta.url ).toString(),
};`;

const NEW = `const WASM_BIN_URL = '';
const WASM_JS_URL = '';
const JS_URL = '';

const DRACO_GLTF_CONFIG = {
	js: '',
	wasm: '',
};`;

export function stripDracoDefaultAssets() {
  return {
    name: 'cv:strip-draco-default-assets',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith(TARGET)) return null;
      if (!code.includes(OLD)) {
        throw new Error(
          'stripDracoDefaultAssets: three/examples/jsm/loaders/DRACOLoader.js no longer ' +
            'matches the expected source (three.js upgrade?) — update plugins/stripDracoDefaultAssets.mjs',
        );
      }
      return code.replace(OLD, NEW);
    },
  };
}
