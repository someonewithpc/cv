// @ts-check
import path from "path";

import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';
import vue from '@astrojs/vue';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { defineConfig } from 'astro/config';
import icon from 'astro-icon';

import { httpToHttpsRedirect } from './plugins/httpToHttpsRedirect.mjs';

// https://astro.build/config
export default defineConfig({
  adapter: cloudflare({
    // astro-icon → @iconify/utils needs Node (tty, etc.) during prerender/dev
    prerenderEnvironment: 'node',
  }),
  compressHTML: true,
  server: {
    host: true,
    allowedHosts: true,
  },
  // No Astro.session usage — drop session runtime + Cloudflare SESSION KV wiring
  session: false,
  integrations: [
    react(),
    vue(),
    icon({
      include: {
        lucide: ['external-link', 'plus', 'upload', 'x'],
      },
      // Keep gradient/filter IDs unique across inlined icons (SVGO's cleanupIds
      // collapses every icon to a/b/c and they steal each other's fills).
      svgoOptions: {
        plugins: [
          {
            name: 'preset-default',
            params: {
              overrides: {
                cleanupIds: false,
              },
            },
          },
        ],
      },
    }),
  ],

  vite: {
    plugins: [basicSsl(), httpToHttpsRedirect()],
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'react-dom/client',
        'react/jsx-runtime',
        'react/jsx-dev-runtime',
        '@astrojs/react/client.js',
        '@reduxjs/toolkit',
        'react-redux',
        'redux-undo',
        'uuid',
        'classnames',
        'lodash-es',
        'lodash-es/chunk',
        'lodash-es/startCase',
        'lodash-es/partition',
        'lodash-es/camelCase',
        'lodash-es/snakeCase',
        'lodash-es/throttle',
        'lodash-es/clamp',
        'path-data-polyfill',
        '@fortawesome/react-fontawesome',
        '@fortawesome/fontawesome-svg-core',
        '@fortawesome/free-solid-svg-icons',
        '@fortawesome/free-regular-svg-icons',
        'vue',
        '@astrojs/vue/client.js',
        'three',
        // Deep three/addons imports — discover-on-demand leaves stale hashed
        // entries in .vite/deps after HMR/re-optimize (browser keeps old ?v=).
        'three/addons/loaders/GLTFLoader.js',
        'three/addons/renderers/CSS2DRenderer.js',
        'three/addons/libs/meshopt_decoder.module.js',
      ],
    },
    server: {
      // Compile Space Builder islands before the carousel scroll hits them —
      // first visit used to race Vite discovery and look like a full reload.
      warmup: {
        clientFiles: [
          './src/components/SpaceBuilderDemo/MockScene/MockSceneApp.vue',
          './src/components/SpaceBuilderDemo/MockScene/PlaceSceneApp.vue',
          './src/components/SpaceBuilderDemo/MockScene/ParametersSceneApp.vue',
          './src/components/SpaceBuilderDemo/MockScene/LayoutsSceneApp.vue',
          './src/components/SpaceBuilderDemo/MockScene/BadgeSceneApp.vue',
          './src/components/SpaceBuilderDemo/MockScene/DnDSceneApp.vue',
          './src/components/SpaceBuilderDemo/MockScene/scene/SpaceBuilderScene.ts',
        ],
      },
    },
    build: {
      // Space Builder ships Three.js (~600KiB min) behind an intersection-gated
      // dynamic import — over the default 500KiB tip, but not on the critical path.
      chunkSizeWarningLimit: 700,
    },
    resolve: {
      dedupe: ['react', 'react-dom', 'vue'],
      alias: [
        // Deep paths (`lodash/startCase`) must rewrite too — a bare `lodash`
        // alias only covers the package root.
        { find: /^lodash$/, replacement: 'lodash-es' },
        { find: /^lodash\/(.+)$/, replacement: 'lodash-es/$1' },
        // Only `@/…` — a bare `@` would also match scoped pkgs like `@astrojs`.
        {
          find: /^@\//,
          replacement: `${path.resolve(import.meta.dirname, './src')}/`,
        },
      ],
    },
  },
});
